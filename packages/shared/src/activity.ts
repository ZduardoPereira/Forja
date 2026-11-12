/**
 * Sequência de dias com atividade (treino registrado, treino do assistente ou presença
 * confirmada num treino marcado). Visível para todo o grupo.
 *
 * Regras:
 * - um dia conta se tiver pelo menos uma atividade;
 * - a sequência continua viva até o fim do dia seguinte: se hoje ainda não teve
 *   atividade, ela conta a partir de ontem (e zera à meia-noite se hoje passar em branco);
 * - só dá para registrar atividade de hoje e dos 2 dias anteriores, para ninguém
 *   "construir" uma sequência no passado (o administrador pode corrigir qualquer dia).
 */
import { addDays } from './time';

export interface StreakInfo {
  /** Dias seguidos até hoje (ou até ontem, se hoje ainda está em aberto). */
  current: number;
  /** Maior sequência que a pessoa já teve. */
  best: number;
  doneToday: boolean;
  /** Último dia com atividade. */
  lastDate: string | null;
}

export function computeStreak(dates: Iterable<string>, today: string): StreakInfo {
  const set = new Set<string>();
  for (const d of dates) if (d <= today) set.add(d);
  const sorted = [...set].sort();
  const doneToday = set.has(today);
  let current = 0;
  let cursor = doneToday ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return { current, best, doneToday, lastDate: sorted.at(-1) ?? null };
}

/** Marcos que viram aviso para o grupo. */
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 45, 60, 75, 100, 150, 200, 250, 300, 365] as const;

/** Quantos dias para trás dá para registrar atividade (além de hoje). */
export const LOG_BACKFILL_DAYS = 2;

export function isLoggableDate(date: string, today: string): boolean {
  return date <= today && date >= addDays(today, -LOG_BACKFILL_DAYS);
}

/** Os últimos `weeks` × 7 dias, do mais antigo para hoje (para o calendário de atividade). */
export function recentDays(today: string, days = 35): string[] {
  return Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
}
