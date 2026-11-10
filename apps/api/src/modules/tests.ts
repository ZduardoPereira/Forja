import {
  bestResult,
  dotsScore,
  effectiveValue,
  isBetter,
  radarProfile,
  type Sex,
  TEST_BY_ID,
  TEST_IDS,
  type TestId,
  type TestResultLike,
  TESTS,
  testResultSchema,
  validateResult,
} from '@forja/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '../db/client';
import * as s from '../db/schema';
import type { Deps } from '../deps';
import { badRequest, forbidden, notFound } from '../http/errors';
import type { RouteRegistry } from '../http/registry';
import { assertOwnFiles, fileView } from '../services/files';
import { latestBodyweight, publicUser } from '../services/people';

type ResultRow = typeof s.testResults.$inferSelect;
const asLike = (r: ResultRow): TestResultLike => ({ testId: r.testId as TestId, date: r.date, value: r.value, reps: r.reps, bodyweightKg: r.bodyweightKg });

export async function resultsOf(db: DbOrTx, userIds: string[], testId?: TestId): Promise<ResultRow[]> {
  if (!userIds.length) return [];
  return db
    .select()
    .from(s.testResults)
    .where(and(inArray(s.testResults.userId, userIds), testId ? eq(s.testResults.testId, testId) : undefined))
    .orderBy(asc(s.testResults.date), asc(s.testResults.createdAt));
}

/** Radar 0–20 de uma pessoa (peso atual como referência quando o teste não tem peso do dia). */
export async function radarOf(deps: Deps, userId: string) {
  const rows = await resultsOf(deps.db, [userId]);
  const bw = await latestBodyweight(deps.db, userId);
  return radarProfile(rows.map(asLike), bw?.weightKg ?? null).map((a) => ({ testId: a.testId, label: a.label, score: a.score }));
}

function resultView(deps: Deps, r: ResultRow, confirmations: { resultId: string; userId: string }[]) {
  const def = TEST_BY_ID[r.testId as TestId];
  return {
    ...r,
    effectiveValue: effectiveValue(asLike(r)),
    estimated: def.input === 'load' && (r.reps ?? 1) > 1,
    file: fileView(deps, r.fileId),
    confirmedBy: confirmations.filter((c) => c.resultId === r.id).map((c) => c.userId),
  };
}

async function leaderboard(deps: Deps, testId: TestId) {
  const def = TEST_BY_ID[testId];
  const people = await deps.db.select().from(s.users);
  const rows = await resultsOf(
    deps.db,
    people.map((p) => p.id),
    testId,
  );
  const confirmations = rows.length ? await deps.db.select().from(s.testConfirmations).where(inArray(s.testConfirmations.resultId, rows.map((r) => r.id))) : [];
  const entries = people
    .map((p) => {
      const own = rows.filter((r) => r.userId === p.id);
      const best = bestResult(own.map((r) => ({ ...asLike(r), row: r })));
      if (!best) return null;
      const value = effectiveValue(best);
      const dots = def.input === 'load' && p.sex && best.bodyweightKg ? dotsScore(value, best.bodyweightKg, p.sex as Sex) : null;
      return {
        user: publicUser(deps, p),
        result: resultView(deps, best.row, confirmations),
        value,
        relative: def.input === 'load' && best.bodyweightKg ? value / best.bodyweightKg : null,
        dots,
      };
    })
    .filter((e): e is NonNullable<typeof e> => !!e);
  // Força: ordena pela pontuação DOTS (justa entre pesos diferentes); quem não tem sexo/peso vai depois, por carga.
  entries.sort((a, b) => {
    if (def.input === 'load' && (a.dots != null || b.dots != null)) {
      if (a.dots == null) return 1;
      if (b.dots == null) return -1;
      return b.dots - a.dots;
    }
    return isBetter(def, a.value, b.value) ? -1 : isBetter(def, b.value, a.value) ? 1 : 0;
  });
  return { test: def, entries: entries.map((e, i) => ({ rank: i + 1, ...e })) };
}

export function testRoutes(r: RouteRegistry) {
  r.add({
    method: 'get',
    path: '/tests',
    tag: 'Testes',
    summary: 'Testes, meus recordes e o líder de cada teste',
    handler: async ({ deps, user }) => {
      const mine = await resultsOf(deps.db, [user.id]);
      const boards = await Promise.all(TEST_IDS.map((id) => leaderboard(deps, id)));
      return TESTS.map((def, i) => {
        const own = mine.filter((r) => r.testId === def.id);
        const best = bestResult(own.map((r) => ({ ...asLike(r), id: r.id })));
        const board = boards[i]!;
        return {
          test: def,
          myBest: best ? { id: best.id, date: best.date, value: best.value, reps: best.reps ?? null, effectiveValue: effectiveValue(best) } : null,
          myCount: own.length,
          leader: board.entries[0] ? { user: board.entries[0].user, value: board.entries[0].value, dots: board.entries[0].dots } : null,
          myRank: board.entries.find((e) => e.user.id === user.id)?.rank ?? null,
        };
      });
    },
  });

  r.add({
    method: 'get',
    path: '/tests/bests',
    tag: 'Testes',
    summary: 'Melhor resultado de uma pessoa em cada teste (para o perfil)',
    query: z.object({ userId: z.uuid().optional() }),
    handler: async ({ deps, user, query }) => {
      const uid = query.userId ?? user.id;
      const rows = await resultsOf(deps.db, [uid]);
      return TEST_IDS.map((id) => {
        const own = rows.filter((r) => r.testId === id);
        const best = bestResult(own.map((r) => ({ ...asLike(r), id: r.id })));
        return {
          testId: id,
          count: own.length,
          best: best ? { id: best.id, date: best.date, value: best.value, reps: best.reps ?? null, effectiveValue: effectiveValue(best) } : null,
        };
      });
    },
  });

  r.add({
    method: 'get',
    path: '/tests/powerlifting',
    tag: 'Testes',
    summary: 'Total de powerlifting (agachamento + supino + terra) com pontuação DOTS',
    handler: async ({ deps }) => {
      const people = await deps.db.select().from(s.users);
      const rows = await resultsOf(
        deps.db,
        people.map((p) => p.id),
      );
      const entries = people
        .map((p) => {
          const lifts = (['squat', 'bench', 'deadlift'] as const).map((id) => bestResult(rows.filter((r) => r.userId === p.id && r.testId === id).map(asLike)));
          if (lifts.some((l) => !l)) return null;
          const total = lifts.reduce((a, l) => a + effectiveValue(l!), 0);
          const bw = lifts.map((l) => l!.bodyweightKg).find((x) => x != null) ?? null;
          return { user: publicUser(deps, p), squat: effectiveValue(lifts[0]!), bench: effectiveValue(lifts[1]!), deadlift: effectiveValue(lifts[2]!), total, bodyweightKg: bw, dots: p.sex && bw ? dotsScore(total, bw, p.sex as Sex) : null };
        })
        .filter((e): e is NonNullable<typeof e> => !!e)
        .sort((a, b) => (b.dots ?? -1) - (a.dots ?? -1) || b.total - a.total);
      return entries.map((e, i) => ({ rank: i + 1, ...e }));
    },
  });

  r.add({
    method: 'get',
    path: '/tests/radar',
    tag: 'Testes',
    summary: 'Radar 0–20 de uma pessoa (e opcionalmente de outra, para comparar)',
    query: z.object({ userId: z.uuid().optional(), compareWith: z.uuid().optional() }),
    handler: async ({ deps, user, query }) => ({
      axes: await radarOf(deps, query.userId ?? user.id),
      compare: query.compareWith ? await radarOf(deps, query.compareWith) : null,
    }),
  });

  r.add({
    method: 'get',
    path: '/tests/:testId/leaderboard',
    tag: 'Testes',
    summary: 'Ranking do teste (melhor resultado de cada pessoa)',
    params: z.object({ testId: z.enum(TEST_IDS) }),
    handler: ({ deps, params }) => leaderboard(deps, params.testId),
  });

  r.add({
    method: 'get',
    path: '/tests/:testId/history',
    tag: 'Testes',
    summary: 'Histórico de uma pessoa em um teste',
    params: z.object({ testId: z.enum(TEST_IDS) }),
    query: z.object({ userId: z.uuid().optional() }),
    handler: async ({ deps, user, params, query }) => {
      const rows = await resultsOf(deps.db, [query.userId ?? user.id], params.testId);
      const confirmations = rows.length ? await deps.db.select().from(s.testConfirmations).where(inArray(s.testConfirmations.resultId, rows.map((r) => r.id))) : [];
      return { test: TEST_BY_ID[params.testId], results: rows.map((r) => resultView(deps, r, confirmations)) };
    },
  });

  r.add({
    method: 'post',
    path: '/tests/results',
    tag: 'Testes',
    summary: 'Registrar resultado de teste',
    status: 201,
    body: testResultSchema,
    handler: async ({ deps, user, body }) => {
      const errors = validateResult(body);
      if (errors.length) throw badRequest(errors[0]!, errors);
      if (body.fileId) await assertOwnFiles(deps.db, user.id, [body.fileId]);
      const previous = await resultsOf(deps.db, [user.id], body.testId);
      const bw = await latestBodyweight(deps.db, user.id, body.date);
      const def = TEST_BY_ID[body.testId];
      const [row] = await deps.db
        .insert(s.testResults)
        .values({
          userId: user.id,
          testId: body.testId,
          date: body.date,
          value: body.value,
          reps: def.input === 'load' ? (body.reps ?? 1) : null,
          bodyweightKg: bw?.weightKg ?? null,
          notes: body.notes ?? null,
          fileId: body.fileId ?? null,
        })
        .returning();
      const prevBest = bestResult(previous.map(asLike));
      const isRecord = !prevBest || isBetter(def, effectiveValue(asLike(row!)), effectiveValue(prevBest));
      return { ...resultView(deps, row!, []), isRecord, firstTime: !prevBest };
    },
  });

  r.add({
    method: 'delete',
    path: '/tests/results/:id',
    tag: 'Testes',
    summary: 'Apagar meu resultado',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      const rows = await deps.db.delete(s.testResults).where(and(eq(s.testResults.id, params.id), eq(s.testResults.userId, user.id))).returning({ id: s.testResults.id });
      if (!rows.length) throw notFound('Resultado');
      return undefined;
    },
  });

  r.add({
    method: 'post',
    path: '/tests/results/:id/confirm',
    tag: 'Testes',
    summary: '"Eu vi": confirmar o resultado de um amigo',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      const [row] = await deps.db.select().from(s.testResults).where(eq(s.testResults.id, params.id));
      if (!row) throw notFound('Resultado');
      if (row.userId === user.id) throw forbidden('Você não pode confirmar o próprio resultado');
      await deps.db.insert(s.testConfirmations).values({ resultId: params.id, userId: user.id }).onConflictDoNothing();
      return { confirmed: true };
    },
  });

  r.add({
    method: 'delete',
    path: '/tests/results/:id/confirm',
    tag: 'Testes',
    summary: 'Retirar confirmação',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      await deps.db.delete(s.testConfirmations).where(and(eq(s.testConfirmations.resultId, params.id), eq(s.testConfirmations.userId, user.id)));
      return { confirmed: false };
    },
  });
}
