/**
 * Gera apps/api/data/opengym-catalogue.json e opengym-plans.json a partir do openGym
 * (https://github.com/DuarteSantos8/openGym) num commit fixado.
 *
 *   npm run catalogue:build                    # clone esparso do commit padrão (só texto)
 *   npm run catalogue:build -- --path <clone>  # usa um clone local
 *   npm run catalogue:build -- --ref <commit>  # outra versão
 *
 * Só são lidos catalogue/exercises, catalogue/i18n/pt-BR.json e frontend/src/lib/starter.js.
 * As fotos/animações (catalogue/media) NÃO são baixadas nem usadas: são licenciadas pela
 * Gym visual exclusivamente para o app openGym. Ver docs/LICENCAS.md.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const OPENGYM_REPO = 'https://github.com/DuarteSantos8/openGym';
export const OPENGYM_DEFAULT_REF = '50ab7f24e3c4ee70e7f26b3beb426f571e03414b';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '../..');
const { values } = parseArgs({ options: { path: { type: 'string' }, ref: { type: 'string', default: OPENGYM_DEFAULT_REF } } });
const ref = values.ref!;
if (!/^[0-9a-f]{7,40}$/.test(ref)) throw new Error('--ref deve ser um hash de commit');

function sparseClone(): string {
  const dir = path.join(apiRoot, '.cache', `openGym-${ref.slice(0, 12)}`);
  if (existsSync(path.join(dir, 'catalogue', 'exercises'))) return dir;
  mkdirSync(path.dirname(dir), { recursive: true });
  const git = (...args: string[]) => execFileSync('git', args, { stdio: 'inherit', cwd: existsSync(dir) ? dir : apiRoot });
  git('clone', '--filter=blob:none', '--no-checkout', '--sparse', OPENGYM_REPO, dir);
  git('-C', dir, 'sparse-checkout', 'set', '--no-cone', 'catalogue/exercises/', 'catalogue/i18n/pt-BR.json', 'frontend/src/lib/starter.js', 'LICENSE', 'NOTICE.md');
  git('-C', dir, 'checkout', ref);
  return dir;
}

const root = values.path ?? sparseClone();
const commit = values.path ? execFileSync('git', ['-C', root, 'rev-parse', 'HEAD']).toString().trim() : ref;

interface RawExercise {
  id: string;
  name: string;
  bodyPart?: string;
  equipment?: string;
  target?: string;
  secondaryMuscles?: string[];
  category?: string;
  description?: string;
  instructions?: string[];
  textSource?: string;
  variantOf?: string;
  hold?: boolean;
}

const exDir = path.join(root, 'catalogue', 'exercises');
const raw: RawExercise[] = readdirSync(exDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(path.join(exDir, f), 'utf8')));
const ptBr: Record<string, { name?: string; description?: string; instructions?: string[] }> = JSON.parse(
  readFileSync(path.join(root, 'catalogue', 'i18n', 'pt-BR.json'), 'utf8'),
);

// Variantes femininas (variantOf) só mudam a figura da animação: ficam de fora.
const base = raw.filter((e) => !e.variantOf).sort((a, b) => a.id.localeCompare(b.id));
const exercises = base.map((e) => {
  const t = ptBr[e.id] ?? {};
  const ptInstr = t.instructions?.length ? t.instructions : null;
  return [
    e.id,
    t.name ?? e.name,
    e.name,
    e.bodyPart ?? null,
    e.equipment ?? null,
    e.target ?? null,
    e.secondaryMuscles ?? [],
    e.category ?? null,
    e.hold ? 1 : 0,
    t.description ?? e.description ?? '',
    ptInstr ?? e.instructions ?? [],
    ptInstr ? 'pt' : 'en',
    e.textSource === 'exercisedb' ? 'exercisedb-mit' : 'opengym-agpl',
  ];
});

// Planos iniciais: extraídos do starter.js do openGym (dados de treino, AGPL).
const starter = readFileSync(path.join(root, 'frontend', 'src', 'lib', 'starter.js'), 'utf8');
const ROUTINE_NAMES: Record<string, string> = {
  'Push Day': 'Empurrar (peito, ombro, tríceps)',
  'Pull Day': 'Puxar (costas, bíceps)',
  'Leg Day': 'Pernas',
  'Upper A': 'Superior A',
  'Upper B': 'Superior B',
  'Lower A': 'Inferior A',
  'Lower B': 'Inferior B',
  'Full Body A': 'Corpo inteiro A',
  'Full Body B': 'Corpo inteiro B',
  'Full Body C': 'Corpo inteiro C',
};
const PLAN_META: Record<string, { constName: string; name: string; description: string }> = {
  ppl: { constName: 'PPL', name: 'Push / Pull / Legs', description: 'Três treinos: empurrar, puxar e pernas. Clássico para hipertrofia.' },
  'upper-lower': { constName: 'UPPER_LOWER', name: 'Superior / Inferior', description: 'Quatro treinos alternando parte superior e inferior.' },
  'full-body': { constName: 'FULL_BODY', name: 'Corpo inteiro', description: 'Três treinos de corpo inteiro por semana.' },
  '5x5': { constName: 'FIVE_BY_FIVE', name: '5×5', description: 'Força nos básicos: 5 séries de 5 repetições.' },
};
const plans = Object.entries(PLAN_META).map(([key, meta]) => {
  const block = new RegExp(`const ${meta.constName} = \\[([\\s\\S]*?)\\n\\]`).exec(starter)?.[1];
  if (!block) throw new Error(`Plano ${meta.constName} não encontrado em starter.js`);
  const routines = [...block.matchAll(/\['([\w-]+)', '([^']+)', '\w+', \[((?:\['\d+', \d+, \d+\],?\s*)+)\]\]/g)].map((m) => ({
    key: m[1]!,
    name: ROUTINE_NAMES[m[2]!] ?? m[2]!,
    exercises: [...m[3]!.matchAll(/\['(\d+)', (\d+), (\d+)\]/g)].map((x) => ({ exerciseId: x[1]!, sets: Number(x[2]), reps: x[3]! })),
  }));
  const sched = new RegExp(`'?${key}'?: \\{ routines: ${meta.constName}, schedule: \\[([^\\n]*)\\] \\}`).exec(starter)?.[1] ?? '';
  const schedule = [...sched.matchAll(/\[(\d), '([\w-]+)'\]/g)].map((x) => ({ weekday: Number(x[1]), routineKey: x[2]! }));
  return { key, name: meta.name, description: meta.description, routines, schedule };
});
for (const p of plans) {
  if (!p.routines.length || !p.schedule.length) throw new Error(`Plano ${p.key} incompleto`);
  for (const r of p.routines) for (const e of r.exercises) if (!base.some((x) => x.id === e.exerciseId)) throw new Error(`Exercício ${e.exerciseId} do plano ${p.key} não existe`);
}

const source = { repository: OPENGYM_REPO, commit, generatedAt: new Date().toISOString(), license: 'Texto: AGPL-3.0 (openGym) e MIT (entradas de origem ExerciseDB v1). Mídias NÃO incluídas.' };
const dataDir = path.join(apiRoot, 'data');
mkdirSync(dataDir, { recursive: true });
writeFileSync(
  path.join(dataDir, 'opengym-catalogue.json'),
  JSON.stringify({
    source,
    columns: ['id', 'namePt', 'nameEn', 'bodyPart', 'equipment', 'target', 'secondary', 'category', 'hold', 'description', 'instructions', 'instructionsLang', 'textSource'],
    exercises,
  }),
);
writeFileSync(path.join(dataDir, 'opengym-plans.json'), JSON.stringify({ source, plans }, null, 2));
// A licença e o aviso de terceiros do openGym acompanham os dados (AGPL-3.0 / MIT).
for (const [from, to] of [['LICENSE', 'OPENGYM-LICENSE.txt'], ['NOTICE.md', 'OPENGYM-NOTICE.md']] as const) {
  if (existsSync(path.join(root, from))) writeFileSync(path.join(dataDir, to), readFileSync(path.join(root, from)));
}
const ptCount = exercises.filter((e) => e[11] === 'pt').length;
console.log(`Catálogo openGym @ ${commit.slice(0, 12)}: ${exercises.length} exercícios (${raw.length - base.length} variantes de figura ignoradas), ${ptCount} com instruções em pt-BR, ${plans.length} planos.`);
