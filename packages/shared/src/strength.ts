import type { Sex } from './domain';

/**
 * 1RM estimado (Epley): carga × (1 + reps/30). Com 1 repetição é a própria carga.
 * Acima de 10 repetições a fórmula perde precisão — o app aceita até 12 e marca como estimativa.
 */
export function estimateOneRm(loadKg: number, reps: number): number {
  if (reps <= 1) return loadKg;
  return loadKg * (1 + reps / 30);
}

/**
 * Coeficientes DOTS (pontuação de força relativa ao peso corporal usada no powerlifting).
 * DOTS = carga × 500 / (a + b·p + c·p² + d·p³ + e·p⁴), com p = peso corporal (kg) limitado à faixa válida.
 */
const DOTS = {
  male: { a: -307.75076, b: 24.0900756, c: -0.1918759221, d: 0.0007391293, e: -0.000001093, min: 40, max: 210 },
  female: { a: -57.96288, b: 13.6175032, c: -0.1126655495, d: 0.0005158568, e: -0.0000010706, min: 40, max: 150 },
} as const;

export function dotsCoefficient(bodyweightKg: number, sex: Sex): number {
  const k = DOTS[sex];
  const p = Math.min(k.max, Math.max(k.min, bodyweightKg));
  return 500 / (k.a + k.b * p + k.c * p ** 2 + k.d * p ** 3 + k.e * p ** 4);
}

/** Pontos DOTS de uma carga (total ou levantamento isolado). */
export function dotsScore(liftedKg: number, bodyweightKg: number, sex: Sex): number {
  return liftedKg * dotsCoefficient(bodyweightKg, sex);
}
