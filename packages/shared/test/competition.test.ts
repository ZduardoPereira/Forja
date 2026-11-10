import { describe, expect, it } from 'vitest';
import { type CompetitionRules, type ParticipantInput, ratioToPoints, scoreBody, scoreCompetition, scoreConsistency, scorePerformance } from '../src';

const rules: CompetitionRules = {
  startDate: '2026-11-01',
  endDate: '2027-01-31',
  weights: { body: 50, performance: 30, consistency: 20 },
  consistencyTargetPerWeek: 3,
};
const asOf = '2026-11-29';

const days = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `2026-11-${String(from + i * 2).padStart(2, '0')}`);

const ana: ParticipantInput = {
  userId: 'a',
  name: 'Ana',
  goal: 'lose_fat',
  experience: 'beginner',
  // 4 semanas: perdeu 1,73 kg de gordura (esperado 1,6 kg = 0,5% × 80 kg × 4)
  body: [
    { date: '2026-10-30', weightKg: 80, bodyFatPct: 30 },
    { date: '2026-11-27', weightKg: 78.4, fatMassKg: 22.27, leanMassKg: 56.13 },
  ],
  tests: [
    { testId: 'run_5k', date: '2026-10-28', value: 1800 },
    { testId: 'run_5k', date: '2026-11-20', value: 1700 },
  ],
  activeDates: days(12),
};

const bruno: ParticipantInput = {
  userId: 'b',
  name: 'Bruno',
  goal: 'gain_muscle',
  experience: 'beginner',
  // 4 semanas: +0,66 kg de massa magra (esperado 0,64 kg = 1%/mês × 70 kg) e só +0,2 kg de gordura
  body: [
    { date: '2026-10-31', weightKg: 70, fatMassKg: 10.5, leanMassKg: 59.5 },
    { date: '2026-11-28', weightKg: 70.86, fatMassKg: 10.7, leanMassKg: 60.16 },
  ],
  tests: [
    { testId: 'bench', date: '2026-11-02', value: 80, reps: 5 },
    { testId: 'bench', date: '2026-11-25', value: 85, reps: 5 },
  ],
  activeDates: days(9),
};

describe('competição — bloco Corpo', () => {
  it('é justo entre objetivos opostos: quem cumpre o ritmo esperado faz 100', () => {
    const a = scoreBody(ana.goal, ana.experience, ana.body, rules, asOf);
    const b = scoreBody(bruno.goal, bruno.experience, bruno.body, rules, asOf);
    expect(a).toMatchObject({ status: 'ok', points: 100 });
    expect(b).toMatchObject({ status: 'ok', points: 100 });
    expect(a.summary).toContain('Gordura −1,7 kg');
  });

  it('perder massa magra junto reduz a pontuação de quem emagrece', () => {
    const lostMuscle = scoreBody('lose_fat', 'beginner', [ana.body[0]!, { date: '2026-11-27', weightKg: 77.3, fatMassKg: 23.0, leanMassKg: 54.3 }], rules, asOf);
    // gordura −1,0 kg, magra −1,7 kg → crédito 1,0 − 0,85 = 0,15 de 1,6 esperados
    expect(lostMuscle.points).toBeCloseTo(9.4, 1);
  });

  it('ganhar mais gordura que músculo reduz a pontuação de quem quer massa', () => {
    const dirtyBulk = scoreBody('gain_muscle', 'beginner', [bruno.body[0]!, { date: '2026-11-28', weightKg: 72.6, fatMassKg: 12.6, leanMassKg: 60.0 }], rules, asOf);
    // magra +0,5; gordura +2,1 → crédito 0,5 − 0,5×1,6 = −0,3 → 0 pontos
    expect(dirtyBulk.points).toBe(0);
  });

  it('ritmo rápido demais deixa de render mais pontos', () => {
    expect(ratioToPoints(0.5)).toBe(50);
    expect(ratioToPoints(1.2)).toBe(100);
    expect(ratioToPoints(2)).toBe(60);
    expect(ratioToPoints(-1)).toBe(0);
  });

  it('só com pesagens: calcula com baixa confiança; recomposição exige % de gordura', () => {
    const weightOnly = scoreBody('lose_fat', 'beginner', [{ date: '2026-11-01', weightKg: 90 }, { date: '2026-11-29', weightKg: 89 }], rules, asOf);
    expect(weightOnly).toMatchObject({ status: 'ok', lowConfidence: true });
    expect(weightOnly.points).toBeCloseTo(55.6, 1); // 1 kg de 1,8 kg esperados
    expect(scoreBody('recomp', 'beginner', [{ date: '2026-11-01', weightKg: 90 }, { date: '2026-11-29', weightKg: 89 }], rules, asOf).status).toBe('no_data');
  });

  it('sem medida inicial não pontua (não inventa base)', () => {
    expect(scoreBody('lose_fat', 'beginner', [{ date: '2026-09-01', weightKg: 90 }, { date: '2026-11-29', weightKg: 85 }], rules, asOf).status).toBe('no_data');
  });
});

describe('competição — desempenho e constância', () => {
  it('compara cada teste com o início, limitado pelo teto de melhora', () => {
    const p = scorePerformance(ana.tests, rules, asOf);
    expect(p.tests).toEqual([{ testId: 'run_5k', base: 1800, current: 1700, improvementPct: 5.6, points: 55.6 }]);
    const b = scorePerformance(bruno.tests, rules, asOf);
    expect(b.tests[0]).toMatchObject({ testId: 'bench', improvementPct: 6.2, points: 41.7 });
    expect(scorePerformance([], rules, asOf).result.status).toBe('no_data');
  });

  it('constância = dias ativos por semana vs meta', () => {
    const c = scoreConsistency(ana.activeDates, rules, asOf);
    expect(c.points).toBeCloseTo(96.6, 1);
    expect(scoreConsistency([], rules, '2026-10-20').status).toBe('no_data');
  });
});

describe('competição — classificação', () => {
  it('ordena pelo total e redistribui pesos para quem foca em performance', () => {
    const davi: ParticipantInput = { userId: 'd', name: 'Davi', goal: 'performance', experience: 'advanced', body: [], tests: [], activeDates: days(14) };
    const s = scoreCompetition(rules, [bruno, davi, ana], asOf);
    expect(s.map((x) => x.name)).toEqual(['Ana', 'Bruno', 'Davi']);
    const anaRow = s[0]!;
    expect(anaRow.total).toBeCloseTo((100 * 50 + 55.6 * 30 + 96.6 * 20) / 100, 0);
    const daviRow = s.find((x) => x.name === 'Davi')!;
    expect(daviRow.body.status).toBe('not_applicable');
    // Davi: desempenho 0 (sem testes) e constância 100 → (0×30 + 100×20)/50 = 40
    expect(daviRow.total).toBe(40);
    expect(s.map((x) => x.rank)).toEqual([1, 2, 3]);
  });
});
