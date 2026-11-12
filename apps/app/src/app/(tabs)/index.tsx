import { ACTIVITY_LABELS, RSVP_LABELS } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { GroupToday, StreakHero, TabHeader } from '@/components/activity';
import { ActiveWorkoutCard } from '@/components/workout';
import { Badge, Button, Card, Empty, ErrorBox, Icon, type IconName, Loading, Row, Screen, Section, Stat, Text } from '@/components/ui';
import { absoluteUrl, put } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { num, relativeDay, time } from '@/lib/format';
import { invalidate, useActivityGroup, useHome } from '@/lib/queries';
import { storage } from '@/lib/storage';
import type { Home } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const TUTORIAL_KEY = 'forja.tutorial-dispensado';
/** Versão deste APK (colocada no app por "npm run apk"); no navegador não existe. */
const APK_BUILD = Number(process.env.EXPO_PUBLIC_APK_BUILD ?? 0);

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
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

function Shortcut({ icon, label, hint, onPress }: { icon: IconName; label: string; hint: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}`}
      style={({ pressed }) => ({ flexGrow: 1, flexBasis: 150, padding: space.md, gap: 6, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.75 : 1 })}
    >
      <Icon name={icon} color={c.accent} size={20} />
      <Text variant="bodyStrong">{label}</Text>
      <Text variant="small" faint numberOfLines={2}>
        {hint}
      </Text>
    </Pressable>
  );
}

function TutorialCard() {
  const [hidden, setHidden] = useState(true);
  const { c } = useTheme();
  useEffect(() => {
    void storage.get(TUTORIAL_KEY).then((v) => setHidden(v === '1'));
  }, []);
  if (hidden) return null;
  return (
    <Card style={{ backgroundColor: c.accentSoft, borderWidth: 0 }}>
      <Text variant="heading">📖 Novo por aqui? Leia o Tutorial para o baiano</Text>
      <Text variant="small" muted>
        Tudo o que o FORJA faz, explicado passo a passo: sequência, treinos, dieta, rankings e notificações.
      </Text>
      <Row gap={space.sm}>
        <Button title="Abrir o tutorial" small onPress={() => router.push('/tutorial')} />
        <Button
          title="Agora não"
          small
          kind="ghost"
          onPress={() => {
            setHidden(true);
            void storage.set(TUTORIAL_KEY, '1');
          }}
        />
      </Row>
    </Card>
  );
}

function ApkBanner({ apk }: { apk: Home['apk'] }) {
  if (Platform.OS !== 'android' || !apk || apk.versionCode <= APK_BUILD) return null;
  return (
    <Card onPress={() => void Linking.openURL(absoluteUrl(apk.url)!)} label="Baixar a versão nova do app">
      <Row gap={space.md}>
        <Text style={{ fontSize: 26 }}>⬇️</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">Versão nova do app disponível</Text>
          <Text variant="small" muted>
            Toque para baixar e instale por cima (seus dados ficam).
          </Text>
        </View>
      </Row>
    </Card>
  );
}

export default function HomeScreen() {
  const { me } = useAuth();
  const home = useHome();
  const group = useActivityGroup();
  const h = home.data;
  const refetch = () => void Promise.all([home.refetch(), group.refetch()]);

  return (
    <Screen tab refreshing={home.isRefetching} onRefresh={refetch}>
      <TabHeader title={`${greeting()}, ${me?.name.split(' ')[0] ?? ''}`} subtitle={new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} />
      <TutorialCard />
      {h ? <ApkBanner apk={h.apk} /> : null}
      {home.isLoading ? <Loading /> : home.error ? <ErrorBox error={home.error} onRetry={refetch} /> : null}
      {h ? <StreakHero streak={h.streak} /> : null}
      <ActiveWorkoutCard />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <Shortcut icon="activity" label="Treinar" hint="Rotinas e assistente de séries" onPress={() => router.push('/treinar')} />
        <Shortcut icon="trending-down" label="Registrar peso" hint="Com foto, se quiser" onPress={() => router.push('/body/weigh-in')} />
        <Shortcut icon="coffee" label="Minha dieta" hint="Refeições e calorias do dia" onPress={() => router.push('/dieta')} />
        <Shortcut icon="calendar" label="Marcar treino" hint="Combinar com a galera" onPress={() => router.push('/events/new')} />
      </View>

      <Section title={group.data ? `Hoje no grupo · ${group.data.doneToday} de ${group.data.members.length} já treinaram` : 'Hoje no grupo'} action={<Button title="Ranking" kind="ghost" small onPress={() => router.push('/ranking')} />}>
        <GroupToday />
      </Section>

      {h ? (
        <>
          <Section title="Próximos treinos marcados" action={<Button title="Agenda" kind="ghost" small onPress={() => router.push('/agenda')} />}>
            {h.events.length ? (
              h.events.map((e) => <EventCard key={e.id} e={e} />)
            ) : (
              <Card>
                <Empty icon="calendar" title="Nenhum treino marcado" message="Marque um horário e chame a galera." action={{ label: 'Marcar treino', onPress: () => router.push('/events/new') }} />
              </Card>
            )}
          </Section>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {h.competition ? (
              <View style={{ flexGrow: 1, flexBasis: 260 }}>
                <Card onPress={() => router.push(`/competitions/${h.competition!.id}`)} label="Competição" style={{ flex: 1 }}>
                  <Text variant="caption" muted>
                    Competição
                  </Text>
                  <Text variant="heading">{h.competition.name}</Text>
                  <Row gap={space.xl}>
                    <Stat label="Sua posição" value={h.competition.myRank ? `${h.competition.myRank}º` : '—'} hint={`de ${h.competition.participants}`} />
                    <Stat label="Faltam" value={String(h.competition.daysLeft)} unit="dias" />
                  </Row>
                </Card>
              </View>
            ) : null}
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
    </Screen>
  );
}
