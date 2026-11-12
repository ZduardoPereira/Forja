/**
 * Pontuação da competição entre amigos — documentada em docs/TESTES_E_RANKING.md.
 *
 * Problema: uns querem emagrecer, outros ganhar massa. Comparar "kg perdidos" com
 * "kg ganhos" não é justo. Solução: cada pessoa é comparada com o RITMO SAUDÁVEL
 * ESPERADO para o próprio objetivo, no próprio corpo, no tempo decorrido.
 * Bater o ritmo esperado vale 100 pontos naquele bloco.
 *
 * Três blocos (pesos configuráveis por competição, padrão 50/30/20):
 * 1. Corpo — progresso em direção ao objetivo, normalizado pelo ritmo esperado.
 * 2. Desempenho — melhora nos testes físicos em relação ao início.
 * 3. Constância — dias ativos por semana (treinos registrados + presenças).
 */
import { completeComposition, type BodyPoint } from './body';
import type { Experience, Goal } from './domain';
import { effectiveValue, improvement, isBetter, TEST_BY_ID, TEST_IDS, type TestId, type TestResultLike } from './tests';
import { addDays, clamp, daysBetween, round } from './time';

/** Perda de gordura esperada: 0,5% do peso inicial por semana. */
export const FAT_LOSS_RATE_PER_WEEK = 0.005;
/** Ganho de massa magra esperado por mês, em fração do peso (regra prática por experiência). */
export const LEAN_GAIN_RATE_PER_MONTH: Record<Experience, number> = { beginner: 0.01, intermediate: 0.005, advanced: 0.0025 };
const WEEKS_PER_MONTH = 4.345;
/** Janela para achar a medida inicial: até 30 dias antes ou 14 dias depois do início. */
export const BASELINE_WINDOW = { before: 30, after: 14 } as const;

export interface CompetitionRules {
  startDate: string;
  endDate: string;
  weights: { body: number; performance: number; consistency: number };
  /** Dias ativos por semana que valem 100 pontos de constância. */
  consistencyTargetPerWeek: number;
}

export const DEFAULT_WEIGHTS = { body: 50, performance: 30, consistency: 20 } as const;

export interface ParticipantInput {
  userId: string;
  name: string;
  goal: Goal;
  experience: Experience;
  /** Pesagens e avaliações de composição (podem ter só peso). */
  body: BodyPoint[];
  tests: TestResultLike[];
  /** Datas (AAAA-MM-DD) com treino registrado ou presença confirmada. */
  activeDates: string[];
}

export type ComponentStatus = 'ok' | 'no_data' | 'not_applicable';

export interface ComponentResult {
  status: ComponentStatus;
  points: number;
  weight: number;
  summary: string;
  /** Mede só peso (sem % de gordura): menos preciso. */
  lowConfidence?: boolean;
}

export interface Standing {
  userId: string;
  name: string;
  goal: Goal;
  rank: number;
  total: number;
  body: ComponentResult;
  performance: ComponentResult;
  consistency: ComponentResult;
  tests: { testId: TestId; base: number; current: number; improvementPct: number; points: number }[];
}

/**
 * Converte "realizado ÷ esperado" em pontos. Até o esperado sobe linearmente; até 1,5×
 * fica em 100; acima disso cai (ritmo rápido demais não é saudável e não deve ser incentivado).
 */
export function ratioToPoints(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  if (ratio <= 1) return 100 * ratio;
  if (ratio <= 1.5) return 100;
  return Math.max(60, 100 - (ratio - 1.5) * 80);
}

const fmtKg = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(round(n, 1)).toString().replace('.', ',')} kg`;

/** Escolhe a medida inicial (a mais recente antes do início, ou a primeira logo depois) e a atual. */
function pickBaselineAndCurrent<T extends { date: string }>(points: T[], start: string, asOf: string): { base: T; current: T } | null {
  const sorted = [...points].filter((p) => p.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
  const before = sorted.filter((p) => p.date <= start && p.date >= addDays(start, -BASELINE_WINDOW.before));
  const after = sorted.filter((p) => p.date > start && p.date <= addDays(start, BASELINE_WINDOW.after));
  const base = before.at(-1) ?? after[0];
  if (!base) return null;
  const current = sorted.filter((p) => p.date > base.date).at(-1);
  return current ? { base, current } : null;
}

export function scoreBody(goal: Goal, experience: Experience, body: BodyPoint[], rules: CompetitionRules, asOf: string): ComponentResult {
  const weight = rules.weights.body;
  if (goal === 'performance') return { status: 'not_applicable', points: 0, weight: 0, summary: 'Objetivo "Performance": o corpo não pontua.' };
  const complete = body.map(completeComposition);
  const comp = pickBaselineAndCurrent(
    complete.filter((p) => p.fatMassKg != null && p.leanMassKg != null && p.weightKg != null),
    rules.startDate,
    asOf,
  );
  const weeksOf = (a: string, b: string) => Math.max(1, daysBetween(a, b) / 7);

  if (comp) {
    const { base, current } = comp;
    const w0 = base.weightKg!;
    const weeks = weeksOf(base.date, current.date);
    const fatDelta = current.fatMassKg! - base.fatMassKg!; // negativo = perdeu gordura
    const leanDelta = current.leanMassKg! - base.leanMassKg!;
    const expectedFatLoss = FAT_LOSS_RATE_PER_WEEK * w0 * weeks;
    const expectedLeanGain = LEAN_GAIN_RATE_PER_MONTH[experience] * w0 * (weeks / WEEKS_PER_MONTH);
    let ratio: number;
    if (goal === 'lose_fat') {
      // Perder massa magra junto desconta metade do que foi perdido.
      ratio = (-fatDelta - 0.5 * Math.max(0, -leanDelta)) / expectedFatLoss;
    } else if (goal === 'gain_muscle') {
      // Ganhar mais gordura que músculo desconta metade do excesso.
      ratio = (leanDelta - 0.5 * Math.max(0, fatDelta - leanDelta)) / expectedLeanGain;
    } else {
      // Recomposição: metade do ritmo de cada lado, média dos dois.
      const r1 = clamp(-fatDelta / (expectedFatLoss / 2), 0, 1.5);
      const r2 = clamp(leanDelta / (expectedLeanGain / 2), 0, 1.5);
      ratio = (r1 + r2) / 2;
    }
    const expectedText =
      goal === 'lose_fat' ? `esperado ${fmtKg(-expectedFatLoss)} de gordura` : goal === 'gain_muscle' ? `esperado ${fmtKg(expectedLeanGain)} de massa magra` : 'meio ritmo de cada lado';
    return {
      status: 'ok',
      points: round(ratioToPoints(ratio), 1),
      weight,
      summary: `Gordura ${fmtKg(fatDelta)} · massa magra ${fmtKg(leanDelta)} em ${round(weeks, 1).toString().replace('.', ',')} sem. (${expectedText})`,
    };
  }

  const wt = pickBaselineAndCurrent(
    complete.filter((p) => p.weightKg != null),
    rules.startDate,
    asOf,
  );
  if (!wt) return { status: 'no_data', points: 0, weight, summary: 'Faltam pesagens: uma no início e outra depois.' };
  if (goal === 'recomp') {
    return { status: 'no_data', points: 0, weight, summary: 'Recomposição precisa de avaliações com % de gordura (só o peso não mostra).' };
  }
  const w0 = wt.base.weightKg!;
  const weeks = weeksOf(wt.base.date, wt.current.date);
  const delta = wt.current.weightKg! - w0;
  let ratio: number;
  if (goal === 'lose_fat') ratio = -delta / (FAT_LOSS_RATE_PER_WEEK * w0 * weeks);
  // Só peso: metade do ganho é tratada como massa magra, e no máximo 100 pontos.
  else ratio = Math.min(1, delta / (2 * LEAN_GAIN_RATE_PER_MONTH[experience] * w0 * (weeks / WEEKS_PER_MONTH)));
  return {
    status: 'ok',
    points: round(ratioToPoints(ratio), 1),
    weight,
    lowConfidence: true,
    summary: `Peso ${fmtKg(delta)} em ${round(weeks, 1).toString().replace('.', ',')} sem. (sem % de gordura — registre uma avaliação para mais precisão)`,
  };
}

export function scorePerformance(tests: TestResultLike[], rules: CompetitionRules, asOf: string): { result: ComponentResult; tests: Standing['tests'] } {
  const weight = rules.weights.performance;
  const perTest: Standing['tests'] = [];
  for (const id of TEST_IDS) {
    const def = TEST_BY_ID[id];
    const own = tests.filter((t) => t.testId === id && t.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
    const before = own.filter((t) => t.date <= rules.startDate && t.date >= addDays(rules.startDate, -BASELINE_WINDOW.before));
    const after = own.filter((t) => t.date > rules.startDate && t.date <= addDays(rules.startDate, BASELINE_WINDOW.after));
    const base = before.at(-1) ?? after[0];
    if (!base) continue;
    const later = own.filter((t) => t.date > base.date && t.date <= rules.endDate);
    if (!later.length) continue;
    const bestLater = later.reduce((a, b) => (isBetter(def, effectiveValue(b), effectiveValue(a)) ? b : a));
    const b = effectiveValue(base);
    const c = effectiveValue(bestLater);
    const imp = improvement(def, b, c);
    perTest.push({ testId: id, base: round(b, 2), current: round(c, 2), improvementPct: round(imp * 100, 1), points: round(clamp(imp / def.improvementCap, 0, 1) * 100, 1) });
  }
  if (!perTest.length) {
    return { result: { status: 'no_data', points: 0, weight, summary: 'Faça um teste no início e repita durante a competição.' }, tests: perTest };
  }
  const points = perTest.reduce((a, t) => a + t.points, 0) / perTest.length;
  return {
    result: { status: 'ok', points: round(points, 1), weight, summary: `Média de ${perTest.length} teste(s) comparado(s) com o início.` },
    tests: perTest,
  };
}

export function scoreConsistency(activeDates: string[], rules: CompetitionRules, asOf: string): ComponentResult {
  const weight = rules.weights.consistency;
  const end = asOf < rules.endDate ? asOf : rules.endDate;
  if (end < rules.startDate) return { status: 'no_data', points: 0, weight, summary: 'A competição ainda não começou.' };
  const days = new Set(activeDates.filter((d) => d >= rules.startDate && d <= end));
  const weeks = Math.max(1, (daysBetween(rules.startDate, end) + 1) / 7);
  const perWeek = days.size / weeks;
  return {
    status: 'ok',
    points: round(Math.min(1, perWeek / rules.consistencyTargetPerWeek) * 100, 1),
    weight,
    summary: `${days.size} dia(s) ativo(s) · ${round(perWeek, 1).toString().replace('.', ',')}/semana (meta ${rules.consistencyTargetPerWeek})`,
  };
}

/** Classificação completa. `asOf` = hoje (ou o fim, se já acabou). */
export function scoreCompetition(rules: CompetitionRules, participants: ParticipantInput[], asOf: string): Standing[] {
  const at = asOf > rules.endDate ? rules.endDate : asOf;
  const rows = participants.map((p) => {
    const body = scoreBody(p.goal, p.experience, p.body, rules, at);
    const perf = scorePerformance(p.tests, rules, at);
    const consistency = scoreConsistency(p.activeDates, rules, at);
    const parts = [body, perf.result, consistency].filter((c) => c.status !== 'not_applicable' && c.weight > 0);
    const totalWeight = parts.reduce((a, c) => a + c.weight, 0);
    const total = totalWeight ? parts.reduce((a, c) => a + c.points * c.weight, 0) / totalWeight : 0;
    return { userId: p.userId, name: p.name, goal: p.goal, rank: 0, total: round(total, 1), body, performance: perf.result, consistency, tests: perf.tests };
  });
  rows.sort((a, b) => b.total - a.total || b.consistency.points - a.consistency.points || a.name.localeCompare(b.name));
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1]!.total === r.total ? rows[i - 1]!.rank : i + 1;
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Ranking permanente "Evolução no objetivo" (sem precisar criar competição)
// ---------------------------------------------------------------------------

/** Janela do ranking de evolução: a partir da primeira medida dos últimos 90 dias. */
export const EVOLUTION_WINDOW_DAYS = 90;
/** Mínimo entre a primeira e a última medida para a evolução valer (evita ruído de 2 ou 3 dias). */
export const EVOLUTION_MIN_DAYS = 7;

export interface EvolutionResult {
  status: ComponentStatus;
  /** 0–100: 100 = no ritmo saudável esperado para o objetivo. */
  points: number;
  summary: string;
  lowConfidence?: boolean;
  /** O que foi medido: corpo (emagrecer/massa/recomposição) ou testes (performance). */
  basis: 'body' | 'tests';
  since: string | null;
}

export function scoreEvolution(p: Pick<ParticipantInput, 'goal' | 'experience' | 'body' | 'tests'>, today: string): EvolutionResult {
  const from = addDays(today, -EVOLUTION_WINDOW_DAYS);
  const rulesFrom = (start: string, weights: CompetitionRules['weights']): CompetitionRules => ({ startDate: start, endDate: today, weights, consistencyTargetPerWeek: 1 });
  const waiting = (start: string, basis: EvolutionResult['basis']): EvolutionResult => ({
    status: 'no_data',
    points: 0,
    basis,
    since: start,
    summary: `Primeira medida em ${start.slice(8, 10)}/${start.slice(5, 7)}: a evolução aparece com ${EVOLUTION_MIN_DAYS} dias ou mais de registros.`,
  });

  if (p.goal === 'performance') {
    const tests = p.tests.filter((t) => t.date >= from && t.date <= today);
    const dates = tests.map((t) => t.date).sort();
    const start = dates[0];
    if (!start) return { status: 'no_data', points: 0, basis: 'tests', since: null, summary: 'Registre um teste físico e repita depois para medir a evolução.' };
    if (daysBetween(start, dates.at(-1)!) < EVOLUTION_MIN_DAYS) return waiting(start, 'tests');
    const r = scorePerformance(tests, rulesFrom(start, { body: 0, performance: 100, consistency: 0 }), today).result;
    return { status: r.status, points: r.points, summary: r.status === 'ok' ? r.summary : 'Repita um teste que você já fez para medir a melhora.', basis: 'tests', since: start };
  }

  const body = p.body.filter((b) => b.date >= from && b.date <= today && (b.weightKg != null || b.bodyFatPct != null || b.fatMassKg != null || b.leanMassKg != null));
  const dates = body.map((b) => b.date).sort();
  const start = dates[0];
  if (!start) return { status: 'no_data', points: 0, basis: 'body', since: null, summary: 'Registre seu peso (ou uma avaliação) e repita depois para medir a evolução.' };
  if (daysBetween(start, dates.at(-1)!) < EVOLUTION_MIN_DAYS) return waiting(start, 'body');
  const r = scoreBody(p.goal, p.experience, body, rulesFrom(start, { body: 100, performance: 0, consistency: 0 }), today);
  return { status: r.status, points: r.points, summary: r.summary, lowConfidence: r.lowConfidence, basis: 'body', since: start };
}
