import { routineSchema, workoutLogSchema } from '@forja/shared';
import { and, asc, desc, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '../db/client';
import * as s from '../db/schema';
import type { Deps } from '../deps';
import { badRequest, notFound } from '../http/errors';
import type { RouteRegistry } from '../http/registry';

const listCols = {
  id: s.exercises.id,
  namePt: s.exercises.namePt,
  nameEn: s.exercises.nameEn,
  bodyPart: s.exercises.bodyPart,
  equipment: s.exercises.equipment,
  target: s.exercises.target,
  category: s.exercises.category,
};

const normalize = (q: string) =>
  q
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export async function loadRoutine(db: DbOrTx, id: string) {
  const [routine] = await db.select().from(s.routines).where(eq(s.routines.id, id));
  if (!routine) return null;
  const items = await db
    .select({ ...listCols, position: s.routineExercises.position, sets: s.routineExercises.sets, reps: s.routineExercises.reps, restSec: s.routineExercises.restSec, notes: s.routineExercises.notes })
    .from(s.routineExercises)
    .innerJoin(s.exercises, eq(s.exercises.id, s.routineExercises.exerciseId))
    .where(eq(s.routineExercises.routineId, id))
    .orderBy(asc(s.routineExercises.position));
  return { ...routine, exercises: items };
}

export function trainingRoutes(r: RouteRegistry) {
  // ---- Exercícios (catálogo openGym) ----
  r.add({
    method: 'get',
    path: '/exercises',
    tag: 'Exercícios',
    summary: 'Pesquisar no catálogo do openGym (nome em pt/en, parte do corpo, equipamento)',
    query: z.object({
      q: z.string().trim().max(80).optional(),
      bodyPart: z.string().max(40).optional(),
      equipment: z.string().max(40).optional(),
      category: z.string().max(40).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(40),
      offset: z.coerce.number().int().min(0).max(10_000).default(0),
    }),
    handler: async ({ deps, query }) => {
      const conds: SQL[] = [];
      for (const term of normalize(query.q ?? '').split(/\s+/).filter(Boolean).slice(0, 6)) conds.push(ilike(s.exercises.search, `%${term.replace(/[%_\\]/g, '\\$&')}%`));
      if (query.bodyPart) conds.push(eq(s.exercises.bodyPart, query.bodyPart));
      if (query.equipment) conds.push(eq(s.exercises.equipment, query.equipment));
      if (query.category) conds.push(eq(s.exercises.category, query.category));
      const where = conds.length ? and(...conds) : undefined;
      const items = await deps.db.select(listCols).from(s.exercises).where(where).orderBy(asc(s.exercises.namePt)).limit(query.limit).offset(query.offset);
      const total = await deps.db.$count(s.exercises, where);
      return { items, total };
    },
  });

  r.add({
    method: 'get',
    path: '/exercises/:id',
    tag: 'Exercícios',
    summary: 'Detalhes do exercício',
    params: z.object({ id: z.string().max(32) }),
    handler: async ({ deps, params }) => {
      const [ex] = await deps.db.select().from(s.exercises).where(eq(s.exercises.id, params.id));
      if (!ex) throw notFound('Exercício');
      const { search: _s, ...rest } = ex;
      return rest;
    },
  });

  // ---- Rotinas: planos prontos do openGym + rotinas próprias ----
  r.add({
    method: 'get',
    path: '/routines',
    tag: 'Rotinas',
    summary: 'Planos prontos (openGym) e minhas rotinas',
    handler: async ({ deps, user }) => {
      const rows = await deps.db
        .select()
        .from(s.routines)
        .where(or(isNull(s.routines.ownerId), eq(s.routines.ownerId, user.id)))
        .orderBy(asc(s.routines.position), desc(s.routines.createdAt));
      const ids = rows.map((x) => x.id);
      const counts = ids.length
        ? await deps.db.select({ routineId: s.routineExercises.routineId }).from(s.routineExercises).where(inArray(s.routineExercises.routineId, ids))
        : [];
      return rows.map((x) => ({ ...x, exerciseCount: counts.filter((c) => c.routineId === x.id).length, mine: x.ownerId === user.id }));
    },
  });

  r.add({
    method: 'get',
    path: '/routines/:id',
    tag: 'Rotinas',
    summary: 'Rotina com exercícios',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      const routine = await loadRoutine(deps.db, params.id);
      if (!routine || (routine.ownerId && routine.ownerId !== user.id)) throw notFound('Rotina');
      return routine;
    },
  });

  const saveRoutine = async (deps: Deps, userId: string, body: z.output<typeof routineSchema>, id?: string) =>
    deps.db.transaction(async (tx) => {
      const exIds = [...new Set(body.exercises.map((e) => e.exerciseId))];
      if (exIds.length) {
        const found = await tx.select({ id: s.exercises.id }).from(s.exercises).where(inArray(s.exercises.id, exIds));
        if (found.length !== exIds.length) throw badRequest('Exercício inexistente no catálogo');
      }
      let routineId = id;
      if (id) {
        const rows = await tx
          .update(s.routines)
          .set({ name: body.name, description: body.description ?? null })
          .where(and(eq(s.routines.id, id), eq(s.routines.ownerId, userId)))
          .returning({ id: s.routines.id });
        if (!rows.length) throw notFound('Rotina');
        await tx.delete(s.routineExercises).where(eq(s.routineExercises.routineId, id));
      } else {
        const [row] = await tx.insert(s.routines).values({ ownerId: userId, name: body.name, description: body.description ?? null, position: 1000 }).returning({ id: s.routines.id });
        routineId = row!.id;
      }
      if (body.exercises.length) {
        await tx.insert(s.routineExercises).values(
          body.exercises.map((e, i) => ({ routineId: routineId!, position: i, exerciseId: e.exerciseId, sets: e.sets, reps: e.reps, restSec: e.restSec ?? null, notes: e.notes ?? null })),
        );
      }
      return loadRoutine(tx, routineId!);
    });

  r.add({ method: 'post', path: '/routines', tag: 'Rotinas', summary: 'Criar rotina', status: 201, body: routineSchema, handler: ({ deps, user, body }) => saveRoutine(deps, user.id, body) });
  r.add({
    method: 'put',
    path: '/routines/:id',
    tag: 'Rotinas',
    summary: 'Editar minha rotina',
    params: z.object({ id: z.uuid() }),
    body: routineSchema,
    handler: ({ deps, user, params, body }) => saveRoutine(deps, user.id, body, params.id),
  });
  r.add({
    method: 'post',
    path: '/routines/:id/copy',
    tag: 'Rotinas',
    summary: 'Copiar um plano pronto (ou rotina) para editar',
    status: 201,
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      const src = await loadRoutine(deps.db, params.id);
      if (!src || (src.ownerId && src.ownerId !== user.id)) throw notFound('Rotina');
      return saveRoutine(deps, user.id, {
        name: `${src.name}`.slice(0, 60),
        description: src.description,
        exercises: src.exercises.map((e) => ({ exerciseId: e.id, sets: e.sets, reps: e.reps, restSec: e.restSec, notes: e.notes })),
      });
    },
  });
  r.add({
    method: 'delete',
    path: '/routines/:id',
    tag: 'Rotinas',
    summary: 'Apagar minha rotina',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      const rows = await deps.db.delete(s.routines).where(and(eq(s.routines.id, params.id), eq(s.routines.ownerId, user.id))).returning({ id: s.routines.id });
      if (!rows.length) throw notFound('Rotina');
      return undefined;
    },
  });

  // ---- Registro de treino feito (conta para a constância) ----
  r.add({
    method: 'get',
    path: '/logs',
    tag: 'Treinos',
    summary: 'Meus treinos registrados',
    query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }),
    handler: async ({ deps, user, query }) =>
      deps.db.select().from(s.workoutLogs).where(eq(s.workoutLogs.userId, user.id)).orderBy(desc(s.workoutLogs.date), desc(s.workoutLogs.createdAt)).limit(query.limit),
  });
  r.add({
    method: 'post',
    path: '/logs',
    tag: 'Treinos',
    summary: 'Registrar treino feito',
    status: 201,
    body: workoutLogSchema,
    handler: async ({ deps, user, body }) => {
      if (body.routineId) {
        const routine = await loadRoutine(deps.db, body.routineId);
        if (!routine || (routine.ownerId && routine.ownerId !== user.id)) throw badRequest('Rotina inválida');
      }
      const [row] = await deps.db
        .insert(s.workoutLogs)
        .values({ userId: user.id, date: body.date, kind: body.kind, durationMin: body.durationMin ?? null, routineId: body.routineId ?? null, notes: body.notes ?? null })
        .returning();
      return row;
    },
  });
  r.add({
    method: 'delete',
    path: '/logs/:id',
    tag: 'Treinos',
    summary: 'Apagar treino registrado',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      const rows = await deps.db.delete(s.workoutLogs).where(and(eq(s.workoutLogs.id, params.id), eq(s.workoutLogs.userId, user.id))).returning({ id: s.workoutLogs.id });
      if (!rows.length) throw notFound('Treino');
      return undefined;
    },
  });
}
