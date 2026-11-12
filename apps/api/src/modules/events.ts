import { ACTIVITY_LABELS, type ActivityKind, checkInSchema, eventSchema, rsvpSchema } from '@forja/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '../db/client';
import * as s from '../db/schema';
import type { Deps } from '../deps';
import { badRequest, forbidden, notFound } from '../http/errors';
import type { RouteRegistry } from '../http/registry';
import { postMessage } from './chat';
import { loadRoutine } from './training';
import { afterActivity, streakOf } from '../services/activity';
import { notify, whenLabel } from '../services/notify';
import { publicUser } from '../services/people';
import { queueLeaderCheck } from '../services/rankings';

/** Quem respondeu "vou" ou "talvez" (recebe os avisos de mudança e o lembrete). */
async function interested(db: DbOrTx, eventId: string): Promise<string[]> {
  const rows = await db.select({ userId: s.eventRsvps.userId }).from(s.eventRsvps).where(and(eq(s.eventRsvps.eventId, eventId), inArray(s.eventRsvps.status, ['going', 'maybe'])));
  return rows.map((r) => r.userId);
}

type EventRow = typeof s.events.$inferSelect;

async function eventViews(deps: Deps, viewerId: string, rows: EventRow[]) {
  if (!rows.length) return [];
  const ids = rows.map((e) => e.id);
  const rsvps = await deps.db
    .select({ eventId: s.eventRsvps.eventId, status: s.eventRsvps.status, attended: s.eventRsvps.attended, user: s.users })
    .from(s.eventRsvps)
    .innerJoin(s.users, eq(s.users.id, s.eventRsvps.userId))
    .where(inArray(s.eventRsvps.eventId, ids));
  const creators = await deps.db.select().from(s.users).where(inArray(s.users.id, [...new Set(rows.map((e) => e.createdBy))]));
  const rooms = await deps.db.select({ id: s.chatRooms.id, eventId: s.chatRooms.eventId }).from(s.chatRooms).where(inArray(s.chatRooms.eventId, ids));
  const routineIds = [...new Set(rows.map((e) => e.routineId).filter((x): x is string => !!x))];
  const routineNames = routineIds.length ? await deps.db.select({ id: s.routines.id, name: s.routines.name }).from(s.routines).where(inArray(s.routines.id, routineIds)) : [];
  const now = deps.now().getTime();
  return rows.map((e) => {
    const own = rsvps.filter((r) => r.eventId === e.id);
    const creator = creators.find((c) => c.id === e.createdBy);
    return {
      ...e,
      creator: creator ? publicUser(deps, creator) : null,
      routine: routineNames.find((r) => r.id === e.routineId) ?? null,
      roomId: rooms.find((r) => r.eventId === e.id)?.id ?? null,
      started: e.startsAt.getTime() <= now,
      myStatus: own.find((r) => r.user.id === viewerId)?.status ?? null,
      myAttended: own.find((r) => r.user.id === viewerId)?.attended ?? null,
      counts: { going: own.filter((r) => r.status === 'going').length, maybe: own.filter((r) => r.status === 'maybe').length },
      attendees: own.map((r) => ({ user: publicUser(deps, r.user), status: r.status, attended: r.attended })),
    };
  });
}

async function getEvent(db: DbOrTx, id: string): Promise<EventRow> {
  const [e] = await db.select().from(s.events).where(eq(s.events.id, id));
  if (!e) throw notFound('Treino');
  return e;
}

const dateLabel = (d: Date, timeZone: string) => d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone });

export function eventRoutes(r: RouteRegistry) {
  r.add({
    method: 'get',
    path: '/events',
    tag: 'Treinos marcados',
    summary: 'Próximos (ou passados) treinos do grupo',
    query: z.object({ scope: z.enum(['upcoming', 'past']).default('upcoming'), limit: z.coerce.number().int().min(1).max(100).default(30) }),
    handler: async ({ deps, user, query }) => {
      const now = deps.now();
      // "Próximos" inclui o que está acontecendo agora (até o fim da duração).
      const startedRecently = new Date(now.getTime() - 12 * 3_600_000);
      const rows =
        query.scope === 'upcoming'
          ? await deps.db.select().from(s.events).where(and(gte(s.events.startsAt, startedRecently), isNull(s.events.cancelledAt))).orderBy(asc(s.events.startsAt)).limit(query.limit)
          : await deps.db.select().from(s.events).where(lt(s.events.startsAt, now)).orderBy(desc(s.events.startsAt)).limit(query.limit);
      const views = await eventViews(deps, user.id, rows);
      return query.scope === 'upcoming' ? views.filter((e) => e.startsAt.getTime() + e.durationMin * 60_000 >= now.getTime() || !e.started) : views;
    },
  });

  r.add({
    method: 'get',
    path: '/events/:id',
    tag: 'Treinos marcados',
    summary: 'Detalhes do treino, presença e rotina',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      const e = await getEvent(deps.db, params.id);
      const [view] = await eventViews(deps, user.id, [e]);
      return { ...view, routineDetail: e.routineId ? await loadRoutine(deps.db, e.routineId) : null };
    },
  });

  r.add({
    method: 'post',
    path: '/events',
    tag: 'Treinos marcados',
    summary: 'Marcar treino (cria sala de chat e avisa o grupo)',
    status: 201,
    body: eventSchema,
    handler: async ({ deps, user, body }) => {
      if (body.routineId) {
        const routine = await loadRoutine(deps.db, body.routineId);
        if (!routine || (routine.ownerId && routine.ownerId !== user.id)) throw badRequest('Rotina inválida');
      }
      const startsAt = new Date(body.startsAt);
      if (startsAt.getTime() < deps.now().getTime() - 24 * 3_600_000) throw badRequest('Esse horário já passou');
      const event = await deps.db.transaction(async (tx) => {
        const [e] = await tx
          .insert(s.events)
          .values({ createdBy: user.id, title: body.title, description: body.description ?? null, startsAt, durationMin: body.durationMin, location: body.location ?? null, kind: body.kind, routineId: body.routineId ?? null })
          .returning();
        await tx.insert(s.eventRsvps).values({ eventId: e!.id, userId: user.id, status: 'going' });
        await tx.insert(s.chatRooms).values({ kind: 'event', eventId: e!.id, title: body.title });
        return e!;
      });
      const [group] = await deps.db.select({ id: s.chatRooms.id }).from(s.chatRooms).where(eq(s.chatRooms.kind, 'group')).limit(1);
      if (group) {
        const where = body.location ? ` em ${body.location}` : '';
        await postMessage(deps, user.id, group.id, `📅 Marquei "${body.title}" (${ACTIVITY_LABELS[body.kind as ActivityKind]}) para ${dateLabel(startsAt, deps.config.TIMEZONE)}${where}. Quem vem?`, null);
      }
      deps.realtime.broadcast({ type: 'event.updated', eventId: event.id });
      await notify(deps, {
        to: 'all',
        except: user.id,
        category: 'events',
        kind: 'event.created',
        title: `📅 ${user.name} marcou: ${body.title}`,
        body: `${whenLabel(startsAt, deps.config.TIMEZONE)}${body.location ? ` · ${body.location}` : ''}. Toque para confirmar presença.`,
        url: `/events/${event.id}`,
        actorId: user.id,
        tag: `event:${event.id}`,
      });
      const [view] = await eventViews(deps, user.id, [event]);
      return view;
    },
  });

  r.add({
    method: 'put',
    path: '/events/:id',
    tag: 'Treinos marcados',
    summary: 'Editar treino (quem marcou)',
    params: z.object({ id: z.uuid() }),
    body: eventSchema,
    handler: async ({ deps, user, params, body }) => {
      const e = await getEvent(deps.db, params.id);
      if (e.createdBy !== user.id && !user.isAdmin) throw forbidden('Só quem marcou (ou um administrador) pode editar');
      const startsAt = new Date(body.startsAt);
      const moved = startsAt.getTime() !== e.startsAt.getTime() || (body.location ?? null) !== e.location;
      const [row] = await deps.db
        .update(s.events)
        // Mudou o horário: o lembrete de 1 hora antes volta a valer.
        .set({ title: body.title, description: body.description ?? null, startsAt, durationMin: body.durationMin, location: body.location ?? null, kind: body.kind, routineId: body.routineId ?? null, ...(moved ? { remindedAt: null } : {}) })
        .where(eq(s.events.id, params.id))
        .returning();
      await deps.db.update(s.chatRooms).set({ title: body.title }).where(eq(s.chatRooms.eventId, params.id));
      deps.realtime.broadcast({ type: 'event.updated', eventId: params.id });
      if (moved && !e.cancelledAt) {
        await notify(deps, {
          to: await interested(deps.db, params.id),
          except: user.id,
          category: 'events',
          kind: 'event.changed',
          title: `✏️ Treino alterado: ${body.title}`,
          body: `Agora: ${whenLabel(startsAt, deps.config.TIMEZONE)}${body.location ? ` · ${body.location}` : ''}.`,
          url: `/events/${params.id}`,
          actorId: user.id,
          tag: `event:${params.id}`,
        });
      }
      const [view] = await eventViews(deps, user.id, [row!]);
      return view;
    },
  });

  r.add({
    method: 'delete',
    path: '/events/:id',
    tag: 'Treinos marcados',
    summary: 'Cancelar treino (quem marcou)',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      const e = await getEvent(deps.db, params.id);
      if (e.createdBy !== user.id && !user.isAdmin) throw forbidden('Só quem marcou (ou um administrador) pode cancelar');
      await deps.db.update(s.events).set({ cancelledAt: deps.now() }).where(eq(s.events.id, params.id));
      deps.realtime.broadcast({ type: 'event.updated', eventId: params.id });
      if (!e.cancelledAt) {
        await notify(deps, {
          to: await interested(deps.db, params.id),
          except: user.id,
          category: 'events',
          kind: 'event.cancelled',
          title: `❌ Treino cancelado: ${e.title}`,
          body: `Era ${whenLabel(e.startsAt, deps.config.TIMEZONE)}. Cancelado por ${user.name}.`,
          url: `/events/${params.id}`,
          actorId: user.id,
          tag: `event:${params.id}`,
        });
      }
      return undefined;
    },
  });

  r.add({
    method: 'put',
    path: '/events/:id/rsvp',
    tag: 'Treinos marcados',
    summary: 'Responder: vou / talvez / não vou',
    params: z.object({ id: z.uuid() }),
    body: rsvpSchema,
    handler: async ({ deps, user, params, body }) => {
      const e = await getEvent(deps.db, params.id);
      if (e.cancelledAt) throw badRequest('Treino cancelado');
      await deps.db
        .insert(s.eventRsvps)
        .values({ eventId: params.id, userId: user.id, status: body.status, updatedAt: deps.now() })
        .onConflictDoUpdate({ target: [s.eventRsvps.eventId, s.eventRsvps.userId], set: { status: body.status, updatedAt: deps.now() } });
      deps.realtime.broadcast({ type: 'event.updated', eventId: params.id });
      const [view] = await eventViews(deps, user.id, [e]);
      return view;
    },
  });

  r.add({
    method: 'post',
    path: '/events/:id/check-in',
    tag: 'Treinos marcados',
    summary: 'Confirmar que compareci (conta para a constância)',
    params: z.object({ id: z.uuid() }),
    body: checkInSchema,
    handler: async ({ deps, user, params, body }) => {
      const e = await getEvent(deps.db, params.id);
      if (e.cancelledAt) throw badRequest('Treino cancelado');
      if (e.startsAt.getTime() > deps.now().getTime()) throw badRequest('A presença só pode ser confirmada depois do início do treino');
      const before = await streakOf(deps, user.id);
      await deps.db
        .insert(s.eventRsvps)
        .values({ eventId: params.id, userId: user.id, status: body.attended ? 'going' : 'not_going', attended: body.attended, updatedAt: deps.now() })
        .onConflictDoUpdate({ target: [s.eventRsvps.eventId, s.eventRsvps.userId], set: { attended: body.attended, updatedAt: deps.now() } });
      deps.realtime.broadcast({ type: 'event.updated', eventId: params.id });
      // Presença confirmada conta como atividade do dia (sequência e rankings).
      await afterActivity(deps, user.id, before);
      void queueLeaderCheck(deps);
      const [view] = await eventViews(deps, user.id, [e]);
      return view;
    },
  });
}
