import { GOAL_LABELS, TEST_GROUP_LABELS, TEST_GROUPS } from '@forja/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { HowItWorks } from '@/components/competition';
import { Avatar, Badge, Button, Card, Divider, Empty, ErrorBox, Header, ListItem, Loading, Row, Screen, Section, Segmented, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { date, num, testValue } from '@/lib/format';
import { useCompetitions, usePowerlifting, useTests } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { font, space } from '@/theme/tokens';

const PHASE = { upcoming: { label: 'Em breve', tone: 'neutral' }, active: { label: 'Valendo', tone: 'accent' }, finished: { label: 'Encerrada', tone: 'neutral' } } as const;

function Competicoes() {
  const list = useCompetitions();
  if (list.isLoading) return <Loading />;
  if (list.error) return <ErrorBox error={list.error} onRetry={() => void list.refetch()} />;
  const items = list.data ?? [];
  return (
    <>
      {items.length ? (
        <View style={{ gap: space.md }}>
          {items.map((c) => (
            <Card key={c.id} onPress={() => router.push(`/competitions/${c.id}`)} label={c.name}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="heading">{c.name}</Text>
                  <Text variant="small" muted>
                    {date(c.startDate)} – {date(c.endDate)} · {c.participants} {c.participants === 1 ? 'participante' : 'participantes'}
                  </Text>
                </View>
                <Badge label={PHASE[c.phase].label} tone={PHASE[c.phase].tone} />
              </Row>
              <Text variant="small" muted>
                {c.myGoal ? `Você está competindo: ${GOAL_LABELS[c.myGoal]}` : c.phase === 'finished' ? 'Você não participou' : 'Toque para participar'}
              </Text>
            </Card>
          ))}
        </View>
      ) : (
        <Empty icon="award" title="Nenhuma competição" message="Defina um período (ex.: 12 semanas) e cada um compete com o próprio objetivo." />
      )}
      <Button title="Nova competição" icon="plus" kind={items.length ? 'secondary' : 'primary'} onPress={() => router.push('/competitions/new')} />
      <HowItWorks />
    </>
  );
}

function Testes() {
  const tests = useTests();
  const pl = usePowerlifting();
  const { me } = useAuth();
  const { c } = useTheme();
  if (tests.isLoading) return <Loading />;
  if (tests.error) return <ErrorBox error={tests.error} onRetry={() => void tests.refetch()} />;
  return (
    <>
      <Section title="Total powerlifting · DOTS">
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          {pl.data?.length ? (
            pl.data.map((e, i) => (
              <View key={e.user.id}>
                {i ? <Divider /> : null}
                <ListItem
                  left={
                    <Row gap={space.md}>
                      <Text variant="bodyStrong" style={{ width: 22 }} color={i === 0 ? c.accent : c.textMuted}>
                        {e.rank}º
                      </Text>
                      <Avatar name={e.user.name} file={e.user.avatar} size={32} />
                    </Row>
                  }
                  title={e.user.id === me?.id ? `${e.user.name} (você)` : e.user.name}
                  subtitle={`Agach. ${num(e.squat, 0)} · Supino ${num(e.bench, 0)} · Terra ${num(e.deadlift, 0)} = ${num(e.total, 0)} kg`}
                  right={
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontFamily: font.semibold }}>{e.dots != null ? num(e.dots, 1) : '—'}</Text>
                      <Text variant="small" faint>
                        DOTS
                      </Text>
                    </View>
                  }
                  onPress={() => router.push(e.user.id === me?.id ? '/perfil' : `/people/${e.user.id}`)}
                />
              </View>
            ))
          ) : (
            <Text muted style={{ paddingVertical: space.lg }}>
              Registre agachamento, supino e terra para entrar no total.
            </Text>
          )}
        </Card>
        <Text variant="small" faint>
          DOTS compara força entre pesos corporais diferentes (precisa de sexo no perfil e peso registrado).
        </Text>
      </Section>
      {TEST_GROUPS.map((g) => {
        const items = (tests.data ?? []).filter((t) => t.test.group === g);
        return (
          <Section key={g} title={TEST_GROUP_LABELS[g]}>
            <Card padded={false} style={{ paddingHorizontal: space.lg }}>
              {items.map((t, i) => (
                <View key={t.test.id}>
                  {i ? <Divider /> : null}
                  <ListItem
                    title={t.test.name}
                    subtitle={
                      t.leader
                        ? `1º ${t.leader.user.name}: ${testValue(t.test.id, t.leader.value)}${t.leader.dots != null ? ` (${num(t.leader.dots, 0)} DOTS)` : ''}`
                        : 'Ninguém registrou ainda'
                    }
                    right={t.myRank ? <Badge label={`Você: ${t.myRank}º`} tone={t.myRank === 1 ? 'accent' : 'neutral'} /> : undefined}
                    onPress={() => router.push(`/tests/${t.test.id}`)}
                  />
                </View>
              ))}
            </Card>
          </Section>
        );
      })}
    </>
  );
}

export default function Ranking() {
  const [tab, setTab] = useState<'comp' | 'tests'>('comp');
  return (
    <Screen tab>
      <Header title="Ranking" />
      <Segmented
        options={[
          { value: 'comp', label: 'Competição' },
          { value: 'tests', label: 'Recordes' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'comp' ? <Competicoes /> : <Testes />}
    </Screen>
  );
}
