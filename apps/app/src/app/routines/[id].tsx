import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { exerciseSubtitle } from '@/components/exercises';
import { confirm } from '@/components/forms';
import { Badge, Button, Card, Divider, ErrorBox, ListItem, Loading, Row, Screen, Text } from '@/components/ui';
import { del, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { invalidate, useRoutine } from '@/lib/queries';
import type { Routine } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function RoutineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const routine = useRoutine(id);
  const { me } = useAuth();
  const { c } = useTheme();
  const copy = useMutation({
    mutationFn: () => post<Routine>(`/routines/${id}/copy`),
    onSuccess: async (r) => {
      await invalidate([['routines']]);
      router.replace({ pathname: '/routines/edit', params: { id: r.id } });
    },
  });
  const remove = useMutation({
    mutationFn: () => del(`/routines/${id}`),
    onSuccess: async () => {
      await invalidate([['routines']]);
      router.back();
    },
  });

  if (routine.isLoading) return <Loading />;
  if (routine.error || !routine.data) return <ErrorBox error={routine.error} onRetry={() => void routine.refetch()} />;
  const r = routine.data;
  const mine = r.ownerId === me?.id;
  return (
    <Screen>
      <Stack.Screen options={{ title: r.name }} />
      <View style={{ gap: space.sm }}>
        {r.planName ? <Badge label={`Plano ${r.planName} · openGym`} tone="accent" /> : null}
        <Text variant="display">{r.name}</Text>
        {r.description ? <Text muted>{r.description}</Text> : null}
      </View>
      <Row wrap gap={space.sm}>
        <Button title="Marcar treino com ela" icon="calendar" small onPress={() => router.push({ pathname: '/events/new', params: { routineId: r.id } })} />
        <Button title="Registrar como feito" icon="check-circle" small kind="secondary" onPress={() => router.push({ pathname: '/log', params: { routineId: r.id } })} />
        {mine ? (
          <Button title="Editar" icon="edit-2" small kind="secondary" onPress={() => router.push({ pathname: '/routines/edit', params: { id: r.id } })} />
        ) : (
          <Button title="Copiar para editar" icon="copy" small kind="secondary" onPress={() => copy.mutate()} loading={copy.isPending} />
        )}
      </Row>
      {copy.error ? <Text color={c.danger}>{errorText(copy.error)}</Text> : null}
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {(r.exercises ?? []).map((x, i) => (
          <View key={`${x.id}-${i}`}>
            {i ? <Divider /> : null}
            <ListItem
              left={
                <Text variant="bodyStrong" muted style={{ width: 22 }}>
                  {i + 1}
                </Text>
              }
              title={x.namePt}
              subtitle={[`${x.sets} × ${x.reps}`, x.restSec ? `descanso ${x.restSec}s` : null, exerciseSubtitle(x), x.notes].filter(Boolean).join(' · ')}
              onPress={() => router.push(`/exercises/${x.id}`)}
            />
          </View>
        ))}
        {!r.exercises?.length ? (
          <Text muted style={{ paddingVertical: space.lg }}>
            Rotina sem exercícios.
          </Text>
        ) : null}
      </Card>
      {mine ? (
        <Button
          title="Apagar rotina"
          kind="danger"
          loading={remove.isPending}
          onPress={async () => {
            if (await confirm('Apagar rotina?', r.name, 'Apagar')) remove.mutate();
          }}
        />
      ) : null}
    </Screen>
  );
}
