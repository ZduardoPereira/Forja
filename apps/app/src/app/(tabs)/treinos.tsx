import { ACTIVITY_LABELS, type ActivityKind } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { EventListCard } from '@/components/events';
import { confirm } from '@/components/forms';
import { Button, Card, Divider, Empty, ErrorBox, Header, IconButton, ListItem, Loading, Screen, Section, Segmented, Text } from '@/components/ui';
import { del } from '@/lib/api';
import { date } from '@/lib/format';
import { invalidate, useEvents, useLogs, useRoutines } from '@/lib/queries';
import type { Routine } from '@/lib/types';
import { space } from '@/theme/tokens';

type Tab = 'agenda' | 'rotinas' | 'feitos';

function Agenda() {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const events = useEvents(scope);
  return (
    <>
      <Segmented
        options={[
          { value: 'upcoming', label: 'Próximos' },
          { value: 'past', label: 'Anteriores' },
        ]}
        value={scope}
        onChange={setScope}
      />
      {events.isLoading ? (
        <Loading />
      ) : events.error ? (
        <ErrorBox error={events.error} onRetry={() => void events.refetch()} />
      ) : events.data?.length ? (
        <View style={{ gap: space.md }}>
          {events.data.map((e) => (
            <EventListCard key={e.id} event={e} />
          ))}
        </View>
      ) : (
        <Empty
          icon="calendar"
          title={scope === 'upcoming' ? 'Nada marcado por enquanto' : 'Nenhum treino anterior'}
          message={scope === 'upcoming' ? 'Marque um treino: a galera recebe no chat e confirma presença.' : undefined}
          action={scope === 'upcoming' ? { label: 'Marcar treino', onPress: () => router.push('/events/new') } : undefined}
        />
      )}
    </>
  );
}

function Rotinas() {
  const routines = useRoutines();
  if (routines.isLoading) return <Loading />;
  if (routines.error) return <ErrorBox error={routines.error} onRetry={() => void routines.refetch()} />;
  const list = routines.data ?? [];
  const mine = list.filter((r) => r.mine);
  const plans = new Map<string, Routine[]>();
  for (const r of list.filter((x) => !x.ownerId)) {
    const key = r.planName ?? 'Planos';
    plans.set(key, [...(plans.get(key) ?? []), r]);
  }
  return (
    <>
      <Section title="Minhas rotinas" action={<Button title="Nova" icon="plus" small kind="ghost" onPress={() => router.push('/routines/edit')} />}>
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          {mine.length ? (
            mine.map((r, i) => (
              <View key={r.id}>
                {i ? <Divider /> : null}
                <ListItem title={r.name} subtitle={`${r.exerciseCount ?? 0} exercícios${r.description ? ` · ${r.description}` : ''}`} onPress={() => router.push(`/routines/${r.id}`)} />
              </View>
            ))
          ) : (
            <Text muted style={{ paddingVertical: space.lg }}>
              Crie a sua ou copie um plano pronto abaixo para editar.
            </Text>
          )}
        </Card>
      </Section>
      {[...plans.entries()].map(([name, rs]) => (
        <Section key={name} title={`${name} · openGym`}>
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {rs.map((r, i) => (
              <View key={r.id}>
                {i ? <Divider /> : null}
                <ListItem title={r.name} subtitle={`${r.exerciseCount ?? 0} exercícios`} onPress={() => router.push(`/routines/${r.id}`)} />
              </View>
            ))}
          </Card>
        </Section>
      ))}
      <Button title="Explorar exercícios do openGym" icon="search" kind="secondary" onPress={() => router.push('/exercises')} />
    </>
  );
}

function Feitos() {
  const logs = useLogs();
  const routines = useRoutines();
  const remove = useMutation({
    mutationFn: (id: string) => del(`/logs/${id}`),
    onSuccess: () => invalidate([['logs'], ['competition'], ['home']]),
  });
  if (logs.isLoading) return <Loading />;
  if (logs.error) return <ErrorBox error={logs.error} onRetry={() => void logs.refetch()} />;
  return (
    <>
      <Button title="Registrar treino feito" icon="check-circle" onPress={() => router.push('/log')} />
      <Text variant="small" muted>
        Cada dia com treino registrado (ou presença confirmada em treino marcado) conta para a constância da competição.
      </Text>
      {logs.data?.length ? (
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          {logs.data.map((l, i) => (
            <View key={l.id}>
              {i ? <Divider /> : null}
              <ListItem
                title={`${date(l.date)} · ${ACTIVITY_LABELS[l.kind as ActivityKind] ?? l.kind}`}
                subtitle={[l.durationMin ? `${l.durationMin} min` : null, routines.data?.find((r) => r.id === l.routineId)?.name, l.notes].filter(Boolean).join(' · ') || null}
                right={
                  <IconButton
                    icon="trash-2"
                    label="Apagar registro"
                    size={16}
                    onPress={async () => {
                      if (await confirm('Apagar registro?', 'O treino deixa de contar para a constância.', 'Apagar')) remove.mutate(l.id);
                    }}
                  />
                }
              />
            </View>
          ))}
        </Card>
      ) : (
        <Empty icon="activity" title="Nenhum treino registrado" />
      )}
    </>
  );
}

export default function Treinos() {
  const [tab, setTab] = useState<Tab>('agenda');
  return (
    <Screen tab>
      <Header title="Treinos" right={<Button title="Marcar" icon="plus" small onPress={() => router.push('/events/new')} />} />
      <Segmented
        options={[
          { value: 'agenda', label: 'Agenda' },
          { value: 'rotinas', label: 'Rotinas' },
          { value: 'feitos', label: 'Feitos' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'agenda' ? <Agenda /> : tab === 'rotinas' ? <Rotinas /> : <Feitos />}
    </Screen>
  );
}
