import type { ActivityKind } from '@forja/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { get } from '@/lib/api';
import { errorText } from '@/lib/format';
import type { Routine } from '@/lib/types';
import { type ActiveWorkout, newSet, setWorkout, uid, useWorkout } from '@/lib/workout';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { confirm, notify } from './forms';
import { Button, Card, Icon, Row, Text } from './ui';

/** Monta o treino a partir de uma rotina (séries vazias, descanso da rotina) ou um treino livre. */
export function workoutFromRoutine(r: Routine | null, kind: ActivityKind = 'strength'): ActiveWorkout {
  return {
    title: r?.name ?? 'Treino livre',
    routineId: r?.id ?? null,
    kind,
    startedAt: new Date().toISOString(),
    rest: null,
    exercises: (r?.exercises ?? []).map((e) => ({
      key: uid(),
      exerciseId: e.id,
      name: e.namePt.charAt(0).toUpperCase() + e.namePt.slice(1),
      restSec: e.restSec ?? 90,
      target: e.reps || null,
      sets: Array.from({ length: Math.max(1, e.sets) }, () => newSet()),
    })),
  };
}

/** Começa um treino no assistente (pergunta antes de descartar um que esteja em andamento). */
export function useStartWorkout() {
  const current = useWorkout();
  const [busy, setBusy] = useState(false);
  const start = async (routineId: string | null) => {
    if (current && !(await confirm('Já tem um treino em andamento', `"${current.title}" ainda não foi finalizado. Descartar e começar outro?`, 'Descartar e começar'))) {
      router.push('/treino');
      return;
    }
    setBusy(true);
    try {
      const routine = routineId ? await get<Routine>(`/routines/${routineId}`) : null;
      setWorkout(workoutFromRoutine(routine));
      router.push('/treino');
    } catch (err) {
      notify('Não consegui abrir a rotina', errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return { start, busy };
}

function elapsed(startedAt: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

/** Aviso de treino em andamento (aparece no Início e no Treinar). */
export function ActiveWorkoutCard() {
  const w = useWorkout();
  const { c } = useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!w) return null;
  const done = w.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
  const total = w.exercises.reduce((a, e) => a + e.sets.length, 0);
  return (
    <Card onPress={() => router.push('/treino')} label={`Continuar treino ${w.title}`} style={{ borderColor: c.accent, borderWidth: 1 }}>
      <Row gap={space.md}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="play" color={c.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" color={c.accent}>
            Treino em andamento · {elapsed(w.startedAt, now)}
          </Text>
          <Text variant="heading" numberOfLines={1}>
            {w.title}
          </Text>
          <Text variant="small" muted>
            {done} de {total} séries feitas
          </Text>
        </View>
        <Icon name="chevron-right" color={c.textFaint} />
      </Row>
    </Card>
  );
}

/** As três partes do treino, explicadas (era o que mais confundia). */
export function TrainingGuide({ compact }: { compact?: boolean }) {
  const { c } = useTheme();
  const steps = [
    { icon: 'list' as const, title: 'Rotina = o plano', text: 'A lista de exercícios com séries, repetições e descanso. Monte a sua ou copie um plano pronto.' },
    { icon: 'play' as const, title: 'Treinar = fazer o treino', text: 'O assistente mostra a rotina, você anota peso e repetições de cada série e ele conta o descanso.' },
    { icon: 'calendar' as const, title: 'Treino marcado = combinar com a galera', text: 'Dia, hora e local para treinar junto. O grupo confirma presença e conversa no chat do treino.' },
  ];
  return (
    <Card style={{ backgroundColor: c.surfaceAlt, borderWidth: 0 }}>
      <Text variant="caption" muted>
        Como funciona
      </Text>
      {steps.map((s, i) => (
        <Row key={s.title} gap={space.md} style={{ alignItems: 'flex-start' }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="small" style={{ fontWeight: '700' }}>
              {i + 1}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{s.title}</Text>
            {!compact ? (
              <Text variant="small" muted>
                {s.text}
              </Text>
            ) : null}
          </View>
        </Row>
      ))}
      <Text variant="small" faint>
        Tudo isso conta para a sua sequência de dias. Fez uma atividade sem o assistente (corrida, futebol)? Use "Marcar atividade".
      </Text>
      {compact ? <Button title="Ver o tutorial completo" kind="ghost" small onPress={() => router.push('/tutorial')} /> : null}
    </Card>
  );
}
