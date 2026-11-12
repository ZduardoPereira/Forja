import { ACTIVITY_LABELS, type ActivityKind } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { ACTIVITY_EMOJI } from '@/components/activity';
import { confirm } from '@/components/forms';
import { Card, Divider, Empty, ErrorBox, IconButton, ListItem, Loading, Screen, Section, Text } from '@/components/ui';
import { del } from '@/lib/api';
import { date, num } from '@/lib/format';
import { ACTIVITY_KEYS, invalidate, useHistory } from '@/lib/queries';
import type { LogItem } from '@/lib/types';
import { space } from '@/theme/tokens';

const SOURCE = { manual: 'marcada', session: 'assistente', admin: 'corrigida pelo admin' } as const;

export default function Historico() {
  const history = useHistory();
  const remove = useMutation({ mutationFn: (id: string) => del(`/logs/${id}`), onSuccess: () => invalidate(ACTIVITY_KEYS) });
  if (history.isLoading) return <Loading />;
  if (history.error) return <ErrorBox error={history.error} onRetry={() => void history.refetch()} />;
  const byMonth = new Map<string, LogItem[]>();
  for (const l of history.data ?? []) {
    const key = new Date(`${l.date}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    byMonth.set(key, [...(byMonth.get(key) ?? []), l]);
  }
  return (
    <Screen refreshing={history.isRefetching} onRefresh={() => void history.refetch()}>
      <Text muted>Tudo o que contou para a sua sequência: treinos do assistente e atividades marcadas.</Text>
      {!history.data?.length ? <Empty icon="activity" title="Nenhuma atividade ainda" message="Treine com o assistente ou marque uma atividade na aba Início." /> : null}
      {[...byMonth.entries()].map(([month, logs]) => (
        <Section key={month} title={month}>
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {logs.map((l, i) => (
              <View key={l.id}>
                {i ? <Divider /> : null}
                <ListItem
                  title={`${ACTIVITY_EMOJI[l.kind] ?? '✨'} ${l.title ?? ACTIVITY_LABELS[l.kind as ActivityKind] ?? l.kind}`}
                  subtitle={[date(l.date), l.durationMin ? `${l.durationMin} min` : null, l.summary ? `${l.summary.exercises} exercícios · ${l.summary.sets} séries · ${num(l.summary.volumeKg, 0)} kg` : null, SOURCE[l.source]].filter(Boolean).join(' · ')}
                  onPress={l.source === 'session' ? () => router.push(`/treino/${l.id}`) : undefined}
                  right={
                    l.source !== 'session' ? (
                      <IconButton
                        icon="trash-2"
                        size={16}
                        label="Apagar atividade"
                        onPress={async () => {
                          if (await confirm('Apagar atividade?', 'Ela deixa de contar para a sequência.', 'Apagar')) remove.mutate(l.id);
                        }}
                      />
                    ) : undefined
                  }
                />
              </View>
            ))}
          </Card>
        </Section>
      ))}
    </Screen>
  );
}
