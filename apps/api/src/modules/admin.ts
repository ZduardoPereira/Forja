/**
 * Ferramentas do administrador: painel do servidor, aviso para o grupo, notificações de
 * teste, conferir rankings na hora e corrigir os dias de atividade de alguém.
 * (Senha temporária, remover pessoa e tornar administrador ficam em modules/account.ts.)
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { addDays, adminActivitySchema, announcementSchema, RANKING_BOARDS } from '@forja/shared';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import { badRequest, notFound } from '../http/errors';
import type { RouteRegistry } from '../http/registry';
import { afterActivity, streakOf, todayIn } from '../services/activity';
import { getMeta } from '../services/meta';
import { notify } from '../services/notify';
import { checkLeaders, queueLeaderCheck } from '../services/rankings';
import { VERSION } from '../version';

async function folderSize(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += await folderSize(p);
    else total += (await stat(p).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

/** Último backup feito pelo supervisor do PC (tools/host), se o servidor roda assim. */
async function lastBackup(): Promise<{ name: string; sizeBytes: number; at: string } | null> {
  const dir = process.env.BACKUP_DIR;
  if (!dir) return null;
  try {
    const name = (await readdir(dir)).filter((f) => /^forja-\d{4}-\d{2}-\d{2}_\d{4}\.zip$/.test(f)).sort().at(-1);
    if (!name) return null;
    const st = await stat(path.join(dir, name));
    return { name, sizeBytes: st.size, at: st.mtime.toISOString() };
  } catch {
    return null;
  }
}

const TEST_NOTIFICATIONS = {
  simple: { category: 'group', title: '🔔 Teste de notificação', body: 'Se você está vendo isto, as notificações estão funcionando.', url: '/notificacoes' },
  leader_gain: { category: 'ranking', title: '🏆 Você é o 1º lugar em Sequência! (teste)', body: 'Assim chega o aviso quando você assume a liderança de um ranking.', url: '/ranking?board=streak' },
  leader_loss: { category: 'ranking', title: 'Você perdeu o 1º lugar em Atributos físicos (teste)', body: 'Assim chega o aviso quando alguém passa você no ranking.', url: '/ranking?board=physical' },
  streak_reminder: { category: 'streak', title: '🔥 Sua sequência acaba à meia-noite (teste)', body: 'Assim chega o lembrete das 20h para quem ainda não marcou atividade.', url: '/' },
  event: { category: 'events', title: '📅 Treino marcado (teste)', body: 'Assim chega o aviso de treino novo, mudado, cancelado ou começando em 1 hora.', url: '/treinar' },
} as const;

export function adminRoutes(r: RouteRegistry) {
  r.add({
    method: 'get',
    path: '/admin/overview',
    tag: 'Administração',
    summary: 'Painel do servidor: versão, números do grupo, espaço em disco e último backup',
    access: 'admin',
    handler: async ({ deps }) => {
      const c = (t: Parameters<typeof deps.db.$count>[0]) => deps.db.$count(t);
      const dbBytes =
        deps.config.pgliteDir != null
          ? await folderSize(deps.config.pgliteDir)
          : Number((await deps.db.execute(sql`select pg_database_size(current_database()) as size`)).rows[0]?.size ?? 0);
      const leaders = Object.fromEntries(await Promise.all(RANKING_BOARDS.map(async (b) => [b, (await getMeta(deps.db, `leader:${b}`)) || null])));
      return {
        version: VERSION,
        node: process.version,
        uptimeSec: Math.round(process.uptime()),
        now: deps.now(),
        today: todayIn(deps),
        timezone: deps.config.TIMEZONE,
        publicUrl: deps.config.publicUrl,
        counts: {
          members: await c(s.users),
          activities: await c(s.workoutLogs),
          sessions: await deps.db.$count(s.workoutLogs, eq(s.workoutLogs.source, 'session')),
          tests: await c(s.testResults),
          weighIns: await c(s.weighIns),
          events: await c(s.events),
          chatMessages: await c(s.chatMessages),
          photos: await c(s.files),
          notifications: await c(s.notifications),
          pushDevices: await c(s.pushSubscriptions),
        },
        storage: { dbBytes, uploadsBytes: await folderSize(deps.config.uploadsDir) },
        backup: await lastBackup(),
        leaders,
      };
    },
  });

  r.add({
    method: 'post',
    path: '/admin/announce',
    tag: 'Administração',
    summary: 'Aviso do administrador para o grupo todo (notificação)',
    access: 'admin',
    body: announcementSchema,
    handler: async ({ deps, user, body }) => {
      const rows = await notify(deps, { to: 'all', category: 'group', kind: 'admin.announce', title: `📣 ${body.title}`, body: body.body, url: '/notificacoes', actorId: user.id });
      return { sent: rows.length };
    },
  });

  r.add({
    method: 'post',
    path: '/admin/test-notification',
    tag: 'Administração',
    summary: 'Mandar para mim um exemplo de cada tipo de notificação',
    access: 'admin',
    body: z.object({ type: z.enum(Object.keys(TEST_NOTIFICATIONS) as [keyof typeof TEST_NOTIFICATIONS]) }),
    handler: async ({ deps, user, body }) => {
      const t = TEST_NOTIFICATIONS[body.type];
      // Teste ignora as preferências: o push sai mesmo com a categoria desligada.
      await notify(deps, { to: [user.id], category: t.category, kind: `test.${body.type}`, title: t.title, body: t.body, url: t.url, push: false });
      await deps.push.send([user.id], { title: t.title, body: t.body, url: t.url, tag: `test-${body.type}` });
      const devices = await deps.db.$count(s.pushSubscriptions, eq(s.pushSubscriptions.userId, user.id));
      return { ok: true, devices };
    },
  });

  r.add({
    method: 'post',
    path: '/admin/rankings/check',
    tag: 'Administração',
    summary: 'Conferir os líderes dos rankings agora (avisa se alguém assumiu o 1º lugar)',
    access: 'admin',
    handler: async ({ deps }) => ({ leaders: await checkLeaders(deps) }),
  });

  r.add({
    method: 'get',
    path: '/admin/members/:id/activity',
    tag: 'Administração',
    summary: 'Atividades de alguém nos últimos 60 dias (para corrigir a sequência)',
    access: 'admin',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, params }) => {
      const [u] = await deps.db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(eq(s.users.id, params.id));
      if (!u) throw notFound('Pessoa');
      const today = todayIn(deps);
      const logs = await deps.db
        .select({ id: s.workoutLogs.id, date: s.workoutLogs.date, kind: s.workoutLogs.kind, source: s.workoutLogs.source, title: s.workoutLogs.title, durationMin: s.workoutLogs.durationMin, notes: s.workoutLogs.notes })
        .from(s.workoutLogs)
        .where(and(eq(s.workoutLogs.userId, u.id), gte(s.workoutLogs.date, addDays(today, -60))))
        .orderBy(desc(s.workoutLogs.date), desc(s.workoutLogs.createdAt));
      return { user: u, streak: await streakOf(deps, u.id, today), logs };
    },
  });

  r.add({
    method: 'post',
    path: '/admin/members/:id/activity',
    tag: 'Administração',
    summary: 'Marcar atividade num dia para alguém (corrige a sequência; qualquer data até hoje)',
    access: 'admin',
    status: 201,
    params: z.object({ id: z.uuid() }),
    body: adminActivitySchema,
    handler: async ({ deps, user, params, body }) => {
      const [u] = await deps.db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, params.id));
      if (!u) throw notFound('Pessoa');
      if (body.date > todayIn(deps)) throw badRequest('Não dá para marcar atividade no futuro');
      const before = await streakOf(deps, u.id);
      const [row] = await deps.db
        .insert(s.workoutLogs)
        .values({ userId: u.id, date: body.date, kind: body.kind, source: 'admin', notes: body.notes ?? `Corrigido por um administrador`, title: null })
        .returning();
      await afterActivity(deps, u.id, before);
      void queueLeaderCheck(deps);
      deps.logger.info({ admin: user.id, member: u.id, date: body.date }, 'atividade corrigida pelo administrador');
      return row;
    },
  });

  r.add({
    method: 'delete',
    path: '/admin/logs/:id',
    tag: 'Administração',
    summary: 'Apagar a atividade de alguém (corrige a sequência)',
    access: 'admin',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, params }) => {
      const rows = await deps.db.delete(s.workoutLogs).where(eq(s.workoutLogs.id, params.id)).returning({ userId: s.workoutLogs.userId });
      if (!rows.length) throw notFound('Atividade');
      deps.realtime.broadcast({ type: 'activity.updated', userId: rows[0]!.userId });
      void queueLeaderCheck(deps);
      return undefined;
    },
  });
}
