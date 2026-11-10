import { describe, expect, it } from 'vitest';
import {
  bmi,
  bmrKatchMcArdle,
  bmrMifflin,
  completeComposition,
  dotsScore,
  estimateOneRm,
  formatDuration,
  nutritionTargets,
  parseDuration,
  radarProfile,
  radarScore,
  validateResult,
  ageOn,
  bestResult,
  improvement,
  TEST_BY_ID,
} from '../src';

describe('durações', () => {
  it('lê formatos digitados', () => {
    expect(parseDuration('12,45')).toBe(12.45);
    expect(parseDuration('3:45')).toBe(225);
    expect(parseDuration('1:02:03')).toBe(3723);
    expect(parseDuration('22:30')).toBe(1350);
    expect(parseDuration('3:75')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });
  it('formata', () => {
    expect(formatDuration(225)).toBe('3:45');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(12.45, 2)).toBe('12,45 s');
  });
  it('calcula idade', () => {
    expect(ageOn('1996-11-11', '2026-11-10')).toBe(29);
    expect(ageOn('1996-11-10', '2026-11-10')).toBe(30);
  });
});

describe('força', () => {
  it('1RM estimado por Epley', () => {
    expect(estimateOneRm(100, 1)).toBe(100);
    expect(estimateOneRm(100, 5)).toBeCloseTo(116.67, 2);
  });
  it('DOTS de referência', () => {
    expect(dotsScore(700, 100, 'male')).toBeCloseTo(430.86, 1);
    expect(dotsScore(350, 60, 'female')).toBeGreaterThan(dotsScore(350, 60, 'male'));
    // Fora da faixa válida o peso é limitado (não explode).
    expect(dotsScore(500, 300, 'male')).toBeCloseTo(dotsScore(500, 210, 'male'), 6);
  });
});

describe('testes físicos', () => {
  it('valida valores por teste', () => {
    expect(validateResult({ testId: 'run_5k', value: 1350 })).toEqual([]);
    expect(validateResult({ testId: 'run_5k', value: 100 })).not.toEqual([]);
    expect(validateResult({ testId: 'pull_ups', value: 10.5 })).not.toEqual([]);
    expect(validateResult({ testId: 'bench', value: 80 })).not.toEqual([]); // faltam repetições
    expect(validateResult({ testId: 'bench', value: 80, reps: 5 })).toEqual([]);
  });

  it('escala 0–20 do radar', () => {
    expect(radarScore({ testId: 'run_5k', date: '2026-11-01', value: 1350 })).toBe(10);
    expect(radarScore({ testId: 'run_5k', date: '2026-11-01', value: 600 })).toBe(20); // limitado
    expect(radarScore({ testId: 'run_5k', date: '2026-11-01', value: 5000 })).toBe(0);
    expect(radarScore({ testId: 'bench', date: '2026-11-01', value: 100, reps: 1, bodyweightKg: 80 })).toBe(12.1);
    expect(radarScore({ testId: 'bench', date: '2026-11-01', value: 90, reps: 1 })).toBe(10); // sem peso: absoluto
    expect(radarScore({ testId: 'pull_ups', date: '2026-11-01', value: 12 })).toBe(9.6);
  });

  it('melhor resultado respeita a direção do teste', () => {
    const r = [
      { testId: 'run_1k' as const, date: '2026-10-01', value: 250 },
      { testId: 'run_1k' as const, date: '2026-10-05', value: 240 },
      { testId: 'run_1k' as const, date: '2026-10-09', value: 240 },
    ];
    expect(bestResult(r)?.date).toBe('2026-10-05');
    expect(improvement(TEST_BY_ID.run_1k, 250, 240)).toBeCloseTo(0.04, 5);
    expect(improvement(TEST_BY_ID.pull_ups, 0, 3)).toBe(3);
  });

  it('perfil do radar marca testes não feitos como null', () => {
    const axes = radarProfile([{ testId: 'push_ups', date: '2026-11-01', value: 35 }]);
    expect(axes).toHaveLength(11);
    expect(axes.find((a) => a.testId === 'push_ups')?.score).toBe(10);
    expect(axes.find((a) => a.testId === 'squat')?.score).toBeNull();
  });
});

describe('corpo e nutrição', () => {
  it('completa composição a partir de peso e % de gordura', () => {
    expect(completeComposition({ date: 'x', weightKg: 80, bodyFatPct: 25 })).toMatchObject({ fatMassKg: 20, leanMassKg: 60, derived: ['fatMassKg', 'leanMassKg'] });
    expect(completeComposition({ date: 'x', weightKg: 80, leanMassKg: 64 })).toMatchObject({ bodyFatPct: 20, fatMassKg: 16 });
    expect(completeComposition({ date: 'x', bodyFatPct: 20 })).toMatchObject({ fatMassKg: null, leanMassKg: null });
    expect(bmi(80, 180)).toBe(24.7);
  });

  it('metabolismo e metas', () => {
    expect(bmrMifflin('male', 80, 180, 30)).toBe(1780);
    expect(bmrKatchMcArdle(64)).toBeCloseTo(1752.4, 5);
    const t = nutritionTargets({ goal: 'lose_fat', sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30, leanMassKg: null, activity: 'moderate' });
    expect(t).toMatchObject({ method: 'mifflin_st_jeor', bmrKcal: 1780, tdeeKcal: 2759, targetKcal: 2210, proteinG: 160, fatG: 64, carbsG: 248 });
    expect(nutritionTargets({ goal: 'gain_muscle', sex: null, weightKg: 70, heightCm: null, ageYears: null, leanMassKg: null, activity: 'light' })).toEqual({
      missing: ['altura', 'data de nascimento', 'sexo'],
    });
  });
});
