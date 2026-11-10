import { ACTIVITY_LABELS, RSVP_LABELS } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Avatar, Badge, Button, Card, Empty, ErrorBox, Header, Icon, Loading, Row, Screen, Section, Stat, Text } from '@/components/ui';
import { put } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { num, relativeDay, time } from '@/lib/format';
import { invalidate, useHome, useMembers } from '@/lib/queries';
import type { Home } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function EventCard({ e }: { e: Home['events'][number] }) {
  const { c } = useTheme();
  const rsvp = useMutation({
    mutationFn: () => put(`/events/${e.id}/rsvp`, { status: 'going' }),
    onSuccess: () => invalidate([['home'], ['events'], ['event', e.id]]),
  });
  return (
    <Card onPress={() => router.push(`/events/${e.id}`)} label={`${e.title}, ${relativeDay(e.startsAt)} às ${time(e.startsAt)}`}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="caption" muted>
            {relativeDay(e.startsAt)} · {time(e.startsAt)}
          </Text>
          <Text variant="heading">{e.title}</Text>
          <Text variant="small" muted>
            {ACTIVITY_LABELS[e.kind]}
            {e.location ? ` · ${e.location}` : ''}
          </Text>
        </View>
        {e.myStatus ? <Badge label={RSVP_LABELS[e.myStatus]} tone={e.myStatus === 'going' ? 'accent' : 'neutral'} /> : null}
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6}>
          <Icon name="users" size={14} color={c.textMuted} />
          <Text variant="small" muted>
            {e.going} {e.going === 1 ? 'confirmado' : 'confirmados'}
          </Text>
        </Row>
        {!e.myStatus ? <Button title="Vou" small kind="secondary" icon="check" onPress={() => rsvp.mutate()} loading={rsvp.isPending} /> : null}
      </Row>
    </Card>
  );
}

export default function HomeScreen() {
  const { me } = useAuth();
  const { c } = useTheme();
  const home = useHome();
  const members = useMembers();
  const h = home.data;

  return (
    <Screen tab refreshing={home.isRefetching} onRefresh={() => void home.refetch()}>
      <Header title={`${greeting()}, ${me?.name.split(' ')[0] ?? ''}`} subtitle={new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} />

      <Row wrap gap={space.sm}>
        <Button title="Marcar treino" icon="plus" small onPress={() => router.push('/events/new')} />
        <Button title="Registrar peso" icon="trending-down" small kind="secondary" onPress={() => router.push('/body/weigh-in')} />
        <Button title="Treino feito" icon="check-circle" small kind="secondary" onPress={() => router.push('/log')} />
        <Button title="Novo teste" icon="zap" small kind="secondary" onPress={() => router.push('/perfil')} />
      </Row>

      {home.isLoading ? <Loading /> : home.error ? <ErrorBox error={home.error} onRetry={() => void home.refetch()} /> : null}

      {h ? (
        <>
          <Section title="Próximos treinos" action={<Button title="Agenda" kind="ghost" small onPress={() => router.push('/treinos')} />}>
            {h.events.length ? (
              h.events.map((e) => <EventCard key={e.id} e={e} />)
            ) : (
              <Card>
                <Empty icon="calendar" title="Nenhum treino marcado" message="Marque um horário e chame a galera." action={{ label: 'Marcar treino', onPress: () => router.push('/events/new') }} />
              </Card>
            )}
          </Section>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            <View style={{ flexGrow: 1, flexBasis: 260 }}>
              <Card onPress={() => (h.competition ? router.push(`/competitions/${h.competition.id}`) : router.push('/ranking'))} label="Competição" style={{ flex: 1 }}>
                <Text variant="caption" muted>
                  Competição
                </Text>
                {h.competition ? (
                  <>
                    <Text variant="heading">{h.competition.name}</Text>
                    <Row gap={space.xl}>
                      <Stat label="Sua posição" value={h.competition.myRank ? `${h.competition.myRank}º` : '—'} hint={`de ${h.competition.participants}`} />
                      <Stat label="Faltam" value={String(h.competition.daysLeft)} unit="dias" />
                    </Row>
                    {h.competition.leader ? (
                      <Text variant="small" muted>
                        Liderando: {h.competition.leader.user.name} ({num(h.competition.leader.total, 1)} pts)
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text muted>Nenhuma competição ativa. Crie uma em Ranking.</Text>
                )}
              </Card>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 200 }}>
              <Card onPress={() => router.push('/perfil')} label="Peso" style={{ flex: 1 }}>
                <Text variant="caption" muted>
                  Peso
                </Text>
                {h.weight ? (
                  <Stat
                    label="Último registro"
                    value={num(h.weight.weightKg, 1)}
                    unit="kg"
                    hint={h.weight.weekChange != null ? `${h.weight.weekChange > 0 ? '+' : ''}${num(h.weight.weekChange, 1)} kg em 7 dias` : null}
                  />
                ) : (
                  <Text muted>Registre seu peso para acompanhar no gráfico.</Text>
                )}
              </Card>
            </View>
          </View>
        </>
      ) : null}

      {members.data?.length ? (
        <Section title="Grupo">
          <Row wrap gap={space.lg}>
            {members.data.map((m) => (
              <Pressable key={m.id} onPress={() => router.push(m.id === me?.id ? '/perfil' : `/people/${m.id}`)} accessibilityRole="button" accessibilityLabel={`${m.name}${m.online ? ', online' : ''}`} style={{ alignItems: 'center', gap: 6, width: 64 }}>
                <Avatar name={m.name} file={m.avatar} size={48} online={m.online} />
                <Text variant="small" numberOfLines={1} color={c.textMuted}>
                  {m.name.split(' ')[0]}
                </Text>
              </Pressable>
            ))}
          </Row>
        </Section>
      ) : null}
    </Screen>
  );
}
