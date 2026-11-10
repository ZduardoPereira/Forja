import { formatDuration, localDateOf, TEST_BY_ID, type TestId } from '@forja/shared';
import { ApiError } from './api';

const nf = (d: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 });

export const num = (n: number | null | undefined, digits = 1) => (n == null || !Number.isFinite(n) ? '—' : nf(digits).format(n));

export const today = () => localDateOf(new Date());

/** "2026-11-10" → "10/11" (curto) ou "10/11/2026". */
export function date(d: string | null | undefined, short = false): string {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return short ? `${day}/${m}` : `${day}/${m}/${y}`;
}

export function weekdayDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '');
}

export function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function relativeDay(iso: string): string {
  const d = localDateOf(new Date(iso));
  const t = today();
  const tomorrow = localDateOf(new Date(Date.now() + 86_400_000));
  if (d === t) return 'Hoje';
  if (d === tomorrow) return 'Amanhã';
  return weekdayDate(iso);
}

/** Valor de um teste formatado com unidade. */
export function testValue(testId: TestId, value: number | null | undefined, reps?: number | null): string {
  if (value == null) return '—';
  const def = TEST_BY_ID[testId];
  if (def.input === 'time') return def.id === 'sprint_100m' ? formatDuration(value, 2) : formatDuration(value);
  if (def.input === 'speed') return `${num(value, 1)} km/h`;
  if (def.input === 'load') return `${num(value, 1)} kg${reps && reps > 1 ? ` × ${reps}` : ''}`;
  return `${num(value, 0)} reps`;
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Algo deu errado. Tente de novo.';
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
