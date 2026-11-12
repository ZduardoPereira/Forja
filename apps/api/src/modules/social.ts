import { computeStreak, mergePrefs, notifyPrefsSchema, pushSubscriptionSchema, RANKING_BOARDS, recentDays } from '@forja/shared';
import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import { notFound } from '../http/errors';
import type { RouteRegistry } from '../http/registry';
import { activityByUser, todayIn } from '../services/activity';
import { getMeta } from '../services/meta';
import { notificationView } from '../services/notify';
import { publicUser } from '../services/people';
import { computeRankings } from '../services/rankings';

export function socialRoutes(r: RouteRegistry) {
  // ---- Notificações (sininho) ----
  r.add({
    method: 'get',
    path: '/notifications',
    tag: 'Notificações',
    summary: 'Minhas notificações, das mais novas para as mais antigas',
    query: z.object({ before: z.iso.datetime({ offset: true }).optional(), limit: z.coerce.number().int().min(1).max(100).default(40) }),
    handler: async ({ deps, user, query }) => {
      const rows = await deps.db
        .select({ n: s.notifications, actor: { id: s.users.id, name: s.users.name, avatarFileId: s.users.avatarFileId } })
        .from(s.notifications)
        .leftJoin(s.users, eq(s.users.id, s.notifications.actorId))
        .where(and(eq(s.notifications.userId, user.id), query.before ? lt(s.notifications.createdAt, new Date(query.before)) : undefined))
        .orderBy(desc(s.notifications.createdAt))
        .limit(query.limit);
      return rows.map((x) => notificationView(deps, x.n, x.actor?.id ? x.actor : null));
    },
  });

  r.add({
    method: 'get',
    path: '/notifications/unread',
    tag: 'Notificações',
    summary: 'Quantas notificações não lidas',
    handler: async ({ deps, user }) => ({ count: await deps.db.$count(s.notifications, and(eq(s.notifications.userId, user.id), isNull(s.notifications.readAt))) }),
  });

  r.add({
    method: 'post',
    path: '/notifications/read',
    tag: 'Notificações',
    summary: 'Marcar como lidas (todas, ou só as informadas)',
    body: z.object({ ids: z.array(z.uuid()).max(200).optional() }),
    handler: async ({ deps, user, body }) => {
      await deps.db
        .update(s.notifications)
        .set({ readAt: deps.now() })
        .where(and(eq(s.notifications.userId, user.id), isNull(s.notifications.readAt), body.ids ? inArray(s.notifications.id, body.ids.length ? body.ids : ['00000000-0000-0000-0000-000000000000']) : undefined));
      return undefined;
    },
  });

  r.add({
    method: 'get',
    path: '/notifications/prefs',
    tag: 'Notificações',
    summary: 'O que chega no celular/PC e a chave pública do Web Push',
    handler: async ({ deps, user }) => {
      const [u] = await deps.db.select({ prefs: s.users.notifyPrefs }).from(s.users).where(eq(s.users.id, user.id));
      return { prefs: mergePrefs(u?.prefs), publicKey: await deps.push.publicKey(), devices: await deps.db.$count(s.pushSubscriptions, eq(s.pushSubscriptions.userId, user.id)) };
    },
  });

  r.add({
    method: 'put',
    path: '/notifications/prefs',
    tag: 'Notificações',
    summary: 'Escolher as categorias que chegam no celular/PC',
    body: notifyPrefsSchema,
    handler: async ({ deps, user, body }) => {
      const [u] = await deps.db.select({ prefs: s.users.notifyPrefs }).from(s.users).where(eq(s.users.id, user.id));
      const prefs = { ...mergePrefs(u?.prefs), ...Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v === 'boolean')) };
      await deps.db.update(s.users).set({ notifyPrefs: prefs }).where(eq(s.users.id, user.id));
      return { prefs };
    },
  });

  // ---- Web Push (aparelhos) ----
  r.add({
    method: 'post',
    path: '/push/subscriptions',
    tag: 'Notificações',
    summary: 'Receber notificações neste aparelho (navegador / app instalado pelo navegador)',
    status: 201,
    body: pushSubscriptionSchema,
    handler: async ({ deps, user, body, req }) => {
      await deps.db
        .insert(s.pushSubscriptions)
        .values({ userId: user.id, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: req.headers['user-agent']?.slice(0, 200) ?? null })
        .onConflictDoUpdate({ target: s.pushSubscriptions.endpoint, set: { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth, failures: 0 } });
      return { ok: true };
    },
  });

  r.add({
    method: 'delete',
    path: '/push/subscriptions',
    tag: 'Notificações',
    summary: 'Parar de receber neste aparelho',
    body: z.object({ endpoint: z.url().max(2000) }),
    handler: async ({ deps, user, body }) => {
      await deps.db.delete(s.pushSubscriptions).where(and(eq(s.pushSubscriptions.endpoint, body.endpoint), eq(s.pushSubscriptions.userId, user.id)));
      return undefined;
    },
  });

  r.add({
    method: 'post',
    path: '/push/test',
    tag: 'Notificações',
    summary: 'Mandar uma notificação de teste para os meus aparelhos',
    handler: async ({ deps, user }) => {
      const devices = await deps.db.$count(s.pushSubscriptions, eq(s.pushSubscriptions.userId, user.id));
      await deps.push.send([user.id], { title: '🔔 Notificações ligadas', body: 'É assim que os avisos do FORJA vão chegar neste aparelho.', url: '/notificacoes', tag: 'push-test' });
      return { devices };
    },
  });

  // ---- Atividade do dia e sequências (visível para todo o grupo) ----
  r.add({
    method: 'get',
    path: '/activity/group',
    tag: 'Atividade',
    summary: 'Quem já treinou hoje e a sequência de cada um',
    handler: async ({ deps, user }) => {
      const today = todayIn(deps);
      const users = await deps.db.select().from(s.users);
      const act = await activityByUser(deps);
      const members = users
        .map((u) => {
          const days = act.get(u.id);
          return { user: publicUser(deps, u), streak: computeStreak(days?.keys() ?? [], today), todayKinds: [...(days?.get(today) ?? [])] };
        })
        .sort((a, b) => Number(b.streak.doneToday) - Number(a.streak.doneToday) || b.streak.current - a.streak.current || a.user.name.localeCompare(b.user.name));
      return { today, me: members.find((m) => m.user.id === user.id)?.streak ?? computeStreak([], today), doneToday: members.filter((m) => m.streak.doneToday).length, members };
    },
  });

  r.add({
    method: 'get',
    path: '/activity/calendar',
    tag: 'Atividade',
    summary: 'Últimas 5 semanas de atividade de alguém (dias ativos e tipos)',
    query: z.object({ userId: z.uuid().optional(), days: z.coerce.number().int().min(7).max(371).default(35) }),
    handler: async ({ deps, user, query }) => {
      const userId = query.userId ?? user.id;
      const [u] = await deps.db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, userId));
      if (!u) throw notFound('Pessoa');
      const today = todayIn(deps);
      const days = (await activityByUser(deps, [userId])).get(userId);
      return { today, streak: computeStreak(days?.keys() ?? [], today), days: recentDays(today, query.days).map((d) => ({ date: d, kinds: [...(days?.get(d) ?? [])] })) };
    },
  });

  // ---- Rankings ----
  r.add({
    method: 'get',
    path: '/rankings',
    tag: 'Ranking',
    summary: 'Os três rankings do grupo: sequência, atributos físicos e evolução no objetivo',
    handler: async ({ deps, user }) => {
      const { today, boards } = await computeRankings(deps, user.id);
      const leaders = Object.fromEntries(await Promise.all(RANKING_BOARDS.map(async (b) => [b, (await getMeta(deps.db, `leader:${b}`)) || null])));
      const mine = Object.fromEntries(RANKING_BOARDS.map((b) => [b, boards[b].find((e) => e.user.id === user.id && e.qualifies)?.rank ?? null]));
      return { today, boards, leaders, mine };
    },
  });
}
