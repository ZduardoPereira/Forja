import { estimateOneRm, formatDuration, parseDuration, TEST_BY_ID, TEST_IDS, type TestId, validateResult } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { LineChart } from '@/components/charts/LineChart';
import { confirm, DateField, notify, parseNum, PhotoPicker } from '@/components/forms';
import { Avatar, Button, Card, Divider, Empty, ErrorBox, Field, IconButton, ListItem, Loading, Row, Screen, Section, Segmented, Text } from '@/components/ui';
import { del, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, errorText, num, testValue, today } from '@/lib/format';
import { invalidate, TEST_KEYS, useLeaderboard, useMembers, useTestHistory } from '@/lib/queries';
import type { FileRef, TestResultView } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { font, space } from '@/theme/tokens';

const TIME_STEPS = [5, 10, 15, 30, 60, 120, 300, 600];
const SPRINT_STEPS = [0.1, 0.2, 0.25, 0.5, 1, 2, 5];

const TIME_HINT: Partial<Record<TestId, string>> = {
  sprint_100m: 'Ex.: 13,2 (segundos)',
  run_1k: 'Ex.: 4:05 (min:seg)',
  run_5k: 'Ex.: 24:30 (min:seg)',
  run_10k: 'Ex.: 52:10 ou 1:02:03',
};

function AddResult({ testId, onSaved }: { testId: TestId; onSaved: () => void }) {
  const def = TEST_BY_ID[testId];
  const { c } = useTheme();
  const [day, setDay] = useState(today());
  const [value, setValue] = useState('');
  const [reps, setReps] = useState('1');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<FileRef[]>([]);
  const [error, setError] = useState<string | null>(null);

  const parsed = def.input === 'time' ? parseDuration(value) : parseNum(value);
  const repsN = def.input === 'load' ? Math.round(Number(reps) || 1) : null;
  const save = useMutation({
    mutationFn: () => post<TestResultView & { isRecord: boolean; firstTime: boolean }>('/tests/results', { testId, date: day, value: parsed, reps: repsN, notes: notes.trim() || null, fileId: files[0]?.id ?? null }),
    onSuccess: async (r) => {
      await invalidate(TEST_KEYS);
      setValue('');
      setNotes('');
      setFiles([]);
      setError(null);
      if (r.isRecord && !r.firstTime) notify('Novo recorde! 🎉', `${def.name}: ${testValue(testId, r.value, r.reps)}`);
      onSaved();
    },
    onError: (err) => setError(errorText(err)),
  });

  const submit = () => {
    if (parsed == null || Number.isNaN(parsed)) return setError(def.input === 'time' ? 'Tempo inválido. Use 12,4 ou 4:05 ou 1:02:03.' : 'Informe um número.');
    const errs = validateResult({ testId, value: parsed, reps: repsN });
    if (errs.length) return setError(errs[0]!);
    setError(null);
    save.mutate();
  };

  const label = { speed: 'Velocidade (km/h)', time: 'Tempo', load: 'Carga (kg)', reps: 'Repetições' }[def.input];
  return (
    <Card>
      <Text variant="heading">Registrar resultado</Text>
      <Row wrap gap={space.md} style={{ alignItems: 'flex-start' }}>
        <View style={{ flexGrow: 1, flexBasis: 160, gap: 6 }}>
          <Field
            label={label}
            value={value}
            onChangeText={setValue}
            placeholder={def.input === 'time' ? (TIME_HINT[testId] ?? '') : def.input === 'speed' ? 'Ex.: 28,5' : def.input === 'load' ? 'Ex.: 100' : 'Ex.: 12'}
            keyboardType={def.input === 'time' ? 'numbers-and-punctuation' : 'decimal-pad'}
            testID="test-value"
          />
          {def.input === 'time' && parsed != null && !Number.isNaN(parsed) ? (
            <Text variant="small" faint>
              = {formatDuration(parsed, testId === 'sprint_100m' ? 2 : 0)}
              {def.distanceM ? ` · ${num((def.distanceM / parsed) * 3.6, 1)} km/h` : ''}
            </Text>
          ) : null}
        </View>
        {def.input === 'load' ? (
          <View style={{ flexBasis: 120, gap: 6 }}>
            <Field label="Repetições" value={reps} onChangeText={setReps} placeholder="1" keyboardType="number-pad" maxLength={2} />
            {parsed && !Number.isNaN(parsed) && repsN && repsN > 1 ? (
              <Text variant="small" faint>
                1RM ≈ {num(estimateOneRm(parsed, repsN), 1)} kg
              </Text>
            ) : null}
          </View>
        ) : null}
      </Row>
      <DateField label="Data" value={day} onChange={setDay} />
      <Field label="Observações (opcional)" value={notes} onChangeText={setNotes} placeholder="Ex.: pista do parque, relógio com GPS" maxLength={280} />
      <PhotoPicker kind="test" files={files} onChange={setFiles} max={1} label="Foto como prova (opcional)" />
      {error ? <Text color={c.danger}>{error}</Text> : null}
      <Button title="Salvar resultado" onPress={submit} loading={save.isPending} testID="test-save" />
      {def.input === 'load' ? (
        <Text variant="small" faint>
          Com mais de 1 repetição o app estima o máximo (fórmula de Epley, até 12 reps). Melhor ainda: teste 1–3 reps com segurança e alguém de olho.
        </Text>
      ) : null}
    </Card>
  );
}

export default function TestScreen() {
  const params = useLocalSearchParams<{ testId: string; userId?: string }>();
  const testId = (TEST_IDS as readonly string[]).includes(params.testId) ? (params.testId as TestId) : null;
  const { me } = useAuth();
  const { c } = useTheme();
  const members = useMembers();
  const userId = params.userId && params.userId !== me?.id ? params.userId : undefined;
  const own = !userId;
  const [view, setView] = useState<'history' | 'ranking'>('history');
  const [showProtocol, setShowProtocol] = useState(false);
  const history = useTestHistory(testId ?? 'max_speed', userId);
  const board = useLeaderboard(testId ?? 'max_speed');

  const removeResult = useMutation({ mutationFn: (id: string) => del(`/tests/results/${id}`), onSuccess: () => invalidate(TEST_KEYS) });
  const confirmResult = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => (on ? post(`/tests/results/${id}/confirm`) : del(`/tests/results/${id}/confirm`)),
    onSuccess: () => invalidate([['test-history'], ['leaderboard']]),
  });

  if (!testId) return <Empty icon="alert-circle" title="Teste desconhecido" />;
  const def = TEST_BY_ID[testId];
  const person = userId ? members.data?.find((m) => m.id === userId) : null;
  const results = history.data?.results ?? [];
  const isTime = def.input === 'time';
  const fmtV = (v: number) => testValue(testId, v);

  return (
    <Screen>
      <Stack.Screen options={{ title: def.name }} />
      <View style={{ gap: 4 }}>
        <Text variant="display">{def.name}</Text>
        <Text muted>
          {person ? `Resultados de ${person.name}` : 'Seus resultados'} · {def.direction === 'lower' ? 'menor é melhor' : 'maior é melhor'}
        </Text>
      </View>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="heading">Como fazer o teste</Text>
          <Button title={showProtocol ? 'Ocultar' : 'Ver'} kind="ghost" small onPress={() => setShowProtocol((v) => !v)} />
        </Row>
        {showProtocol
          ? def.protocol.map((p, i) => (
              <Text key={i} variant="small" muted>
                {i + 1}. {p}
              </Text>
            ))
          : null}
      </Card>

      {own ? <AddResult testId={testId} onSaved={() => setView('history')} /> : null}

      <Segmented
        options={[
          { value: 'history', label: 'Histórico' },
          { value: 'ranking', label: 'Ranking do grupo' },
        ]}
        value={view}
        onChange={setView}
      />

      {view === 'history' ? (
        history.isLoading ? (
          <Loading />
        ) : history.error ? (
          <ErrorBox error={history.error} onRetry={() => void history.refetch()} />
        ) : results.length ? (
          <>
            <Card>
              <LineChart
                series={[{ key: 'v', label: def.name, color: c.chart1, points: results.map((r) => ({ date: r.date, value: r.effectiveValue })) }]}
                unit={def.unit}
                format={fmtV}
                tickFormat={isTime ? (v) => formatDuration(v, testId === 'sprint_100m' ? 1 : 0).replace(' s', '') : undefined}
                tickSteps={isTime ? (testId === 'sprint_100m' ? SPRINT_STEPS : TIME_STEPS) : undefined}
              />
              {def.input === 'load' ? (
                <Text variant="small" faint>
                  Valores em 1RM (estimado quando houve mais de 1 repetição).
                </Text>
              ) : null}
            </Card>
            <Card padded={false} style={{ paddingHorizontal: space.lg }}>
              {[...results].reverse().map((r, i) => {
                const iConfirmed = !!me && r.confirmedBy.includes(me.id);
                return (
                  <View key={r.id}>
                    {i ? <Divider /> : null}
                    <ListItem
                      title={testValue(testId, r.value, r.reps)}
                      subtitle={[
                        date(r.date),
                        r.estimated ? `1RM ≈ ${num(r.effectiveValue, 1)} kg` : null,
                        r.bodyweightKg && def.input === 'load' ? `${num(r.effectiveValue / r.bodyweightKg, 2)}× o peso` : null,
                        r.confirmedBy.length ? `✓ visto por ${r.confirmedBy.length}` : null,
                        r.notes,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      right={
                        own ? (
                          <IconButton
                            icon="trash-2"
                            size={16}
                            label="Apagar resultado"
                            onPress={async () => {
                              if (await confirm('Apagar resultado?', testValue(testId, r.value, r.reps), 'Apagar')) removeResult.mutate(r.id);
                            }}
                          />
                        ) : (
                          <Button title={iConfirmed ? 'Vi ✓' : 'Eu vi'} small kind={iConfirmed ? 'secondary' : 'ghost'} onPress={() => confirmResult.mutate({ id: r.id, on: !iConfirmed })} />
                        )
                      }
                    />
                  </View>
                );
              })}
            </Card>
          </>
        ) : (
          <Empty icon="bar-chart-2" title="Sem resultados ainda" message={own ? 'Registre o primeiro para começar o gráfico.' : undefined} />
        )
      ) : board.isLoading ? (
        <Loading />
      ) : board.error ? (
        <ErrorBox error={board.error} onRetry={() => void board.refetch()} />
      ) : board.data?.entries.length ? (
        <Section title={def.input === 'load' ? 'Ordenado por DOTS (justo entre pesos diferentes)' : 'Melhor resultado de cada um'}>
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {board.data.entries.map((e, i) => (
              <View key={e.user.id}>
                {i ? <Divider /> : null}
                <ListItem
                  left={
                    <Row gap={space.md}>
                      <Text variant="bodyStrong" style={{ width: 24 }} color={e.rank === 1 ? c.accent : c.textMuted}>
                        {e.rank}º
                      </Text>
                      <Avatar name={e.user.name} file={e.user.avatar} size={32} />
                    </Row>
                  }
                  title={e.user.id === me?.id ? `${e.user.name} (você)` : e.user.name}
                  subtitle={[
                    date(e.result.date),
                    e.relative != null ? `${num(e.relative, 2)}× o peso` : null,
                    e.result.confirmedBy.length ? `✓ ${e.result.confirmedBy.length}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  right={
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontFamily: font.semibold }}>{fmtV(e.value)}</Text>
                      {e.dots != null ? (
                        <Text variant="small" faint>
                          {num(e.dots, 1)} DOTS
                        </Text>
                      ) : null}
                    </View>
                  }
                  onPress={() => router.push(e.user.id === me?.id ? '/perfil' : `/people/${e.user.id}`)}
                />
              </View>
            ))}
          </Card>
        </Section>
      ) : (
        <Empty icon="award" title="Ninguém registrou ainda" />
      )}
    </Screen>
  );
}
