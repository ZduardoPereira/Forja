/**
 * Dias ativos e sequências. Um dia conta se tiver treino registrado (manual, do assistente
 * ou corrigido pelo administrador) ou presença confirmada num treino marcado.
 */
import { computeStreak, STREAK_MILESTONES, type StreakInfo } from '@forja/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import * as s from '../db/schema';
import type { Deps } from '../deps';
import { localDateIn } from '../modules/competitions';
import { notify } from './notify';

export const todayIn = (deps: Deps) => localDateIn(deps.config.TIMEZONE, deps.now());

/** Para cada pessoa: dia → tipos de atividade daquele dia. */
export async function activityByUser(deps: Deps, userIds?: string[]): Promise<Map<string, Map<string, Set<string>>>> {
  const out = new Map<string, Map<string, Set<string>>>();
  if (userIds && !userIds.length) return out;
  const add = (userId: string, date: string, kind: string) => {
    let days = out.get(userId);
    if (!days) out.set(userId, (days = new Map()));
    let kinds = days.get(date);
    if (!kinds) days.set(date, (kinds = new Set()));
    kinds.add(kind);
  };
  const logs = await deps.db
    .select({ userId: s.workoutLogs.userId, date: s.workoutLogs.date, kind: s.workoutLogs.kind })
    .from(s.workoutLogs)
    .where(userIds ? inArray(s.workoutLogs.userId, userIds) : undefined);
  for (const l of logs) add(l.userId, l.date, l.kind);
  const attended = await deps.db
    .select({ userId: s.eventRsvps.userId, startsAt: s.events.startsAt, kind: s.events.kind })
    .from(s.eventRsvps)
    .innerJoin(s.events, eq(s.events.id, s.eventRsvps.eventId))
    .where(and(eq(s.eventRsvps.attended, true), isNull(s.events.cancelledAt), userIds ? inArray(s.eventRsvps.userId, userIds) : undefined));
  for (const a of attended) add(a.userId, localDateIn(deps.config.TIMEZONE, a.startsAt), a.kind);
  return out;
}

export async function streakOf(deps: Deps, userId: string, today = todayIn(deps)): Promise<StreakInfo> {
  const days = (await activityByUser(deps, [userId])).get(userId);
  return computeStreak(days?.keys() ?? [], today);
}

/**
 * Depois de registrar atividade: avisa o grupo quando a sequência bate um marco
 * (3, 7, 14, 30… dias) e atualiza a tela de quem está com o app aberto.
 * `before` = sequência antes do registro (para avisar só quando ela realmente cresceu).
 */
export async function afterActivity(deps: Deps, userId: string, before: StreakInfo): Promise<StreakInfo> {
  const after = await streakOf(deps, userId);
  deps.realtime.broadcast({ type: 'activity.updated', userId });
  const milestone = after.current > before.current && (STREAK_MILESTONES as readonly number[]).includes(after.current);
  if (milestone) {
    const [u] = await deps.db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, userId));
    await notify(deps, {
      to: [userId],
      category: 'streak',
      kind: 'streak.milestone.self',
      title: `🔥 ${after.current} dias seguidos!`,
      body: after.current >= after.best ? 'É o seu recorde. Continue amanhã para aumentar.' : `Seu recorde é ${after.best} dias. Bora chegar lá!`,
      url: '/',
    });
    await notify(deps, {
      to: 'all',
      except: userId,
      category: 'group',
      kind: 'streak.milestone',
      title: `🔥 ${u?.name ?? 'Alguém'} chegou a ${after.current} dias seguidos`,
      body: 'Treinou todo dia. E você, já marcou a sua atividade hoje?',
      url: `/people/${userId}`,
      actorId: userId,
      push: false,
    });
  }
  return after;
}
