/**
 * Assistente de treino: o app anota peso, repetições e descanso de cada série enquanto a
 * pessoa treina e salva tudo ao finalizar. O treino vira um registro de atividade (conta
 * para a sequência e para a constância das competições).
 */
import { estimateOneRm, isLoggableDate, sessionSchema } from '@forja/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import { badRequest, notFound } from '../http/errors';
import type { RouteRegistry } from '../http/registry';
import { afterActivity, streakOf, todayIn } from '../services/activity';
import { queueLeaderCheck } from '../services/rankings';
import { localDateIn } from './competitions';
import { loadRoutine } from './training';

type SetRow = typeof s.workoutSets.$inferSelect;

const e1rm = (x: { weightKg: number | null; reps: number | null }) => (x.weightKg && x.reps ? estimateOneRm(x.weightKg, x.reps) : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function sessionRoutes(r: RouteRegistry) {
  r.add({
    method: 'post',
    path: '/sessions',
    tag: 'Assistente de treino',
    summary: 'Salvar um treino feito no assistente (séries com peso, repetições e descanso)',
    status: 201,
    body: sessionSchema,
    handler: async ({ deps, user, body }) => {
      const started = new Date(body.startedAt);
      const date = localDateIn(deps.config.TIMEZONE, started);
      const today = todayIn(deps);
      if (!isLoggableDate(date, today)) throw badRequest('Esse treino é de muitos dias atrás: dá para salvar treinos de hoje e dos 2 dias anteriores.');
      if (body.routineId) {
        const routine = await loadRoutine(deps.db, body.routineId);
        if (!routine || (routine.ownerId && routine.ownerId !== user.id)) throw badRequest('Rotina inválida');
      }
      const exIds = [...new Set(body.exercises.map((e) => e.exerciseId))];
      const known = exIds.length ? await deps.db.select({ id: s.exercises.id, namePt: s.exercises.namePt }).from(s.exercises).where(inArray(s.exercises.id, exIds)) : [];
      if (known.length !== exIds.length) throw badRequest('Exercício inexistente no catálogo');

      // Melhor 1RM estimado de cada exercício ANTES deste treino (para achar recordes).
      const previous = exIds.length ? await deps.db.select().from(s.workoutSets).where(and(eq(s.workoutSets.userId, user.id), inArray(s.workoutSets.exerciseId, exIds))) : [];
      const before = await streakOf(deps, user.id, today);
      const durationMin = Math.max(1, Math.round((Date.parse(body.finishedAt) - started.getTime()) / 60_000));

      const log = await deps.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(s.workoutLogs)
          .values({ userId: user.id, date, kind: body.kind, durationMin, routineId: body.routineId ?? null, notes: body.notes ?? null, source: 'session', title: body.title, startedAt: started })
          .returning();
        const sets = body.exercises.flatMap((e, position) =>
          e.sets.map((x, setIndex) => ({
            logId: row!.id,
            userId: user.id,
            exerciseId: e.exerciseId,
            position,
            setIndex,
            weightKg: x.weightKg ?? null,
            reps: x.reps ?? null,
            durationSec: x.durationSec ?? null,
            restSec: x.restSec ?? null,
          })),
        );
        if (sets.length) await tx.insert(s.workoutSets).values(sets);
        return row!;
      });

      const allSets = body.exercises.flatMap((e) => e.sets);
      const records = body.exercises
        .map((e) => {
          const best = e.sets.reduce<{ weightKg: number | null; reps: number | null } | null>((acc, x) => (e1rm({ weightKg: x.weightKg ?? null, reps: x.reps ?? null }) > (acc ? e1rm(acc) : 0) ? { weightKg: x.weightKg ?? null, reps: x.reps ?? null } : acc), null);
          if (!best) return null;
          const prevBest = Math.max(0, ...previous.filter((p) => p.exerciseId === e.exerciseId).map(e1rm));
          const now = e1rm(best);
          return now > prevBest ? { exerciseId: e.exerciseId, name: known.find((k) => k.id === e.exerciseId)!.namePt, weightKg: best.weightKg, reps: best.reps, e1rm: r1(now), firstTime: prevBest === 0 } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      const streak = await afterActivity(deps, user.id, before);
      void queueLeaderCheck(deps);
      return {
        log,
        summary: {
          durationMin,
          exercises: body.exercises.length,
          sets: allSets.length,
          reps: allSets.reduce((a, x) => a + (x.reps ?? 0), 0),
          volumeKg: Math.round(allSets.reduce((a, x) => a + (x.weightKg ?? 0) * (x.reps ?? 0), 0)),
          records: records.filter((x) => !x.firstTime),
        },
        streak,
      };
    },
  });

  r.add({
    method: 'get',
    path: '/sessions/previous',
    tag: 'Assistente de treino',
    summary: 'Última vez e recorde de cada exercício (coluna "Anterior" do assistente)',
    query: z.object({ exerciseIds: z.string().max(2000) }),
    handler: async ({ deps, user, query }) => {
      const ids = [...new Set(query.exerciseIds.split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 40);
      if (!ids.length) return [];
      const rows = await deps.db
        .select({ set: s.workoutSets, date: s.workoutLogs.date })
        .from(s.workoutSets)
        .innerJoin(s.workoutLogs, eq(s.workoutLogs.id, s.workoutSets.logId))
        .where(and(eq(s.workoutSets.userId, user.id), inArray(s.workoutSets.exerciseId, ids)))
        .orderBy(desc(s.workoutSets.createdAt), asc(s.workoutSets.setIndex));
      return ids.map((exerciseId) => {
        const own = rows.filter((x) => x.set.exerciseId === exerciseId);
        const lastLog = own[0]?.set.logId;
        const last = own.filter((x) => x.set.logId === lastLog).sort((a, b) => a.set.setIndex - b.set.setIndex);
        const best = own.reduce<SetRow | null>((acc, x) => (e1rm(x.set) > (acc ? e1rm(acc) : 0) ? x.set : acc), null);
        return {
          exerciseId,
          last: lastLog ? { date: own[0]!.date, sets: last.map((x) => ({ weightKg: x.set.weightKg, reps: x.set.reps, durationSec: x.set.durationSec })) } : null,
          best: best ? { weightKg: best.weightKg, reps: best.reps, e1rm: r1(e1rm(best)) } : null,
        };
      });
    },
  });

  r.add({
    method: 'get',
    path: '/sessions/:id',
    tag: 'Assistente de treino',
    summary: 'Detalhes de um treino feito no assistente',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      const [log] = await deps.db.select().from(s.workoutLogs).where(and(eq(s.workoutLogs.id, params.id), eq(s.workoutLogs.userId, user.id)));
      if (!log) throw notFound('Treino');
      const sets = await deps.db
        .select({ set: s.workoutSets, name: s.exercises.namePt })
        .from(s.workoutSets)
        .innerJoin(s.exercises, eq(s.exercises.id, s.workoutSets.exerciseId))
        .where(eq(s.workoutSets.logId, log.id))
        .orderBy(asc(s.workoutSets.position), asc(s.workoutSets.setIndex));
      const exercises: { exerciseId: string; name: string; sets: { weightKg: number | null; reps: number | null; durationSec: number | null; restSec: number | null }[] }[] = [];
      for (const x of sets) {
        let ex = exercises.find((e, i) => e.exerciseId === x.set.exerciseId && i === exercises.length - 1);
        if (!ex) exercises.push((ex = { exerciseId: x.set.exerciseId, name: x.name, sets: [] }));
        ex.sets.push({ weightKg: x.set.weightKg, reps: x.set.reps, durationSec: x.set.durationSec, restSec: x.set.restSec });
      }
      const flat = sets.map((x) => x.set);
      return {
        ...log,
        exercises,
        summary: { sets: flat.length, reps: flat.reduce((a, x) => a + (x.reps ?? 0), 0), volumeKg: Math.round(flat.reduce((a, x) => a + (x.weightKg ?? 0) * (x.reps ?? 0), 0)) },
      };
    },
  });
}
