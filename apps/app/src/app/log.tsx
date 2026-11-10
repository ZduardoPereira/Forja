import { ACTIVITY_KINDS, ACTIVITY_LABELS, type ActivityKind, workoutLogSchema } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { DateField } from '@/components/forms';
import { Button, Card, Chip, ChipGroup, Field, Row, Screen, Text } from '@/components/ui';
import { post } from '@/lib/api';
import { errorText, today } from '@/lib/format';
import { invalidate, useRoutines } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function LogWorkout() {
  const params = useLocalSearchParams<{ routineId?: string }>();
  const routines = useRoutines();
  const { c } = useTheme();
  const [day, setDay] = useState(today());
  const [kind, setKind] = useState<ActivityKind>('strength');
  const [duration, setDuration] = useState('60');
  const [routineId, setRoutineId] = useState<string | null>(params.routineId ?? null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: unknown) => post('/logs', body),
    onSuccess: async () => {
      await invalidate([['logs'], ['competition'], ['home']]);
      router.back();
    },
    onError: (err) => setError(errorText(err)),
  });

  const submit = () => {
    const parsed = workoutLogSchema.safeParse({ date: day, kind, durationMin: duration ? Number(duration) : null, routineId, notes: notes.trim() || null });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      return setError(issue.path[0] === 'durationMin' ? 'Duração entre 5 e 600 minutos' : issue.message);
    }
    setError(null);
    save.mutate(parsed.data);
  };

  const list = routines.data ?? [];
  return (
    <Screen>
      <Card>
        <DateField label="Quando" value={day} onChange={setDay} />
        <View style={{ gap: space.sm }}>
          <Text variant="small" muted>
            Tipo
          </Text>
          <ChipGroup options={ACTIVITY_KINDS.map((k) => ({ value: k, label: ACTIVITY_LABELS[k] }))} value={kind} onChange={setKind} />
        </View>
        <Field label="Duração (min)" value={duration} onChangeText={(v) => setDuration(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={3} />
      </Card>
      <Card>
        <Text variant="small" muted>
          Rotina (opcional)
        </Text>
        <Row wrap>
          <Chip label="Nenhuma" selected={!routineId} onPress={() => setRoutineId(null)} />
          {list.map((r) => (
            <Chip key={r.id} label={r.planName ? `${r.name} · ${r.planName}` : r.name} selected={routineId === r.id} onPress={() => setRoutineId(r.id)} />
          ))}
        </Row>
        <Field label="Como foi? (opcional)" value={notes} onChangeText={setNotes} maxLength={500} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
      </Card>
      {error ? <Text color={c.danger}>{error}</Text> : null}
      <Button title="Salvar" icon="check" onPress={submit} loading={save.isPending} />
      <Text variant="small" faint style={{ textAlign: 'center' }}>
        Foi em um treino marcado no app? Basta confirmar a presença nele — não precisa registrar aqui também.
      </Text>
    </Screen>
  );
}
