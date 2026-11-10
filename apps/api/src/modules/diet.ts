import { dietPlanSchema } from '@forja/shared';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Deps } from '../deps';
import { notFound } from '../http/errors';
import type { RouteRegistry } from '../http/registry';
import { assertOwnFiles, fileView } from '../services/files';

/** Planos alimentares são sempre privados: só o dono vê. */
async function loadPlans(deps: Deps, userId: string) {
  const plans = await deps.db.select().from(s.dietPlans).where(eq(s.dietPlans.userId, userId)).orderBy(desc(s.dietPlans.active), desc(s.dietPlans.updatedAt));
  const atts = await deps.db.select().from(s.attachments).where(and(eq(s.attachments.userId, userId), eq(s.attachments.entityType, 'diet_plan')));
  return plans.map((p) => ({ ...p, attachments: atts.filter((a) => a.entityId === p.id).map((a) => ({ id: a.id, file: fileView(deps, a.fileId)! })) }));
}

async function savePlan(deps: Deps, userId: string, body: z.output<typeof dietPlanSchema>, id?: string) {
  const { fileIds, ...fields } = body;
  return deps.db.transaction(async (tx) => {
    await assertOwnFiles(tx, userId, fileIds);
    if (fields.active) await tx.update(s.dietPlans).set({ active: false }).where(eq(s.dietPlans.userId, userId));
    const values = {
      ...fields,
      professional: fields.professional ?? null,
      startDate: fields.startDate ?? null,
      caloriesKcal: fields.caloriesKcal ?? null,
      proteinG: fields.proteinG ?? null,
      carbsG: fields.carbsG ?? null,
      fatG: fields.fatG ?? null,
      notes: fields.notes ?? null,
      updatedAt: deps.now(),
    };
    let row;
    if (id) {
      [row] = await tx.update(s.dietPlans).set(values).where(and(eq(s.dietPlans.id, id), eq(s.dietPlans.userId, userId))).returning();
      if (!row) throw notFound('Plano');
    } else {
      [row] = await tx.insert(s.dietPlans).values({ ...values, userId }).returning();
    }
    await tx.delete(s.attachments).where(and(eq(s.attachments.entityType, 'diet_plan'), eq(s.attachments.entityId, row!.id)));
    const date = (fields.startDate ?? deps.now().toISOString()).slice(0, 10);
    if (fileIds.length) await tx.insert(s.attachments).values(fileIds.map((fileId) => ({ userId, fileId, entityType: 'diet_plan', entityId: row!.id, date })));
    return row;
  });
}

export function dietRoutes(r: RouteRegistry) {
  r.add({ method: 'get', path: '/diet', tag: 'Dieta', summary: 'Meus planos alimentares', handler: ({ deps, user }) => loadPlans(deps, user.id) });
  r.add({ method: 'post', path: '/diet', tag: 'Dieta', summary: 'Criar plano (refeições + fotos do plano do nutricionista)', status: 201, body: dietPlanSchema, handler: ({ deps, user, body }) => savePlan(deps, user.id, body) });
  r.add({
    method: 'put',
    path: '/diet/:id',
    tag: 'Dieta',
    summary: 'Editar plano',
    params: z.object({ id: z.uuid() }),
    body: dietPlanSchema,
    handler: ({ deps, user, params, body }) => savePlan(deps, user.id, body, params.id),
  });
  r.add({
    method: 'delete',
    path: '/diet/:id',
    tag: 'Dieta',
    summary: 'Apagar plano',
    params: z.object({ id: z.uuid() }),
    handler: async ({ deps, user, params }) => {
      const rows = await deps.db.delete(s.dietPlans).where(and(eq(s.dietPlans.id, params.id), eq(s.dietPlans.userId, user.id))).returning({ id: s.dietPlans.id });
      if (!rows.length) throw notFound('Plano');
      await deps.db.delete(s.attachments).where(and(eq(s.attachments.entityType, 'diet_plan'), eq(s.attachments.entityId, params.id)));
      return undefined;
    },
  });
}
