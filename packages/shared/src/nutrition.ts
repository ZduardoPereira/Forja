/**
 * Estimativas de gasto energético e metas de dieta. São pontos de partida:
 * o plano do nutricionista sempre tem prioridade (o app avisa isso na tela).
 */
import type { Goal, Sex } from './domain';
import { round } from './time';

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'high', 'athlete'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725, athlete: 1.9 };
export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentário',
  light: 'Leve (1–3 treinos/sem.)',
  moderate: 'Moderado (3–5 treinos/sem.)',
  high: 'Alto (6–7 treinos/sem.)',
  athlete: 'Muito alto (2× por dia)',
};

/** Taxa metabólica basal — Mifflin-St Jeor (1990). */
export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, ageYears: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === 'male' ? 5 : -161);
}

/** Taxa metabólica basal — Katch-McArdle, quando a massa magra é conhecida. */
export function bmrKatchMcArdle(leanMassKg: number): number {
  return 370 + 21.6 * leanMassKg;
}

export interface NutritionInput {
  goal: Goal;
  sex: Sex | null;
  weightKg: number | null;
  heightCm: number | null;
  ageYears: number | null;
  leanMassKg: number | null;
  activity: ActivityLevel;
}

export interface NutritionTargets {
  method: 'katch_mcardle' | 'mifflin_st_jeor';
  bmrKcal: number;
  tdeeKcal: number;
  targetKcal: number;
  adjustmentPct: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  notes: string[];
}

const CALORIE_ADJUSTMENT: Record<Goal, number> = { lose_fat: -0.2, gain_muscle: 0.1, recomp: -0.05, performance: 0 };
const PROTEIN_G_PER_KG: Record<Goal, number> = { lose_fat: 2.0, gain_muscle: 1.8, recomp: 2.0, performance: 1.6 };

/** Retorna `{ missing }` quando faltam dados (peso + altura + idade + sexo, ou peso + massa magra). */
export function nutritionTargets(i: NutritionInput): NutritionTargets | { missing: string[] } {
  const missing: string[] = [];
  if (i.weightKg == null) missing.push('peso');
  const canKatch = i.leanMassKg != null;
  if (!canKatch) {
    if (i.heightCm == null) missing.push('altura');
    if (i.ageYears == null) missing.push('data de nascimento');
    if (i.sex == null) missing.push('sexo');
  }
  if (missing.length) return { missing };
  const bmr = canKatch ? bmrKatchMcArdle(i.leanMassKg!) : bmrMifflin(i.sex!, i.weightKg!, i.heightCm!, i.ageYears!);
  const tdee = bmr * ACTIVITY_FACTORS[i.activity];
  const adj = CALORIE_ADJUSTMENT[i.goal];
  const target = tdee * (1 + adj);
  const protein = PROTEIN_G_PER_KG[i.goal] * i.weightKg!;
  // Gordura: 0,8 g/kg, mas nunca abaixo de 20% das calorias.
  const fat = Math.max(0.8 * i.weightKg!, (target * 0.2) / 9);
  const carbs = Math.max(0, (target - protein * 4 - fat * 9) / 4);
  return {
    method: canKatch ? 'katch_mcardle' : 'mifflin_st_jeor',
    bmrKcal: Math.round(bmr),
    tdeeKcal: Math.round(tdee),
    targetKcal: Math.round(target / 10) * 10,
    adjustmentPct: Math.round(adj * 100),
    proteinG: Math.round(protein),
    fatG: Math.round(fat),
    carbsG: Math.round(carbs),
    notes: [
      canKatch ? 'Basal pela fórmula de Katch-McArdle (usa sua massa magra).' : 'Basal pela fórmula de Mifflin-St Jeor.',
      `Meta = gasto diário ${adj === 0 ? 'sem ajuste' : `${adj > 0 ? '+' : ''}${round(adj * 100, 0)}%`} para "${i.goal === 'lose_fat' ? 'emagrecer' : i.goal === 'gain_muscle' ? 'ganhar massa' : i.goal === 'recomp' ? 'recomposição' : 'performance'}".`,
      'Estimativa de partida. Se você tem plano de nutricionista, siga o plano.',
    ],
  };
}
