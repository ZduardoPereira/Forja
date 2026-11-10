import {
  addDays,
  competitionSchema,
  type CompetitionRules,
  daysBetween,
  type Experience,
  FAT_LOSS_RATE_PER_WEEK,
  type Goal,
  joinCompetitionSchema,
  LEAN_GAIN_RATE_PER_MONTH,
  type ParticipantInput,
  scoreCompetition,
  type TestId,
} from '@forja/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Deps } from '../deps';
import { badRequest, forbidden, notFound } from '../http/errors';
import type { RouteRegistry } from '../http/registry';
import { publicUser } from '../services/people';

type CompetitionRow = typeof s.competitions.$inferSelect;

/** Data local (no fuso do grupo) de um instante. */
export function localDateIn(timeZone: string, d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const rulesOf = (c: CompetitionRow): CompetitionRules => ({
  startDate: c.startDate,
  endDate: c.endDate,
  weights: { body: c.weightBody, performance: c.weightPerformance, consistency: c.weightConsistency },
  consistencyTargetPerWeek: c.consistencyTarget,
});

async function participantInputs(deps: Deps, competitionId: string): Promise<ParticipantInput[]> {
  const parts = await deps.db
    .select({ userId: s.competitionParticipants.userId, goal: s.competitionParticipants.goal, user: s.users })
    .from(s.competitionParticipants)
    .innerJoin(s.users, eq(s.users.id, s.competitionParticipants.userId))
    .where(eq(s.competitionParticipants.competitionId, competitionId));
  const ids = parts.map((p) => p.userId);
  if (!ids.length) return [];
  const [weighIns, assessments, results, logs, attended] = await Promise.all([
    deps.db.select().from(s.weighIns).where(inArray(s.weighIns.userId, ids)),
    deps.db.select().from(s.assessments).where(inArray(s.assessments.userId, ids)),
    deps.db.select().from(s.testResults).where(inArray(s.testResults.userId, ids)),
    deps.db.select({ userId: s.workoutLogs.userId, date: s.workoutLogs.date }).from(s.workoutLogs).where(inArray(s.workoutLogs.userId, ids)),
    deps.db
      .select({ userId: s.eventRsvps.userId, startsAt: s.events.startsAt })
      .from(s.eventRsvps)
      .innerJoin(s.events, eq(s.events.id, s.eventRsvps.eventId))
      .where(and(inArray(s.eventRsvps.userId, ids), eq(s.eventRsvps.attended, true))),
  ]);
  return parts.map((p) => ({
    userId: p.userId,
    name: p.user.name,
    goal: p.goal as Goal,
    experience: p.user.experience as Experience,
    body: [
      ...weighIns.filter((w) => w.userId === p.userId).map((w) => ({ date: w.date, weightKg: w.weightKg })),
      ...assessments
        .filter((a) => a.userId === p.userId)
        .map((a) => ({ date: a.date, weightKg: a.weightKg, bodyFatPct: a.bodyFatPct, fatMassKg: a.fatMassKg, leanMassKg: a.leanMassKg })),
    ],
    tests: results.filter((r) => r.userId === p.userId).map((r) => ({ testId: r.testId as TestId, date: r.date, value: r.value, reps: r.reps, bodyweightKg: r.bodyweightKg })),
    activeDates: [...logs.filter((l) => l.userId === p.userId).map((l) => l.date), ...attended.filter((a) => a.userId === p.userId).map((a) => localDateIn(deps.config.TIMEZONE, a.startsAt))],
  }));
}

/** Resumo do corpo de quem não compartilha os números: para os outros, só os pontos aparecem. */
const PRIVATE_BODY_SUMMARY = 'Números do corpo privados — aparecem só os pontos.';

/**
 * Classificação calculada no servidor. `viewerId` = quem está vendo: as variações de peso e
 * composição de quem não ativou "mostrar meus números" ficam escondidas dos outros (junto com
 * os pontos, elas permitiriam estimar o peso da pessoa).
 */
export async function competitionBoard(deps: Deps, c: CompetitionRow, viewerId?: string) {
  const today = localDateIn(deps.config.TIMEZONE, deps.now());
  const inputs = await participantInputs(deps, c.id);
  const rules = rulesOf(c);
  const standings = scoreCompetition(rules, inputs, today);
  const lastWeek = scoreCompetition(rules, inputs, addDays(today, -7));
  const people = inputs.length ? await deps.db.select().from(s.users).where(inArray(s.users.id, inputs.map((i) => i.userId))) : [];
  const phase = today < c.startDate ? 'upcoming' : today > c.endDate ? 'finished' : 'active';
  return {
    ...c,
    phase,
    today,
    daysLeft: Math.max(0, daysBetween(today, c.endDate)),
    daysTotal: daysBetween(c.startDate, c.endDate),
    standings: standings.map((st) => {
      const before = lastWeek.find((x) => x.userId === st.userId);
      const p = people.find((x) => x.id === st.userId)!;
      const hideBody = st.userId !== viewerId && !p.shareBody;
      return {
        ...st,
        body: hideBody ? { ...st.body, summary: PRIVATE_BODY_SUMMARY } : st.body,
        user: publicUser(deps, p),
        weekChange: phase === 'active' && before && today > addDays(c.startDate, 7) ? Math.round((st.total - before.total) * 10) / 10 : null,
      };
    }),
    rates: {
      fatLossPerWeekPct: FAT_LOSS_RATE_PER_WEEK * 100,
      leanGainPerMonthPct: Object.fromEntries(Object.entries(LEAN_GAIN_RATE_PER_MONTH).map(([k, v]) => [k, v * 100])),
    },
  };
}

async function getCompetition(deps: Deps, id: string): Promise<CompetitionRow> {
  const [c] = await deps.db.select().from(s.competitions).where(eq(s.competitions.id, id));
  if (!c) throw notFound('Competição');
  return c;
}

export function competitionRoutes(r: RouteRegistry) {
  r.add({
    method: 'get',
    path: '/competitions',
    tag: 'Competição',
    summary: 'Competições do grupo',
    handler: async ({ deps, user }) => {
      const list = await deps.db.select().from(s.competitions).orderBy(desc(s.competitions.endDate));
      const mine = await deps.db.select().from(s.competitionParticipants).where(eq(s.competitionParticipants.userId, user.id));
      const counts = list.length ? await deps.db.select({ c: s.competitionParticipants.competitionId }).from(s.competitionParticipants).where(inArray(s.competitionParticipants.competitionId, list.map((c) => c.id))) : [];
      const today = localDateIn(deps.config.TIMEZONE, deps.now());
      return list.map((c) => ({
        ...c,
        phase: today < c.startDate ? 'upcoming' : today > c.endDate ? 'finished' : 'active',
        participants: counts.filter((x) => x.c === c.id).length,
        myGoal: mine.find((m) => m.competitionId === c.id)?.goal ?? null,
      }));
    },
  });

  r.add({
    method: 'post',
    path: '/competitions',
    tag: 'Competição',
    summary: 'Criar competição (quem cria já entra com o objetivo do perfil)',
    status: 201,
    body: competitionSchema,
    handler: async ({ deps, user, body }) => {
      const [c] = await deps.db
        .insert(s.competitions)
        .values({
          createdBy: user.id,
          name: body.name,
          startDate: body.startDate,
          endDate: body.endDate,
          weightBody: body.weights.body,
          weightPerformance: body.weights.performance,
          weightConsistency: body.weights.consistency,
          consistencyTarget: body.consistencyTargetPerWeek,
        })
        .returning();
      const [me] = await deps.db.select({ goal: s.users.goal }).from(s.users).where(eq(s.users.id, user.id));
      await deps.db.insert(s.competitionParticipants).values({ competitionId: c!.id, userId: user.id, goal: body.goal ?? me!.goal });
      return competitionBoard(deps, c!, user.id);
    },
  });

  r.add({
    method: 'get',
    path: '/competitions/:id',
    tag: 'Competição',
    summary: 'Classificação atual (calculada no servidor) e regras',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => competitionBoard(deps, await getCompetition(deps, params.id), user.id),
  });

  r.add({
    method: 'put',
    path: '/competitions/:id',
    tag: 'Competição',
    summary: 'Editar competição (quem criou)',
    params: z.object({ id: z.uuid() }),
    body: competitionSchema,
    handler: async ({ deps, user, params, body }) => {
      const c = await getCompetition(deps, params.id);
      if (c.createdBy !== user.id) throw forbidden('Só quem criou pode editar');
      const [row] = await deps.db
        .update(s.competitions)
        .set({
          name: body.name,
          startDate: body.startDate,
          endDate: body.endDate,
          weightBody: body.weights.body,
          weightPerformance: body.weights.performance,
          weightConsistency: body.weights.consistency,
          consistencyTarget: body.consistencyTargetPerWeek,
        })
        .where(eq(s.competitions.id, params.id))
        .returning();
      return competitionBoard(deps, row!, user.id);
    },
  });

  r.add({
    method: 'delete',
    path: '/competitions/:id',
    tag: 'Competição',
    summary: 'Apagar competição (quem criou)',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      const c = await getCompetition(deps, params.id);
      if (c.createdBy !== user.id) throw forbidden('Só quem criou pode apagar');
      await deps.db.delete(s.competitions).where(eq(s.competitions.id, params.id));
      return undefined;
    },
  });

  r.add({
    method: 'post',
    path: '/competitions/:id/join',
    tag: 'Competição',
    summary: 'Entrar (ou mudar o objetivo até 7 dias após o início)',
    params: z.object({ id: z.uuid() }),
    body: joinCompetitionSchema,
    handler: async ({ deps, user, params, body }) => {
      const c = await getCompetition(deps, params.id);
      const today = localDateIn(deps.config.TIMEZONE, deps.now());
      if (today > c.endDate) throw badRequest('Competição encerrada');
      const [existing] = await deps.db
        .select()
        .from(s.competitionParticipants)
        .where(and(eq(s.competitionParticipants.competitionId, params.id), eq(s.competitionParticipants.userId, user.id)));
      if (existing && existing.goal !== body.goal && today > addDays(c.startDate, 7)) throw badRequest('O objetivo só pode mudar até 7 dias depois do início');
      await deps.db
        .insert(s.competitionParticipants)
        .values({ competitionId: params.id, userId: user.id, goal: body.goal })
        .onConflictDoUpdate({ target: [s.competitionParticipants.competitionId, s.competitionParticipants.userId], set: { goal: body.goal } });
      return competitionBoard(deps, c, user.id);
    },
  });

  r.add({
    method: 'post',
    path: '/competitions/:id/leave',
    tag: 'Competição',
    summary: 'Sair da competição',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      await getCompetition(deps, params.id);
      await deps.db.delete(s.competitionParticipants).where(and(eq(s.competitionParticipants.competitionId, params.id), eq(s.competitionParticipants.userId, user.id)));
      return undefined;
    },
  });
}
