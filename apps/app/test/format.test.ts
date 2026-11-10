import { parseNum } from '@/components/forms';
import { date, initials, num, testValue } from '@/lib/format';

describe('formatação em português', () => {
  it('números com vírgula e datas DD/MM', () => {
    expect(num(82.45, 1)).toBe('82,5');
    expect(num(null)).toBe('—');
    expect(date('2026-11-10')).toBe('10/11/2026');
    expect(date('2026-11-10', true)).toBe('10/11');
  });

  it('valores de teste com a unidade certa', () => {
    expect(testValue('sprint_100m', 12.456)).toBe('12,46 s');
    expect(testValue('run_5k', 1475)).toBe('24:35');
    expect(testValue('run_10k', 3723)).toBe('1:02:03');
    expect(testValue('max_speed', 28.5)).toBe('28,5 km/h');
    expect(testValue('bench', 90, 3)).toBe('90 kg × 3');
    expect(testValue('pull_ups', 12)).toBe('12 reps');
  });

  it('lê números digitados com vírgula', () => {
    expect(parseNum('82,4')).toBe(82.4);
    expect(parseNum(' ')).toBeNull();
    expect(Number.isNaN(parseNum('82kg'))).toBe(true);
    expect(initials('João da Silva')).toBe('JD');
  });
});
