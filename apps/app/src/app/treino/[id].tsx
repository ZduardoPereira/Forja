import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { confirm } from '@/components/forms';
import { Button, Card, Divider, ErrorBox, Loading, Row, Screen, Stat, Text } from '@/components/ui';
import { del } from '@/lib/api';
import { date, num } from '@/lib/format';
import { ACTIVITY_KEYS, invalidate, useSession } from '@/lib/queries';
import { space } from '@/theme/tokens';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession(id);
  const remove = useMutation({
    mutationFn: () => del(`/logs/${id}`),
    onSuccess: async () => {
      await invalidate(ACTIVITY_KEYS);
      router.back();
    },
  });
  if (session.isLoading) return <Loading />;
  if (session.error) return <ErrorBox error={session.error} onRetry={() => void session.refetch()} />;
  const s = session.data!;
  return (
    <Screen>
      <Stack.Screen options={{ title: s.title ?? 'Treino' }} />
      <Text muted>
        {date(s.date)}
        {s.durationMin ? ` · ${s.durationMin} min` : ''}
      </Text>
      <Card>
        <Row wrap gap={space.lg}>
          <Stat label="Séries" value={String(s.summary.sets)} />
          <Stat label="Repetições" value={String(s.summary.reps)} />
          <Stat label="Volume" value={num(s.summary.volumeKg, 0)} unit="kg" />
        </Row>
      </Card>
      {s.exercises.map((e, idx) => (
        <Card key={`${e.exerciseId}-${idx}`}>
          <Text variant="heading" onPress={() => router.push(`/exercises/${e.exerciseId}`)}>
            {e.name}
          </Text>
          {e.sets.map((x, i) => (
            <View key={i}>
              {i ? <Divider /> : null}
              <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                <Text muted>Série {i + 1}</Text>
                <Text variant="bodyStrong">
                  {x.weightKg != null ? `${num(x.weightKg, 1)} kg × ` : ''}
                  {x.reps ?? '—'} reps
                </Text>
                <Text variant="small" faint>
                  {x.restSec ? `descanso ${mmss(x.restSec)}` : ''}
                </Text>
              </Row>
            </View>
          ))}
        </Card>
      ))}
      {s.notes ? <Text muted>{s.notes}</Text> : null}
      <Button
        title="Apagar este treino"
        kind="danger"
        small
        loading={remove.isPending}
        onPress={async () => {
          if (await confirm('Apagar treino?', 'Ele deixa de contar para a sequência e para os rankings.', 'Apagar')) remove.mutate();
        }}
      />
    </Screen>
  );
}
