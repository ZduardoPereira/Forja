import { formatDuration, formatPace } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { confirm } from '@/components/forms';
import { Badge, Button, Card, Divider, ErrorBox, ListItem, Loading, Row, Screen, Section, Stat, Text } from '@/components/ui';
import { get, post } from '@/lib/api';
import { date, errorText, num } from '@/lib/format';
import { invalidate, queryClient, useStravaStatus, useStravaSummary } from '@/lib/queries';
import type { StravaSummary } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';

const STRAVA_ORANGE = '#FC4C02';
const RESULT_TEXT: Record<string, string> = {
  connected: 'Strava conectado!',
  denied: 'Você não autorizou o acesso.',
  missing_scope: 'Marque a permissão de ver suas atividades para o app ler as corridas.',
  error: 'Não deu para conectar. Tente de novo.',
};

export default function Strava() {
  const params = useLocalSearchParams<{ strava?: string }>();
  const status = useStravaStatus();
  const connected = !!status.data?.connected;
  const summary = useStravaSummary(connected);
  const { c } = useTheme();
  const [message, setMessage] = useState<string | null>(params.strava ? (RESULT_TEXT[params.strava] ?? null) : null);

  const connect = useMutation({
    mutationFn: async () => {
      const returnTo = Platform.OS === 'web' ? `${window.location.origin}/strava` : Linking.createURL('strava');
      const { url } = await post<{ url: string }>('/strava/connect', { returnTo });
      if (Platform.OS === 'web') {
        window.location.assign(url);
        return;
      }
      const res = await WebBrowser.openAuthSessionAsync(url, returnTo);
      if (res.type === 'success') {
        const result = Linking.parse(res.url).queryParams?.strava;
        setMessage(typeof result === 'string' ? (RESULT_TEXT[result] ?? null) : null);
      }
      await invalidate([['strava-status'], ['strava-summary']]);
    },
    onError: (err) => setMessage(errorText(err)),
  });
  const refresh = useMutation({
    mutationFn: () => get<StravaSummary>('/strava/summary', { refresh: true }),
    onSuccess: (data) => queryClient.setQueryData(['strava-summary'], data),
    onError: (err) => setMessage(errorText(err)),
  });
  const disconnect = useMutation({
    mutationFn: () => post('/strava/disconnect'),
    onSuccess: () => invalidate([['strava-status'], ['strava-summary']]),
  });

  if (status.isLoading) return <Loading />;
  if (status.error) return <ErrorBox error={status.error} onRetry={() => void status.refetch()} />;
  const s = summary.data;

  return (
    <Screen>
      <View style={{ gap: space.sm }}>
        <Text variant="display">Strava</Text>
        <Text muted>Seus melhores tempos de corrida dos últimos 6 meses, lidos do Strava.</Text>
      </View>
      {message ? (
        <Card style={{ backgroundColor: c.accentSoft, borderWidth: 0 }}>
          <Text>{message}</Text>
        </Card>
      ) : null}

      {!status.data?.configured ? (
        <Card>
          <Text variant="heading">Ainda não configurado</Text>
          <Text muted>Quem hospeda o FORJA precisa criar um app no Strava e preencher STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET no servidor. O passo a passo está em docs/STRAVA.md.</Text>
        </Card>
      ) : !connected ? (
        <Card>
          <Text variant="heading">Conectar sua conta</Text>
          <Text muted>O app só lê suas atividades (permissão de leitura). Você pode desconectar quando quiser, e aí tudo que veio do Strava é apagado.</Text>
          <Pressable
            onPress={() => connect.mutate()}
            disabled={connect.isPending}
            accessibilityRole="button"
            accessibilityLabel="Conectar com o Strava"
            style={({ pressed }) => ({ backgroundColor: STRAVA_ORANGE, borderRadius: radius.md, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed || connect.isPending ? 0.8 : 1 })}
          >
            <Text color="#fff" style={{ fontFamily: font.semibold }}>
              {connect.isPending ? 'Abrindo o Strava…' : 'Conectar com o Strava'}
            </Text>
          </Pressable>
        </Card>
      ) : summary.isLoading ? (
        <Loading label="Lendo suas corridas…" />
      ) : summary.error ? (
        <ErrorBox error={summary.error} onRetry={() => void summary.refetch()} />
      ) : s ? (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="caption" muted>
                Melhores tempos · {s.runs} corrida(s) em {s.periodDays} dias
              </Text>
            </Row>
            <Row wrap gap={space.lg} style={{ alignItems: 'flex-start' }}>
              {(['run_1k', 'run_5k', 'run_10k'] as const).map((k) => {
                const b = s.bests[k];
                return (
                  <Stat
                    key={k}
                    label={k === 'run_1k' ? '1 km' : k === 'run_5k' ? '5 km' : '10 km'}
                    value={b ? formatDuration(b.seconds) : '—'}
                    hint={b ? `${date(b.date)}${b.source === 'estimated' ? ' · estimado pela corrida' : ''}` : 'sem corrida dessa distância'}
                  />
                );
              })}
              <Stat label="Vel. máxima" value={s.maxSpeed ? num(s.maxSpeed.kmh, 1) : '—'} unit="km/h" hint={s.maxSpeed ? date(s.maxSpeed.date) : null} />
            </Row>
            <Text variant="small" faint>
              Esses dados são só seus (regra do Strava: não podem ser mostrados aos amigos nem entrar no ranking). Para competir, registre o resultado no teste correspondente.
            </Text>
            <Row wrap gap={space.sm}>
              <Button title="Teste 1 km" small kind="secondary" onPress={() => router.push('/tests/run_1k')} />
              <Button title="Teste 5 km" small kind="secondary" onPress={() => router.push('/tests/run_5k')} />
              <Button title="Teste 10 km" small kind="secondary" onPress={() => router.push('/tests/run_10k')} />
              <Button title="Vel. máxima" small kind="secondary" onPress={() => router.push('/tests/max_speed')} />
            </Row>
          </Card>

          <Section title="Corridas recentes">
            <Card padded={false} style={{ paddingHorizontal: space.lg }}>
              {s.recent.length ? (
                s.recent.map((r, i) => (
                  <View key={`${r.date}-${i}`}>
                    {i ? <Divider /> : null}
                    <ListItem title={r.name ?? 'Corrida'} subtitle={`${date(r.date)} · ${num(r.distanceKm, 2)} km · ${formatDuration(r.movingTimeSec)} · ${formatPace(r.paceSecPerKm)}`} />
                  </View>
                ))
              ) : (
                <Text muted style={{ paddingVertical: space.lg }}>
                  Nenhuma corrida no período.
                </Text>
              )}
            </Card>
          </Section>

          <Row wrap gap={space.sm} style={{ justifyContent: 'space-between' }}>
            <Text variant="small" faint>
              Atualizado em {new Date(s.fetchedAt).toLocaleString('pt-BR')} {s.cached ? '(cache)' : ''}
            </Text>
            <Badge label="Powered by Strava" />
          </Row>
          <Button
            title="Atualizar agora"
            icon="refresh-cw"
            kind="secondary"
            loading={refresh.isPending}
            onPress={() => refresh.mutate()}
          />
        </>
      ) : null}

      {connected ? (
        <Button
          title="Desconectar e apagar dados do Strava"
          kind="danger"
          loading={disconnect.isPending}
          onPress={async () => {
            if (await confirm('Desconectar o Strava?', 'O acesso é revogado e tudo que veio do Strava é apagado do FORJA.', 'Desconectar')) disconnect.mutate();
          }}
        />
      ) : null}
    </Screen>
  );
}
