import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeStreak,
  dietMealSchema,
  dietPlanSchema,
  FOOD_BY_ID,
  isLoggableDate,
  macrosFor,
  mergePrefs,
  scoreEvolution,
  searchFoods,
  sessionSchema,
  sumMacros,
} from '../src';

const T = '2026-11-11';

describe('sequência de dias', () => {
  it('conta até hoje quando hoje já teve atividade', () => {
    const s = computeStreak([T, addDays(T, -1), addDays(T, -2), addDays(T, -5)], T);
    expect(s).toMatchObject({ current: 3, doneToday: true, lastDate: T, best: 3 });
  });

  it('continua viva até o fim de hoje contando de ontem', () => {
    const s = computeStreak([addDays(T, -1), addDays(T, -2)], T);
    expect(s.current).toBe(2);
    expect(s.doneToday).toBe(false);
  });

  it('zera quando ontem passou em branco', () => {
    const s = computeStreak([addDays(T, -2), addDays(T, -3), addDays(T, -4)], T);
    expect(s.current).toBe(0);
    expect(s.best).toBe(3);
  });

  it('ignora datas repetidas e futuras e acha a melhor sequência antiga', () => {
    const old = Array.from({ length: 10 }, (_, i) => addDays('2026-09-01', i));
    const s = computeStreak([...old, T, T, addDays(T, 3)], T);
    expect(s.current).toBe(1);
    expect(s.best).toBe(10);
  });

  it('sem atividade nenhuma', () => {
    expect(computeStreak([], T)).toEqual({ current: 0, best: 0, doneToday: false, lastDate: null });
  });

  it('só aceita registrar hoje e os 2 dias anteriores', () => {
    expect(isLoggableDate(T, T)).toBe(true);
    expect(isLoggableDate(addDays(T, -2), T)).toBe(true);
    expect(isLoggableDate(addDays(T, -3), T)).toBe(false);
    expect(isLoggableDate(addDays(T, 1), T)).toBe(false);
  });
});

describe('ranking de evolução', () => {
  const body = (pts: [number, number][]) => pts.map(([d, w]) => ({ date: addDays(T, -d), weightKg: w }));

  it('emagrecer no ritmo saudável vale perto de 100', () => {
    // 0,5% de 100 kg por semana = 0,5 kg/semana; 4 semanas → 2 kg.
    const r = scoreEvolution({ goal: 'lose_fat', experience: 'beginner', body: body([[28, 100], [0, 98]]), tests: [] }, T);
    expect(r.status).toBe('ok');
    expect(r.points).toBeGreaterThanOrEqual(99);
    expect(r.lowConfidence).toBe(true);
    expect(r.basis).toBe('body');
  });

  it('ganhar peso quando o objetivo é emagrecer não pontua', () => {
    const r = scoreEvolution({ goal: 'lose_fat', experience: 'beginner', body: body([[28, 100], [0, 101]]), tests: [] }, T);
    expect(r.points).toBe(0);
  });

  it('espera 1 semana entre a primeira e a última medida', () => {
    const r = scoreEvolution({ goal: 'gain_muscle', experience: 'beginner', body: body([[3, 70], [0, 70.5]]), tests: [] }, T);
    expect(r.status).toBe('no_data');
    expect(r.summary).toMatch(/7 dias/);
  });

  it('sem medidas na janela de 90 dias', () => {
    const r = scoreEvolution({ goal: 'gain_muscle', experience: 'beginner', body: body([[200, 70], [120, 72]]), tests: [] }, T);
    expect(r.status).toBe('no_data');
    expect(r.since).toBeNull();
  });

  it('performance usa a melhora nos testes', () => {
    const r = scoreEvolution(
      {
        goal: 'performance',
        experience: 'intermediate',
        body: [],
        tests: [
          { testId: 'push_ups', date: addDays(T, -30), value: 20, reps: null, bodyweightKg: null },
          { testId: 'push_ups', date: T, value: 30, reps: null, bodyweightKg: null },
        ],
      },
      T,
    );
    expect(r.status).toBe('ok');
    expect(r.basis).toBe('tests');
    expect(r.points).toBeGreaterThan(0);
  });
});

describe('dieta', () => {
  it('calcula macros pela quantidade', () => {
    const arroz = FOOD_BY_ID['arroz-branco']!;
    expect(macrosFor(arroz, 150)).toEqual({ kcal: 192, proteinG: 3.8, carbsG: 42.2, fatG: 0.3 });
    expect(sumMacros([{ kcal: 100, proteinG: 10 }, { kcal: 50.4, carbsG: 3 }])).toEqual({ kcal: 150, proteinG: 10, carbsG: 3, fatG: 0 });
  });

  it('busca sem acento', () => {
    expect(searchFoods('feijao').map((x) => x.id)).toEqual(['feijao-carioca', 'feijao-preto']);
    expect(searchFoods('pao frances')[0]?.id).toBe('pao-frances');
    expect(searchFoods('  ')).toEqual([]);
  });

  it('aceita planos antigos (só texto) e novos (com alimentos)', () => {
    expect(dietMealSchema.safeParse({ name: 'Almoço', items: 'arroz, feijão e frango' }).success).toBe(true);
    expect(dietMealSchema.safeParse({ name: 'Almoço', foods: [{ name: 'Arroz', foodId: 'arroz-branco', grams: 150, kcal: 192 }] }).success).toBe(true);
    expect(dietMealSchema.safeParse({ name: 'Almoço' }).success).toBe(false);
    const plan = dietPlanSchema.parse({ title: 'Plano', meals: [{ name: 'Café', items: 'pão e ovo' }] });
    expect(plan.meals[0]!.foods).toEqual([]);
  });
});

describe('assistente de treino e preferências', () => {
  const base = { title: 'Peito', startedAt: '2026-11-11T18:00:00-03:00', finishedAt: '2026-11-11T19:05:00-03:00', exercises: [{ exerciseId: 'abc', sets: [{ weightKg: 60, reps: 10 }] }] };

  it('valida o treino do assistente', () => {
    expect(sessionSchema.safeParse(base).success).toBe(true);
    expect(sessionSchema.safeParse({ ...base, finishedAt: '2026-11-11T17:00:00-03:00' }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...base, finishedAt: '2026-11-12T08:00:00-03:00' }).success).toBe(false);
  });

  it('preferências de notificação começam todas ligadas e ignoram lixo', () => {
    expect(mergePrefs(null)).toEqual({ events: true, chat: true, ranking: true, streak: true, group: true });
    expect(mergePrefs({ chat: false, foo: true })).toMatchObject({ chat: false, events: true });
  });
});
