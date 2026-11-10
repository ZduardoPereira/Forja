/** Datas locais (AAAA-MM-DD) e durações. Sem fuso: datas locais vêm do aparelho. */

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

/** 0 = domingo … 6 = sábado. */
export function weekday(date: string): number {
  return parse(date).getUTCDay();
}

export function localDateOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isLocalDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime()) && parse(s).toISOString().slice(0, 10) === s;
}

export function ageOn(birthDate: string, on: string): number {
  const b = parse(birthDate);
  const o = parse(on);
  let age = o.getUTCFullYear() - b.getUTCFullYear();
  if (o.getUTCMonth() < b.getUTCMonth() || (o.getUTCMonth() === b.getUTCMonth() && o.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

/**
 * Lê uma duração digitada: "12,45" ou "12.45" (s), "3:45" (min:s), "1:02:03" (h:min:s).
 * Retorna segundos (com decimais) ou null se inválida.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length > 3 || parts.some((p) => p === '' || !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  // Só o último campo pode ter decimais; minutos/segundos intermediários < 60.
  if (nums.slice(0, -1).some((n) => !Number.isInteger(n))) return null;
  if (nums.length >= 2 && nums.slice(1).some((n) => n >= 60)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

/** 225 → "3:45"; 3723 → "1:02:03"; com `decimals`, mostra frações de segundo ("12,45 s" abaixo de 60 s). */
export function formatDuration(seconds: number | null | undefined, decimals = 0): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60 && decimals > 0) return `${seconds.toFixed(decimals).replace('.', ',')} s`;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Ritmo em s/km a partir de distância (m) e tempo (s). */
export function paceSecPerKm(distanceM: number, seconds: number): number {
  return seconds / (distanceM / 1000);
}

export function speedKmh(distanceM: number, seconds: number): number {
  return (distanceM / seconds) * 3.6;
}

export function formatPace(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !Number.isFinite(secPerKm)) return '—';
  return `${formatDuration(secPerKm)} /km`;
}

export function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
