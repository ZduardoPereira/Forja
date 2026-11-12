import { ACTIVITY_LABELS, type ActivityKind } from '@forja/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ACTIVITY_EMOJI, CheckInSheet, TabHeader } from '@/components/activity';
import { EventListCard } from '@/components/events';
import { ActiveWorkoutCard, TrainingGuide, useStartWorkout } from '@/components/workout';
import { Button, Card, Chip, Divider, Empty, ErrorBox, Icon, ListItem, Loading, Row, Screen, Section, Text } from '@/components/ui';
import { date, num } from '@/lib/format';
import { useEvents, useHistory, useRoutines } from '@/lib/queries';
import type { Routine } from '@/lib/types';
import { useWorkout } from '@/lib/workout';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

function StartCard({ mine }: { mine: Routine[] }) {
  const { start, busy } = useStartWorkout();
  const { c } = useTheme();
  return (
    <Card>
      <Row gap={space.md}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="play" color={c.accent} size={20} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">Treinar agora</Text>
          <Text variant="small" muted>
            Escolha a rotina de hoje. O assistente anota peso, repetições e conta o descanso.
          </Text>
        </View>
      </Row>
      {mine.length ? (
        <Row wrap>
          {mine.map((r) => (
            <Chip key={r.id} label={r.name} icon="play" onPress={() => void start(r.id)} />
          ))}
        </Row>
      ) : (
        <Text variant="small" faint>
          Você ainda não tem rotina: monte uma abaixo ou copie um plano pronto.
        </Text>
      )}
      <Row wrap gap={space.sm}>
        <Button title="Treino livre" icon="plus" small kind="secondary" loading={busy} onPress={() => void start(null)} />
        <Button title="Montar rotina" icon="edit-3" small kind="ghost" onPress={() => router.push('/routines/edit')} />
      </Row>
    </Card>
  );
}

function Plans({ routines }: { routines: Routine[] }) {
  const [open, setOpen] = useState(false);
  const plans = new Map<string, Routine[]>();
  for (const r of routines.filter((x) => !x.ownerId)) {
    const key = r.planName ?? 'Planos';
    plans.set(key, [...(plans.get(key) ?? []), r]);
  }
  if (!plans.size) return null;
  return (
    <Section title="Planos prontos (openGym)" action={<Button title={open ? 'Esconder' : 'Ver planos'} kind="ghost" small onPress={() => setOpen(!open)} />}>
      {open ? (
        [...plans.entries()].map(([name, rs]) => (
          <Card key={name} padded={false} style={{ paddingHorizontal: space.lg }}>
            <Text variant="caption" muted style={{ paddingTop: space.md }}>
              {name}
            </Text>
            {rs.map((r, i) => (
              <View key={r.id}>
                {i ? <Divider /> : null}
                <ListItem title={r.name} subtitle={`${r.exerciseCount ?? 0} exercícios · toque para ver, treinar ou copiar`} onPress={() => router.push(`/routines/${r.id}`)} />
              </View>
            ))}
          </Card>
        ))
      ) : (
        <Text variant="small" muted>
          PPL, Superior/Inferior, Corpo inteiro e 5×5 prontos para treinar ou copiar e ajustar.
        </Text>
      )}
    </Section>
  );
}

export default function Treinar() {
  const routines = useRoutines();
  const events = useEvents('upcoming');
  const history = useHistory();
  const workout = useWorkout();
  const [checkIn, setCheckIn] = useState(false);
  const list = routines.data ?? [];
  const mine = list.filter((r) => r.mine);

  return (
    <Screen tab refreshing={routines.isRefetching} onRefresh={() => void Promise.all([routines.refetch(), events.refetch(), history.refetch()])}>
      <TabHeader title="Treinar" subtitle="Rotinas, assistente de treino e treinos com o grupo" />

      {workout ? <ActiveWorkoutCard /> : routines.isLoading ? <Loading /> : <StartCard mine={mine} />}
      <Button title="Marcar atividade sem o assistente" icon="check-circle" kind="secondary" onPress={() => setCheckIn(true)} />

      <Section title="Minhas rotinas (os planos de treino)" action={<Button title="Nova" icon="plus" small kind="ghost" onPress={() => router.push('/routines/edit')} />}>
        {routines.error ? <ErrorBox error={routines.error} onRetry={() => void routines.refetch()} /> : null}
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          {mine.length ? (
            mine.map((r, i) => (
              <View key={r.id}>
                {i ? <Divider /> : null}
                <ListItem title={r.name} subtitle={`${r.exerciseCount ?? 0} exercícios${r.description ? ` · ${r.description}` : ''}`} onPress={() => router.push(`/routines/${r.id}`)} />
              </View>
            ))
          ) : (
            <Empty icon="list" title="Nenhuma rotina ainda" message="Monte sua rotina (ex.: Peito e tríceps) com os exercícios, séries, repetições e descanso." action={{ label: 'Montar rotina', onPress: () => router.push('/routines/edit') }} />
          )}
        </Card>
      </Section>

      <Plans routines={list} />

      <Section title="Treinos com o grupo" action={<Button title="Agenda" kind="ghost" small onPress={() => router.push('/agenda')} />}>
        {events.isLoading ? (
          <Loading />
        ) : events.data?.length ? (
          <View style={{ gap: space.md }}>
            {events.data.slice(0, 3).map((e) => (
              <EventListCard key={e.id} event={e} />
            ))}
          </View>
        ) : (
          <Card>
            <Empty icon="calendar" title="Nenhum treino marcado" message="Marque dia, hora e local: o grupo recebe o aviso e confirma presença." />
          </Card>
        )}
        <Button title="Marcar treino com o grupo" icon="calendar" kind="secondary" onPress={() => router.push('/events/new')} />
      </Section>

      <Section title="Histórico" action={<Button title="Ver tudo" kind="ghost" small onPress={() => router.push('/historico')} />}>
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          {history.data?.length ? (
            history.data.slice(0, 5).map((l, i) => (
              <View key={l.id}>
                {i ? <Divider /> : null}
                <ListItem
                  title={`${ACTIVITY_EMOJI[l.kind as ActivityKind] ?? '✨'} ${l.title ?? ACTIVITY_LABELS[l.kind as ActivityKind] ?? l.kind}`}
                  subtitle={[date(l.date), l.durationMin ? `${l.durationMin} min` : null, l.summary ? `${l.summary.sets} séries · ${num(l.summary.volumeKg, 0)} kg` : null].filter(Boolean).join(' · ')}
                  onPress={l.source === 'session' ? () => router.push(`/treino/${l.id}`) : undefined}
                />
              </View>
            ))
          ) : (
            <Text muted style={{ paddingVertical: space.lg }}>
              Seus treinos e atividades aparecem aqui.
            </Text>
          )}
        </Card>
      </Section>

      <TrainingGuide />
      <CheckInSheet visible={checkIn} onClose={() => setCheckIn(false)} />
    </Screen>
  );
}
