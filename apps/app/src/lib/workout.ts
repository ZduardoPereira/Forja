/**
 * Treino em andamento no assistente. Fica salvo no aparelho a cada mudança: se o app fechar
 * ou o celular reiniciar no meio do treino, ele continua de onde parou.
 * (No celular vai para um arquivo; o SecureStore tem limite de tamanho.)
 */
import type { ActivityKind } from '@forja/shared';
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export interface WorkoutSet {
  id: string;
  /** Texto digitado (aceita vírgula): "62,5". */
  weight: string;
  reps: string;
  done: boolean;
  /** Descanso real depois da série (segundos), registrado quando a próxima começa. */
  restSec: number | null;
}

export interface WorkoutExercise {
  key: string;
  exerciseId: string;
  name: string;
  /** Descanso planejado entre séries (segundos). */
  restSec: number;
  /** Meta de repetições da rotina ("8-12"), só para mostrar. */
  target: string | null;
  sets: WorkoutSet[];
}

export interface ActiveWorkout {
  title: string;
  routineId: string | null;
  kind: ActivityKind;
  startedAt: string;
  exercises: WorkoutExercise[];
  /** Quando o descanso atual termina (ISO), de qual exercício e depois de qual série. */
  rest: { endsAt: string; total: number; exerciseKey: string; setId: string } | null;
}

const KEY = 'forja.treino-em-andamento';
let current: ActiveWorkout | null = null;
let loaded = false;
const listeners = new Set<() => void>();

const nativeFile = () => new File(Paths.document, 'treino-em-andamento.json');

async function read(): Promise<ActiveWorkout | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = globalThis.localStorage?.getItem(KEY);
      return raw ? (JSON.parse(raw) as ActiveWorkout) : null;
    }
    const f = nativeFile();
    return f.exists ? (JSON.parse(await f.text()) as ActiveWorkout) : null;
  } catch {
    return null;
  }
}

async function write(w: ActiveWorkout | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (w) globalThis.localStorage?.setItem(KEY, JSON.stringify(w));
      else globalThis.localStorage?.removeItem(KEY);
      return;
    }
    const f = nativeFile();
    if (w) {
      if (!f.exists) f.create();
      await f.write(JSON.stringify(w));
    } else if (f.exists) f.delete();
  } catch {
    /* sem espaço/permissão: o treino segue só na memória */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export async function loadWorkout(): Promise<ActiveWorkout | null> {
  if (!loaded) {
    loaded = true;
    current = await read();
    emit();
  }
  return current;
}

export function setWorkout(next: ActiveWorkout | null | ((w: ActiveWorkout | null) => ActiveWorkout | null)) {
  current = typeof next === 'function' ? next(current) : next;
  emit();
  void write(current);
}

export function useWorkout(): ActiveWorkout | null {
  if (!loaded) void loadWorkout();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

let seq = 0;
export const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const newSet = (prev?: WorkoutSet): WorkoutSet => ({ id: uid(), weight: prev?.weight ?? '', reps: prev?.reps ?? '', done: false, restSec: null });

/** Lê número digitado com vírgula ou ponto; vazio → null. */
export function parseInput(v: string): number | null {
  const t = v.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
