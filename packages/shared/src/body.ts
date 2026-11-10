/** Composição corporal: derivações simples e transparentes a partir do que foi medido. */
import { round } from './time';

export interface BodyPoint {
  date: string;
  weightKg?: number | null;
  bodyFatPct?: number | null;
  fatMassKg?: number | null;
  leanMassKg?: number | null;
}

export interface CompleteBodyPoint {
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  /** Campos calculados (não medidos diretamente). */
  derived: ('bodyFatPct' | 'fatMassKg' | 'leanMassKg')[];
}

/**
 * Completa a composição: massa gorda = peso × %gordura; massa magra = peso − massa gorda.
 * Também deduz o % a partir de massa gorda ou magra. Valores medidos nunca são sobrescritos.
 */
export function completeComposition(p: BodyPoint): CompleteBodyPoint {
  const derived: CompleteBodyPoint['derived'] = [];
  const w = p.weightKg ?? null;
  let bf = p.bodyFatPct ?? null;
  let fat = p.fatMassKg ?? null;
  let lean = p.leanMassKg ?? null;
  if (w != null) {
    if (bf == null && fat != null) {
      bf = round((fat / w) * 100, 1);
      derived.push('bodyFatPct');
    } else if (bf == null && lean != null) {
      bf = round(((w - lean) / w) * 100, 1);
      derived.push('bodyFatPct');
    }
    if (fat == null && bf != null) {
      fat = round((w * bf) / 100, 2);
      derived.push('fatMassKg');
    }
    if (lean == null && fat != null) {
      lean = round(w - fat, 2);
      derived.push('leanMassKg');
    }
  }
  return { date: p.date, weightKg: w, bodyFatPct: bf, fatMassKg: fat, leanMassKg: lean, derived };
}

export function bmi(weightKg: number, heightCm: number): number {
  return round(weightKg / (heightCm / 100) ** 2, 1);
}

export function bmiLabel(value: number): string {
  if (value < 18.5) return 'abaixo do peso';
  if (value < 25) return 'peso adequado';
  if (value < 30) return 'sobrepeso';
  return 'obesidade';
}

/** Relação cintura/altura (acima de 0,5 costuma indicar excesso de gordura abdominal). */
export function waistToHeight(waistCm: number, heightCm: number): number {
  return round(waistCm / heightCm, 2);
}
