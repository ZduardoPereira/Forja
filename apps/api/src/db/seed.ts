import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BODY_PART_LABELS, CATEGORY_LABELS, EQUIPMENT_LABELS, MUSCLE_LABELS } from '@forja/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { Db } from './client';
import { chatRooms, exercises, meta, routineExercises, routines } from './schema';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = [path.resolve(here, '../../data'), path.resolve(here, '../data')].find((p) => existsSync(path.join(p, 'opengym-catalogue.json')));

type Row = [string, string, string, string | null, string | null, string | null, string[], string | null, 0 | 1, string, string[], string, string];

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Dados de referência, idempotente: sala do grupo, catálogo de exercícios do openGym
 * (reimportado só quando o commit do arquivo muda) e os planos prontos.
 */
export async function seedReference(db: Db, logger?: Logger): Promise<void> {
  const [room] = await db.select({ id: chatRooms.id }).from(chatRooms).where(eq(chatRooms.kind, 'group')).limit(1);
  if (!room) await db.insert(chatRooms).values({ kind: 'group', title: 'Grupo' });

  if (!dataDir) {
    logger?.warn('Catálogo openGym não encontrado em apps/api/data — rode npm run catalogue:build');
    return;
  }
  const catalogue = JSON.parse(readFileSync(path.join(dataDir, 'opengym-catalogue.json'), 'utf8')) as { source: { commit: string }; exercises: Row[] };
  const [current] = await db.select().from(meta).where(eq(meta.key, 'catalogue_commit'));
  if (current?.value !== catalogue.source.commit) {
    const rows = catalogue.exercises.map(([id, namePt, nameEn, bodyPart, equipment, target, secondary, category, hold, description, instructions, instructionsLang, textSource]) => ({
      id,
      namePt,
      nameEn,
      bodyPart,
      equipment,
      target,
      secondary,
      category,
      hold: hold === 1,
      description,
      instructions,
      instructionsLang,
      textSource,
      search: normalize(
        [namePt, nameEn, bodyPart && BODY_PART_LABELS[bodyPart], equipment && EQUIPMENT_LABELS[equipment], target && MUSCLE_LABELS[target], category && CATEGORY_LABELS[category]]
          .filter(Boolean)
          .join(' '),
      ),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await db
        .insert(exercises)
        .values(rows.slice(i, i + 500))
        .onConflictDoUpdate({
          target: exercises.id,
          set: {
            namePt: sql`excluded.name_pt`,
            nameEn: sql`excluded.name_en`,
            bodyPart: sql`excluded.body_part`,
            equipment: sql`excluded.equipment`,
            target: sql`excluded.target`,
            secondary: sql`excluded.secondary`,
            category: sql`excluded.category`,
            hold: sql`excluded.hold`,
            description: sql`excluded.description`,
            instructions: sql`excluded.instructions`,
            instructionsLang: sql`excluded.instructions_lang`,
            textSource: sql`excluded.text_source`,
            search: sql`excluded.search`,
          },
        });
    }
    await db
      .insert(meta)
      .values({ key: 'catalogue_commit', value: catalogue.source.commit })
      .onConflictDoUpdate({ target: meta.key, set: { value: catalogue.source.commit } });
    logger?.info({ count: rows.length, commit: catalogue.source.commit.slice(0, 12) }, 'Catálogo openGym importado');
  }

  const plans = JSON.parse(readFileSync(path.join(dataDir, 'opengym-plans.json'), 'utf8')) as {
    plans: { key: string; name: string; description: string; routines: { key: string; name: string; exercises: { exerciseId: string; sets: number; reps: string }[] }[] }[];
  };
  let position = 0;
  for (const plan of plans.plans) {
    for (const r of plan.routines) {
      position++;
      const [existing] = await db
        .select({ id: routines.id })
        .from(routines)
        .where(and(isNull(routines.ownerId), eq(routines.planKey, plan.key), eq(routines.name, r.name)));
      if (existing) continue;
      const [created] = await db
        .insert(routines)
        .values({ ownerId: null, planKey: plan.key, planName: plan.name, name: r.name, description: plan.description, position })
        .returning({ id: routines.id });
      await db.insert(routineExercises).values(r.exercises.map((e, i) => ({ routineId: created!.id, position: i, exerciseId: e.exerciseId, sets: e.sets, reps: e.reps, restSec: null })));
    }
  }
}
