/**
 * Tarefas que dependem do relógio (rodam a cada minuto no servidor de verdade):
 * - lembrete 1 hora antes de cada treino marcado (para quem confirmou);
 * - às 20h, lembrete da sequência para quem ainda não marcou atividade hoje;
 * - na virada do dia: aviso de sequência zerada, conferência dos líderes e limpeza.
 * Cada tarefa diária grava em `meta` que já rodou hoje (não repete se o servidor reiniciar).
 */
import { addDays, computeStreak } from '@forja/shared';
import { and, eq, gt, inArray, isNull, lt, lte } from 'drizzle-orm';
import * as s from '../db/schema';
import type { Deps } from '../deps';
import { activityByUser, todayIn } from './activity';
import { getMeta, setMeta } from './meta';
import { notify } from './notify';
import { queueLeaderCheck } from './rankings';

const REMINDER_HOUR = 20;

function hourIn(timeZone: string, d: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(d));
}

/** Lembrete de treino marcado: para quem vai, ~1 hora antes. */
export async function eventReminders(deps: Deps): Promise<number> {
  const now = deps.now();
  const soon = await deps.db
    .select()
    .from(s.events)
    .where(and(isNull(s.events.cancelledAt), isNull(s.events.remindedAt), gt(s.events.startsAt, now), lte(s.events.startsAt, new Date(now.getTime() + 60 * 60_000))));
  let sent = 0;
  for (const e of soon) {
    await deps.db.update(s.events).set({ remindedAt: now }).where(eq(s.events.id, e.id));
    // Marcado em cima da hora: o aviso de "treino marcado" já basta.
    if (e.createdAt.getTime() > e.startsAt.getTime() - 60 * 60_000) continue;
    const going = await deps.db.select({ userId: s.eventRsvps.userId }).from(s.eventRsvps).where(and(eq(s.eventRsvps.eventId, e.id), inArray(s.eventRsvps.status, ['going', 'maybe'])));
    const rows = await notify(deps, {
      to: going.map((g) => g.userId),
      category: 'events',
      kind: 'event.reminder',
      title: `⏰ ${e.title} começa às ${e.startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: deps.config.TIMEZONE })}`,
      body: e.location ? `Local: ${e.location}. Bom treino!` : 'Bom treino!',
      url: `/events/${e.id}`,
      tag: `event:${e.id}`,
    });
    sent += rows.length;
  }
  return sent;
}

/** Às 20h: quem tem sequência viva e ainda não marcou atividade hoje. */
export async function streakReminders(deps: Deps, today = todayIn(deps)): Promise<number> {
  const activity = await activityByUser(deps);
  const users = await deps.db.select({ id: s.users.id }).from(s.users);
  let sent = 0;
  for (const u of users) {
    const st = computeStreak(activity.get(u.id)?.keys() ?? [], today);
    if (st.current < 1 || st.doneToday) continue;
    const rows = await notify(deps, {
      to: [u.id],
      category: 'streak',
      kind: 'streak.reminder',
      title: `🔥 Sua sequência de ${st.current} ${st.current === 1 ? 'dia' : 'dias'} acaba à meia-noite`,
      body: 'Ainda dá tempo: faça qualquer atividade e marque no app.',
      url: '/',
      tag: 'streak-reminder',
    });
    sent += rows.length;
  }
  return sent;
}

/** Virada do dia: avisa quem deixou a sequência zerar ontem e confere os líderes. */
export async function dailyRollover(deps: Deps, today = todayIn(deps)): Promise<number> {
  const yesterday = addDays(today, -1);
  const activity = await activityByUser(deps);
  let sent = 0;
  for (const [userId, days] of activity) {
    if (days.has(yesterday)) continue;
    const before = computeStreak(days.keys(), yesterday);
    // Estava viva até ontem (vinha de anteontem) e ontem passou em branco.
    if (before.current < 3 || !days.has(addDays(today, -2))) continue;
    const rows = await notify(deps, {
      to: [userId],
      category: 'streak',
      kind: 'streak.broken',
      title: `Sua sequência de ${before.current} dias zerou`,
      body: before.current >= before.best ? `Foi o seu recorde! Comece uma nova hoje.` : `Seu recorde é ${before.best}. Comece uma nova hoje e passe dele.`,
      url: '/',
    });
    sent += rows.length;
  }
  await deps.db.delete(s.notifications).where(lt(s.notifications.createdAt, new Date(deps.now().getTime() - 90 * 86_400_000)));
  await queueLeaderCheck(deps);
  return sent;
}

/** Roda uma vez agora (o que estiver pendente) e devolve o que fez — usado pelo relógio e pelos testes. */
export async function tick(deps: Deps): Promise<{ reminders: number; streak: number; rollover: number }> {
  const today = todayIn(deps);
  const out = { reminders: await eventReminders(deps), streak: 0, rollover: 0 };
  if ((await getMeta(deps.db, 'daily:rollover')) !== today) {
    await setMeta(deps.db, 'daily:rollover', today);
    out.rollover = await dailyRollover(deps, today);
  }
  if (hourIn(deps.config.TIMEZONE, deps.now()) >= REMINDER_HOUR && (await getMeta(deps.db, 'daily:streak-reminder')) !== today) {
    await setMeta(deps.db, 'daily:streak-reminder', today);
    out.streak = await streakReminders(deps, today);
  }
  return out;
}

export function startScheduler(deps: Deps): () => void {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      await tick(deps);
    } catch (err) {
      deps.logger.warn({ err: (err as Error).message }, 'falha nas tarefas agendadas');
    } finally {
      busy = false;
    }
  };
  const first = setTimeout(() => void run(), 15_000);
  const timer = setInterval(() => void run(), 60_000);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
