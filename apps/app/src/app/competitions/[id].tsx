import { addDays, EXPERIENCE_LABELS, EXPERIENCE_LEVELS, type Goal, GOAL_HINTS, GOAL_LABELS, GOALS } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { HowItWorks, ProgressBar, StandingCard } from '@/components/competition';
import { confirm } from '@/components/forms';
import { Badge, Button, Card, ChipGroup, Empty, ErrorBox, Loading, Row, Screen, Section, Text } from '@/components/ui';
import { del, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, errorText, num } from '@/lib/format';
import { invalidate, useCompetition } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const PHASE = { upcoming: 'Começa em breve', active: 'Valendo', finished: 'Encerrada' } as const;
const KEYS = [['competition'], ['competitions'], ['home']];

export default function CompetitionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const board = useCompetition(id);
  const { me } = useAuth();
  const { c } = useTheme();
  const [goal, setGoal] = useState<Goal | null>(null);
  const join = useMutation({ mutationFn: (g: Goal) => post(`/competitions/${id}/join`, { goal: g }), onSuccess: () => invalidate(KEYS) });
  const leave = useMutation({ mutationFn: () => post(`/competitions/${id}/leave`), onSuccess: () => invalidate(KEYS) });
  const remove = useMutation({
    mutationFn: () => del(`/competitions/${id}`),
    onSuccess: async () => {
      await invalidate(KEYS);
      router.back();
    },
  });

  if (board.isLoading) return <Loading />;
  if (board.error || !board.data) return <ErrorBox error={board.error} onRetry={() => void board.refetch()} />;
  const b = board.data;
  const mine = b.standings.find((s) => s.userId === me?.id);
  const goalLocked = b.today > addDays(b.startDate, 7);
  const leaderTotal = b.standings[0]?.total ?? 0;
  const elapsed = Math.max(0, b.daysTotal - b.daysLeft);
  const chosen = goal ?? mine?.goal ?? me?.goal ?? 'lose_fat';

  return (
    <Screen refreshing={board.isRefetching} onRefresh={() => void board.refetch()}>
      <Stack.Screen options={{ title: b.name }} />
      <View style={{ gap: space.sm }}>
        <Badge label={PHASE[b.phase]} tone={b.phase === 'active' ? 'accent' : 'neutral'} />
        <Text variant="display">{b.name}</Text>
        <Text muted>
          {date(b.startDate)} – {date(b.endDate)} · {b.phase === 'finished' ? 'encerrada' : b.phase === 'upcoming' ? `começa em ${date(b.startDate)}` : `faltam ${b.daysLeft} dias`}
        </Text>
        {b.phase === 'active' ? <ProgressBar value={elapsed} max={b.daysTotal} /> : null}
      </View>

      {b.phase !== 'finished' ? (
        <Card>
          {mine ? (
            <>
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <Text variant="heading">Você compete: {GOAL_LABELS[mine.goal]}</Text>
                {!goalLocked ? <Text variant="small" faint>dá para trocar até {date(addDays(b.startDate, 7))}</Text> : null}
              </Row>
              {!goalLocked ? (
                <>
                  <ChipGroup options={GOALS.map((g) => ({ value: g, label: GOAL_LABELS[g] }))} value={chosen} onChange={setGoal} />
                  {goal && goal !== mine.goal ? <Button title={`Trocar para ${GOAL_LABELS[goal]}`} small onPress={() => join.mutate(goal)} loading={join.isPending} /> : null}
                </>
              ) : null}
              <Button
                title="Sair da competição"
                kind="ghost"
                small
                loading={leave.isPending}
                onPress={async () => {
                  if (await confirm('Sair da competição?', 'Você sai da classificação.', 'Sair')) leave.mutate();
                }}
                style={{ alignSelf: 'flex-start' }}
              />
            </>
          ) : (
            <>
              <Text variant="heading">Entrar na competição</Text>
              <Text variant="small" muted>
                Escolha seu objetivo. Você só é comparado com o ritmo saudável dele.
              </Text>
              <ChipGroup options={GOALS.map((g) => ({ value: g, label: GOAL_LABELS[g] }))} value={chosen} onChange={setGoal} />
              <Text variant="small" faint>
                {GOAL_HINTS[chosen]}
              </Text>
              <Button title="Participar" icon="log-in" onPress={() => join.mutate(chosen)} loading={join.isPending} />
            </>
          )}
          {join.error ? <Text color={c.danger}>{errorText(join.error)}</Text> : null}
        </Card>
      ) : null}

      <Section title={b.phase === 'finished' ? 'Resultado final' : 'Classificação'}>
        {b.standings.length ? (
          b.standings.map((s) => <StandingCard key={s.userId} s={s} me={s.userId === me?.id} leaderTotal={leaderTotal} />)
        ) : (
          <Empty icon="users" title="Ninguém entrou ainda" />
        )}
      </Section>

      <Section title="Regras desta competição">
        <Card>
          <Text>
            Corpo {b.weightBody} · Testes {b.weightPerformance} · Constância {b.weightConsistency} (meta {b.consistencyTarget}×/semana)
          </Text>
          <Text variant="small" muted>
            Ritmos esperados (= 100 pontos no corpo): perder {num(b.rates.fatLossPerWeekPct, 1)}% do peso em gordura por semana; ganhar massa magra por mês:{' '}
            {EXPERIENCE_LEVELS.map((x) => `${EXPERIENCE_LABELS[x].split(' (')[0]} ${num(b.rates.leanGainPerMonthPct[x], 2)}%`).join(', ')}.
          </Text>
          <Text variant="small" faint>
            Linha de base: a medida mais recente até 30 dias antes do início, ou a primeira até 14 dias depois. A experiência vem do seu perfil.
          </Text>
        </Card>
      </Section>
      <HowItWorks />

      {b.createdBy === me?.id ? (
        <Row wrap gap={space.sm}>
          <Button title="Editar" icon="edit-2" kind="secondary" onPress={() => router.push({ pathname: '/competitions/new', params: { id: b.id } })} />
          <Button
            title="Apagar competição"
            kind="danger"
            loading={remove.isPending}
            onPress={async () => {
              if (await confirm('Apagar competição?', 'A classificação deixa de existir (os dados de cada um continuam).', 'Apagar')) remove.mutate();
            }}
          />
        </Row>
      ) : null}
    </Screen>
  );
}
