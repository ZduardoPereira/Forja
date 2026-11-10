/**
 * Testes físicos do FORJA: velocidade, resistência, força (powerlifting) e calistenia.
 *
 * A escala 0–20 do radar é uma CONVENÇÃO do app (estilo ficha de personagem):
 * cada teste tem uma âncora "0" (iniciante) e uma âncora "20" (muito avançado),
 * com interpolação linear. Não é norma científica; os valores estão em um só lugar
 * (TESTS abaixo) para o grupo ajustar. Ver docs/TESTES_E_RANKING.md.
 */
import { estimateOneRm } from './strength';
import { clamp, round } from './time';

export const TEST_IDS = ['max_speed', 'sprint_100m', 'run_1k', 'run_5k', 'run_10k', 'squat', 'bench', 'deadlift', 'pull_ups', 'push_ups', 'sit_ups'] as const;
export type TestId = (typeof TEST_IDS)[number];

export const TEST_GROUPS = ['speed', 'endurance', 'strength', 'calisthenics'] as const;
export type TestGroup = (typeof TEST_GROUPS)[number];
export const TEST_GROUP_LABELS: Record<TestGroup, string> = {
  speed: 'Velocidade',
  endurance: 'Resistência',
  strength: 'Força (powerlifting)',
  calisthenics: 'Calistenia',
};

export interface TestDef {
  id: TestId;
  name: string;
  /** Rótulo curto do eixo do radar. */
  short: string;
  group: TestGroup;
  /** speed: km/h · time: segundos · load: kg × repetições · reps: repetições. */
  input: 'speed' | 'time' | 'load' | 'reps';
  unit: string;
  direction: 'higher' | 'lower';
  distanceM?: number;
  /** Limites aceitos para o valor registrado. */
  min: number;
  max: number;
  /** Âncoras do radar: valor que vale 0 e valor que vale 20 (força: múltiplos do peso corporal). */
  radar: { zero: number; twenty: number };
  /** Força sem peso corporal registrado: âncoras absolutas em kg. */
  radarAbsolute?: { zero: number; twenty: number };
  /** Melhora (fração) que vale 100 pontos na competição. */
  improvementCap: number;
  protocol: string[];
}

const RUN_PROTOCOL = [
  'Aqueça 10 minutos antes.',
  'Percurso medido e plano (pista, rua sem desnível ou esteira a 1% de inclinação).',
  'Registre o tempo total; tempos de relógio GPS valem se o percurso conferir.',
];

export const TESTS: TestDef[] = [
  {
    id: 'max_speed',
    name: 'Velocidade máxima',
    short: 'Vel. máx',
    group: 'speed',
    input: 'speed',
    unit: 'km/h',
    direction: 'higher',
    min: 5,
    max: 45,
    radar: { zero: 12, twenty: 36 },
    improvementCap: 0.1,
    protocol: [
      'Maior velocidade sustentada por pelo menos 2 segundos em tiro de corrida.',
      'Medida por GPS de boa qualidade, cronometragem em trecho curto ou esteira.',
      'Picos de GPS isolados não valem — confira se faz sentido.',
    ],
  },
  {
    id: 'sprint_100m',
    name: '100 metros',
    short: '100 m',
    group: 'speed',
    input: 'time',
    unit: 's',
    direction: 'lower',
    distanceM: 100,
    min: 9.5,
    max: 40,
    radar: { zero: 22, twenty: 11 },
    improvementCap: 0.08,
    protocol: ['Saída parada, sem bloco.', 'Cronometragem manual por outra pessoa ou fotocélula.', 'Melhor de 2 tentativas com 3 minutos de descanso.'],
  },
  {
    id: 'run_1k',
    name: '1 km',
    short: '1 km',
    group: 'endurance',
    input: 'time',
    unit: 's',
    direction: 'lower',
    distanceM: 1000,
    min: 140,
    max: 1200,
    radar: { zero: 480, twenty: 160 },
    improvementCap: 0.1,
    protocol: RUN_PROTOCOL,
  },
  {
    id: 'run_5k',
    name: '5 km',
    short: '5 km',
    group: 'endurance',
    input: 'time',
    unit: 's',
    direction: 'lower',
    distanceM: 5000,
    min: 750,
    max: 5400,
    radar: { zero: 2700, twenty: 900 },
    improvementCap: 0.1,
    protocol: RUN_PROTOCOL,
  },
  {
    id: 'run_10k',
    name: '10 km',
    short: '10 km',
    group: 'endurance',
    input: 'time',
    unit: 's',
    direction: 'lower',
    distanceM: 10000,
    min: 1560,
    max: 10800,
    radar: { zero: 5400, twenty: 1860 },
    improvementCap: 0.1,
    protocol: RUN_PROTOCOL,
  },
  {
    id: 'squat',
    name: 'Agachamento',
    short: 'Agach.',
    group: 'strength',
    input: 'load',
    unit: 'kg',
    direction: 'higher',
    min: 1,
    max: 500,
    radar: { zero: 0.5, twenty: 2.5 },
    radarAbsolute: { zero: 40, twenty: 200 },
    improvementCap: 0.15,
    protocol: ['Barra nas costas, quadril abaixo da linha do joelho.', 'Use segurança (pinos ou alguém ajudando).', 'Registre a carga e as repetições completas (1 a 12).'],
  },
  {
    id: 'bench',
    name: 'Supino',
    short: 'Supino',
    group: 'strength',
    input: 'load',
    unit: 'kg',
    direction: 'higher',
    min: 1,
    max: 400,
    radar: { zero: 0.4, twenty: 1.8 },
    radarAbsolute: { zero: 30, twenty: 150 },
    improvementCap: 0.15,
    protocol: ['Barra toca o peito e sobe até estender os braços.', 'Sempre com alguém de apoio.', 'Registre a carga e as repetições completas (1 a 12).'],
  },
  {
    id: 'deadlift',
    name: 'Levantamento terra',
    short: 'Terra',
    group: 'strength',
    input: 'load',
    unit: 'kg',
    direction: 'higher',
    min: 1,
    max: 500,
    radar: { zero: 0.75, twenty: 3.0 },
    radarAbsolute: { zero: 60, twenty: 240 },
    improvementCap: 0.15,
    protocol: ['Da barra no chão até ficar ereto com quadril e joelhos estendidos.', 'Coluna neutra; pare se a técnica quebrar.', 'Registre a carga e as repetições completas (1 a 12).'],
  },
  {
    id: 'pull_ups',
    name: 'Barras',
    short: 'Barras',
    group: 'calisthenics',
    input: 'reps',
    unit: 'reps',
    direction: 'higher',
    min: 0,
    max: 100,
    radar: { zero: 0, twenty: 25 },
    improvementCap: 0.4,
    protocol: ['Pegada pronada, partindo do braço estendido.', 'Queixo acima da barra a cada repetição.', 'Máximo de repetições seguidas, sem balanço.'],
  },
  {
    id: 'push_ups',
    name: 'Flexões',
    short: 'Flexões',
    group: 'calisthenics',
    input: 'reps',
    unit: 'reps',
    direction: 'higher',
    min: 0,
    max: 300,
    radar: { zero: 0, twenty: 70 },
    improvementCap: 0.4,
    protocol: ['Corpo alinhado, peito a um punho do chão.', 'Extensão completa dos braços em cima.', 'Máximo de repetições seguidas.'],
  },
  {
    id: 'sit_ups',
    name: 'Abdominais (1 min)',
    short: 'Abdom.',
    group: 'calisthenics',
    input: 'reps',
    unit: 'reps',
    direction: 'higher',
    min: 0,
    max: 120,
    radar: { zero: 10, twenty: 60 },
    improvementCap: 0.3,
    protocol: ['Abdominal completo (tronco até os joelhos), pés apoiados.', 'Conte as repetições em 1 minuto.', 'Mãos cruzadas no peito.'],
  },
];

export const TEST_BY_ID = Object.fromEntries(TESTS.map((t) => [t.id, t])) as Record<TestId, TestDef>;

export interface TestResultLike {
  testId: TestId;
  date: string;
  value: number;
  reps?: number | null;
  bodyweightKg?: number | null;
}

/** Valor comparável do resultado: força usa o 1RM estimado; os demais, o próprio valor. */
export function effectiveValue(r: Pick<TestResultLike, 'testId' | 'value' | 'reps'>): number {
  return TEST_BY_ID[r.testId].input === 'load' ? estimateOneRm(r.value, r.reps ?? 1) : r.value;
}

export function isBetter(def: TestDef, a: number, b: number): boolean {
  return def.direction === 'higher' ? a > b : a < b;
}

/** Melhor resultado de um teste (empate: o mais antigo). */
export function bestResult<T extends TestResultLike>(results: T[]): T | null {
  let best: T | null = null;
  for (const r of [...results].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!best || isBetter(TEST_BY_ID[r.testId], effectiveValue(r), effectiveValue(best))) best = r;
  }
  return best;
}

/** Melhora relativa (fração) respeitando a direção do teste. Positivo = melhorou. */
export function improvement(def: TestDef, base: number, current: number): number {
  if (def.direction === 'higher') return (current - base) / Math.max(base, 1);
  return (base - current) / base;
}

export function validateResult(input: { testId: TestId; value: number; reps?: number | null }): string[] {
  const def = TEST_BY_ID[input.testId];
  const errors: string[] = [];
  if (!Number.isFinite(input.value)) return ['Valor inválido'];
  if (input.value < def.min || input.value > def.max) errors.push(`${def.name}: informe um valor entre ${def.min} e ${def.max} ${def.unit === 's' ? 'segundos' : def.unit}.`);
  if (def.input === 'reps' && !Number.isInteger(input.value)) errors.push('Repetições devem ser um número inteiro.');
  if (def.input === 'load') {
    if (input.reps == null || !Number.isInteger(input.reps) || input.reps < 1 || input.reps > 12) errors.push('Informe de 1 a 12 repetições completas.');
  }
  return errors;
}

/**
 * Pontuação 0–20 do radar.
 * - Tempos: interpolação linear na VELOCIDADE (distância/tempo), mais justa que no tempo.
 * - Força: 1RM estimado ÷ peso corporal; sem peso registrado, âncoras absolutas.
 * - Repetições e km/h: interpolação linear direta.
 */
export function radarScore(r: TestResultLike, bodyweightKg?: number | null): number {
  const def = TEST_BY_ID[r.testId];
  const lerp = (v: number, zero: number, twenty: number) => clamp(((v - zero) / (twenty - zero)) * 20, 0, 20);
  let score: number;
  if (def.input === 'time') {
    const d = def.distanceM!;
    score = lerp(d / r.value, d / def.radar.zero, d / def.radar.twenty);
  } else if (def.input === 'load') {
    const orm = effectiveValue(r);
    // Peso do dia do teste (registrado junto) tem prioridade sobre o peso atual.
    const bw = r.bodyweightKg ?? bodyweightKg;
    score = bw ? lerp(orm / bw, def.radar.zero, def.radar.twenty) : lerp(orm, def.radarAbsolute!.zero, def.radarAbsolute!.twenty);
  } else {
    score = lerp(r.value, def.radar.zero, def.radar.twenty);
  }
  return round(score, 1);
}

export interface RadarAxis {
  testId: TestId;
  label: string;
  score: number | null;
  best: TestResultLike | null;
}

/** Eixos do radar de um perfil (melhor resultado de cada teste). null = teste ainda não feito. */
export function radarProfile(results: TestResultLike[], bodyweightKg?: number | null): RadarAxis[] {
  return TESTS.map((def) => {
    const best = bestResult(results.filter((r) => r.testId === def.id));
    return { testId: def.id, label: def.short, best, score: best ? radarScore(best, bodyweightKg) : null };
  });
}
