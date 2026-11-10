import { and, asc, desc, eq, gte, gt, inArray, isNull, lte, ne } from 'drizzle-orm';
import * as s from '../db/schema';
import type { RouteRegistry } from '../http/registry';
import { latestBodyweight, publicUser } from '../services/people';
import { competitionBoard, localDateIn } from './competitions';

export function homeRoutes(r: RouteRegistry) {
  r.add({
    method: 'get',
    path: '/home',
    tag: 'Início',
    summary: 'Resumo: próximos treinos, competição, peso e mensagens não lidas',
    handler: async ({ deps, user }) => {
      const now = deps.now();
      const today = localDateIn(deps.config.TIMEZONE, now);
      const upcoming = await deps.db
        .select()
        .from(s.events)
        .where(and(gte(s.events.startsAt, new Date(now.getTime() - 3 * 3_600_000)), isNull(s.events.cancelledAt)))
        .orderBy(asc(s.events.startsAt))
        .limit(5);
      const rsvps = upcoming.length ? await deps.db.select().from(s.eventRsvps).where(inArray(s.eventRsvps.eventId, upcoming.map((e) => e.id))) : [];
      const active = await deps.db
        .select({ c: s.competitions })
        .from(s.competitions)
        .innerJoin(s.competitionParticipants, eq(s.competitionParticipants.competitionId, s.competitions.id))
        .where(and(eq(s.competitionParticipants.userId, user.id), lte(s.competitions.startDate, today), gte(s.competitions.endDate, today)))
        .orderBy(desc(s.competitions.startDate))
        .limit(1);
      let competition = null;
      if (active[0]) {
        const board = await competitionBoard(deps, active[0].c, user.id);
        const mine = board.standings.find((x) => x.userId === user.id);
        competition = { id: board.id, name: board.name, daysLeft: board.daysLeft, myRank: mine?.rank ?? null, myTotal: mine?.total ?? null, participants: board.standings.length, leader: board.standings[0] ? { user: board.standings[0].user, total: board.standings[0].total } : null };
      }
      const weight = await latestBodyweight(deps.db, user.id);
      const weekAgo = weight ? await latestBodyweight(deps.db, user.id, localDateIn(deps.config.TIMEZONE, new Date(now.getTime() - 7 * 86_400_000))) : null;
      const reads = await deps.db.select().from(s.chatReads).where(eq(s.chatReads.userId, user.id));
      const rooms = await deps.db.select({ id: s.chatRooms.id }).from(s.chatRooms);
      let unread = 0;
      for (const room of rooms) {
        const since = reads.find((x) => x.roomId === room.id)?.lastReadAt;
        unread += await deps.db.$count(s.chatMessages, and(eq(s.chatMessages.roomId, room.id), ne(s.chatMessages.userId, user.id), since ? gt(s.chatMessages.createdAt, since) : undefined));
      }
      const creators = upcoming.length ? await deps.db.select().from(s.users).where(inArray(s.users.id, [...new Set(upcoming.map((e) => e.createdBy))])) : [];
      return {
        today,
        events: upcoming.map((e) => ({
          id: e.id,
          title: e.title,
          kind: e.kind,
          startsAt: e.startsAt,
          location: e.location,
          creator: (() => {
            const c = creators.find((x) => x.id === e.createdBy);
            return c ? publicUser(deps, c) : null;
          })(),
          going: rsvps.filter((x) => x.eventId === e.id && x.status === 'going').length,
          myStatus: rsvps.find((x) => x.eventId === e.id && x.userId === user.id)?.status ?? null,
        })),
        competition,
        weight: weight ? { ...weight, weekChange: weekAgo && weekAgo.date !== weight.date ? Math.round((weight.weightKg - weekAgo.weightKg) * 10) / 10 : null } : null,
        unread,
      };
    },
  });
}
