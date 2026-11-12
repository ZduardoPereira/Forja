import { assessmentSchema, bmi, completeComposition, photoSchema, weighInSchema } from '@forja/shared';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '../db/client';
import * as s from '../db/schema';
import type { Deps } from '../deps';
import { forbidden, notFound } from '../http/errors';
import type { RouteRegistry } from '../http/registry';
import { assertOwnFiles, deleteFile, fileView } from '../services/files';
import { queueLeaderCheck } from '../services/rankings';

const idParams = z.object({ id: z.uuid() });

async function attach(db: DbOrTx, userId: string, entityType: string, entityId: string | null, date: string, fileIds: string[], visibility: 'private' | 'group' = 'private') {
  await assertOwnFiles(db, userId, fileIds);
  if (entityId) await db.delete(s.attachments).where(and(eq(s.attachments.entityType, entityType), eq(s.attachments.entityId, entityId), eq(s.attachments.userId, userId)));
  if (fileIds.length) await db.insert(s.attachments).values(fileIds.map((fileId) => ({ userId, fileId, entityType, entityId, date, visibility })));
}

function photoView(deps: Deps, a: typeof s.attachments.$inferSelect) {
  return { id: a.id, date: a.date, caption: a.caption, visibility: a.visibility, entityType: a.entityType, entityId: a.entityId, file: fileView(deps, a.fileId)! };
}

/**
 * Dados do corpo de alguém. A própria pessoa vê tudo; os amigos veem números só se ela
 * ativou "mostrar meu corpo ao grupo", e fotos só as marcadas como "Grupo".
 */
export async function bodySummary(deps: Deps, viewerId: string, userId: string) {
  const [u] = await deps.db.select().from(s.users).where(eq(s.users.id, userId));
  if (!u) throw notFound('Pessoa');
  const self = viewerId === userId;
  const numbersVisible = self || u.shareBody;
  const photoFilter = self ? eq(s.attachments.userId, userId) : and(eq(s.attachments.userId, userId), eq(s.attachments.visibility, 'group'));
  const photos = (await deps.db.select().from(s.attachments).where(photoFilter).orderBy(desc(s.attachments.date), desc(s.attachments.createdAt))).map((a) => photoView(deps, a));
  if (!numbersVisible) {
    return { userId, numbersVisible, heightCm: null, targetWeightKg: null, weighIns: [], assessments: [], photos, latest: null };
  }
  const weighIns = await deps.db.select().from(s.weighIns).where(eq(s.weighIns.userId, userId)).orderBy(asc(s.weighIns.date), asc(s.weighIns.createdAt));
  const assessments = await deps.db.select().from(s.assessments).where(eq(s.assessments.userId, userId)).orderBy(asc(s.assessments.date), asc(s.assessments.createdAt));
  const assessmentViews = assessments.map((a) => ({
    ...a,
    composition: completeComposition(a),
    attachments: photos.filter((p) => p.entityType === 'assessment' && p.entityId === a.id),
  }));
  const weightPoints = [...weighIns.map((w) => ({ date: w.date, weightKg: w.weightKg })), ...assessments.filter((a) => a.weightKg != null).map((a) => ({ date: a.date, weightKg: a.weightKg! }))].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const lastWeight = weightPoints.at(-1) ?? null;
  const lastComp = [...assessmentViews].reverse().find((a) => a.composition.bodyFatPct != null)?.composition ?? null;
  return {
    userId,
    numbersVisible,
    heightCm: u.heightCm,
    targetWeightKg: u.targetWeightKg,
    weighIns: weighIns.map((w) => ({ ...w, photos: photos.filter((p) => p.entityType === 'weigh_in' && p.entityId === w.id) })),
    assessments: assessmentViews,
    photos,
    latest: {
      weight: lastWeight,
      bmi: lastWeight && u.heightCm ? bmi(lastWeight.weightKg, u.heightCm) : null,
      composition: lastComp,
    },
  };
}

export function bodyRoutes(r: RouteRegistry) {
  r.add({
    method: 'get',
    path: '/body',
    tag: 'Corpo',
    summary: 'Peso, composição e fotos (meus ou de um amigo, conforme a privacidade dele)',
    query: z.object({ userId: z.uuid().optional() }),
    handler: ({ deps, user, query }) => bodySummary(deps, user.id, query.userId ?? user.id),
  });

  r.add({
    method: 'post',
    path: '/body/weigh-ins',
    tag: 'Corpo',
    summary: 'Registrar peso (com fotos opcionais)',
    status: 201,
    body: weighInSchema,
    handler: async ({ deps, user, body }) =>
      deps.db.transaction(async (tx) => {
        const [w] = await tx.insert(s.weighIns).values({ userId: user.id, date: body.date, weightKg: body.weightKg, note: body.note ?? null }).returning();
        await attach(tx, user.id, 'weigh_in', w!.id, body.date, body.photoFileIds);
        return w;
      }).finally(() => void queueLeaderCheck(deps)),
  });

  r.add({
    method: 'delete',
    path: '/body/weigh-ins/:id',
    tag: 'Corpo',
    summary: 'Apagar pesagem',
    params: idParams,
    handler: async ({ deps, user, params }) => {
      await deps.db.transaction(async (tx) => {
        const rows = await tx.delete(s.weighIns).where(and(eq(s.weighIns.id, params.id), eq(s.weighIns.userId, user.id))).returning({ id: s.weighIns.id });
        if (!rows.length) throw notFound('Pesagem');
        await tx.delete(s.attachments).where(and(eq(s.attachments.entityType, 'weigh_in'), eq(s.attachments.entityId, params.id)));
      });
      void queueLeaderCheck(deps);
      return undefined;
    },
  });

  const saveAssessment = async (deps: Deps, userId: string, body: z.output<typeof assessmentSchema>, id?: string) =>
    deps.db.transaction(async (tx) => {
      const { fileIds, ...fields } = body;
      const values = { ...fields, professional: fields.professional ?? null, notes: fields.notes ?? null };
      let row;
      if (id) {
        [row] = await tx.update(s.assessments).set(values).where(and(eq(s.assessments.id, id), eq(s.assessments.userId, userId))).returning();
        if (!row) throw notFound('Avaliação');
      } else {
        [row] = await tx.insert(s.assessments).values({ ...values, userId }).returning();
      }
      await attach(tx, userId, 'assessment', row!.id, body.date, fileIds);
      return row;
    }).finally(() => void queueLeaderCheck(deps));

  r.add({
    method: 'post',
    path: '/body/assessments',
    tag: 'Corpo',
    summary: 'Registrar avaliação do nutricionista / bioimpedância (com laudo em foto)',
    status: 201,
    body: assessmentSchema,
    handler: ({ deps, user, body }) => saveAssessment(deps, user.id, body),
  });

  r.add({
    method: 'put',
    path: '/body/assessments/:id',
    tag: 'Corpo',
    summary: 'Editar avaliação',
    params: idParams,
    body: assessmentSchema,
    handler: ({ deps, user, params, body }) => saveAssessment(deps, user.id, body, params.id),
  });

  r.add({
    method: 'delete',
    path: '/body/assessments/:id',
    tag: 'Corpo',
    summary: 'Apagar avaliação',
    params: idParams,
    handler: async ({ deps, user, params }) => {
      await deps.db.transaction(async (tx) => {
        const rows = await tx.delete(s.assessments).where(and(eq(s.assessments.id, params.id), eq(s.assessments.userId, user.id))).returning({ id: s.assessments.id });
        if (!rows.length) throw notFound('Avaliação');
        await tx.delete(s.attachments).where(and(eq(s.attachments.entityType, 'assessment'), eq(s.attachments.entityId, params.id)));
      });
      void queueLeaderCheck(deps);
      return undefined;
    },
  });

  r.add({
    method: 'post',
    path: '/body/photos',
    tag: 'Corpo',
    summary: 'Adicionar foto de progresso',
    status: 201,
    body: photoSchema,
    handler: async ({ deps, user, body }) => {
      await assertOwnFiles(deps.db, user.id, [body.fileId]);
      const [a] = await deps.db
        .insert(s.attachments)
        .values({ userId: user.id, fileId: body.fileId, entityType: 'progress', entityId: null, date: body.date, caption: body.caption ?? null, visibility: body.visibility })
        .returning();
      return photoView(deps, a!);
    },
  });

  r.add({
    method: 'patch',
    path: '/body/photos/:id',
    tag: 'Corpo',
    summary: 'Mudar legenda ou visibilidade de uma foto',
    params: idParams,
    body: z.object({ caption: z.string().trim().max(280).nullable().optional(), visibility: z.enum(['private', 'group']).optional() }),
    handler: async ({ deps, user, params, body }) => {
      const [a] = await deps.db.update(s.attachments).set(body).where(and(eq(s.attachments.id, params.id), eq(s.attachments.userId, user.id))).returning();
      if (!a) throw notFound('Foto');
      return photoView(deps, a);
    },
  });

  r.add({
    method: 'delete',
    path: '/body/photos/:id',
    tag: 'Corpo',
    summary: 'Apagar foto',
    params: idParams,
    handler: async ({ deps, user, params }) => {
      const [a] = await deps.db.select().from(s.attachments).where(eq(s.attachments.id, params.id));
      if (!a) throw notFound('Foto');
      if (a.userId !== user.id) throw forbidden();
      await deleteFile(deps, user.id, a.fileId);
      return undefined;
    },
  });

}
