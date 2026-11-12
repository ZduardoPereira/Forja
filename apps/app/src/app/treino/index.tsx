/**
 * Assistente de treino: a rotina vira uma tabela de séries (peso × repetições). Marcou a série,
 * o descanso começa a contar; no fim, o treino é salvo com tudo e conta para a sequência.
 */
import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router, Stack } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirm } from '@/components/forms';
import { Button, Card, Divider, Empty, Field, Flame, Icon, IconButton, ListItem, Loading, ProgressBar, Row, Text } from '@/components/ui';
import { post } from '@/lib/api';
import { errorText, num } from '@/lib/format';
import { ACTIVITY_KEYS, invalidate, useExercisePrevious, useExercises } from '@/lib/queries';
import type { ExercisePrevious, SessionResult } from '@/lib/types';
import { type ActiveWorkout, newSet, parseInput, setWorkout, uid, useWorkout, type WorkoutExercise } from '@/lib/workout';
import { useTheme } from '@/theme/ThemeProvider';
import { CONTENT_MAX, font, radius, space, type } from '@/theme/tokens';

const REST_PRESETS = [45, 60, 90, 120, 180];
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function haptic(kind: 'tap' | 'done') {
  if (Platform.OS === 'web') {
    if (kind === 'done') (navigator as Navigator & { vibrate?: (p: number[]) => boolean }).vibrate?.([200, 100, 200]);
    return;
  }
  void (kind === 'tap' ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)).catch(() => undefined);
}

function KeepAwake() {
  useKeepAwake();
  return null;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Atualiza um exercício do treino em andamento. */
function updateExercise(key: string, fn: (e: WorkoutExercise) => WorkoutExercise) {
  setWorkout((w) => (w ? { ...w, exercises: w.exercises.map((e) => (e.key === key ? fn(e) : e)) } : w));
}

function prevText(p: ExercisePrevious | undefined, index: number): string {
  const s = p?.last?.sets[index] ?? p?.last?.sets.at(-1);
  if (!s) return '—';
  if (s.weightKg != null && s.reps != null) return `${num(s.weightKg, 1)}×${s.reps}`;
  if (s.reps != null) return `${s.reps} reps`;
  return '—';
}

function SetInput({ value, onChange, placeholder, decimal, label }: { value: string; onChange: (v: string) => void; placeholder: string; decimal?: boolean; label: string }) {
  const { c } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={(v) => onChange(v.replace(decimal ? /[^\d.,]/g : /\D/g, '').slice(0, 6))}
      placeholder={placeholder}
      placeholderTextColor={c.textFaint}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      accessibilityLabel={label}
      selectTextOnFocus
      style={[type.bodyStrong, { flex: 1, minWidth: 0, textAlign: 'center', color: c.text, backgroundColor: c.surfaceAlt, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 4 }]}
    />
  );
}

function ExerciseCard({ ex, prev, onRest }: { ex: WorkoutExercise; prev?: ExercisePrevious; onRest: (ex: WorkoutExercise, setId: string) => void }) {
  const { c } = useTheme();
  const done = ex.sets.filter((s) => s.done).length;
  const cycleRest = () => updateExercise(ex.key, (e) => ({ ...e, restSec: REST_PRESETS[(REST_PRESETS.indexOf(e.restSec) + 1) % REST_PRESETS.length] ?? 90 }));
  const toggle = (setId: string) => {
    let started = false;
    updateExercise(ex.key, (e) => {
      const i = e.sets.findIndex((s) => s.id === setId);
      const cur = e.sets[i]!;
      const sets = e.sets.map((s) => (s.id === setId ? { ...s, done: !s.done } : s));
      // Próxima série vazia herda peso e repetições desta (é o mais comum).
      const next = sets[i + 1];
      if (!cur.done && next && !next.done && !next.weight && !next.reps) sets[i + 1] = { ...next, weight: cur.weight, reps: cur.reps };
      started = !cur.done;
      return { ...e, sets };
    });
    if (started) {
      haptic('tap');
      onRest(ex, setId);
    }
  };
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Pressable style={{ flex: 1, gap: 2 }} onPress={() => router.push(`/exercises/${ex.exerciseId}`)} accessibilityRole="link" accessibilityHint="Ver como fazer">
          <Text variant="heading">{ex.name}</Text>
          <Text variant="small" muted>
            {done}/{ex.sets.length} séries{ex.target ? ` · meta ${ex.target} reps` : ''}
            {prev?.best ? ` · recorde ${num(prev.best.weightKg, 1)}×${prev.best.reps}` : ''}
          </Text>
        </Pressable>
        <IconButton
          icon="trash-2"
          size={16}
          label={`Tirar ${ex.name} do treino`}
          onPress={async () => {
            if (await confirm('Tirar exercício?', `${ex.name} sai deste treino.`, 'Tirar')) setWorkout((w) => (w ? { ...w, exercises: w.exercises.filter((e) => e.key !== ex.key) } : w));
          }}
        />
      </Row>
      <Pressable onPress={cycleRest} accessibilityRole="button" accessibilityLabel={`Descanso ${ex.restSec} segundos. Toque para mudar`} style={{ alignSelf: 'flex-start' }}>
        <Row gap={6}>
          <Icon name="clock" size={14} color={c.textMuted} />
          <Text variant="small" muted>
            Descanso: {mmss(ex.restSec)} (toque para mudar)
          </Text>
        </Row>
      </Pressable>
      <View style={{ gap: 6 }}>
        <Row gap={space.sm}>
          <Text variant="caption" faint style={{ width: 40, textAlign: 'center', letterSpacing: 0 }}>
            Série
          </Text>
          <Text variant="caption" faint style={{ flex: 1.2, textAlign: 'center' }}>
            Anterior
          </Text>
          <Text variant="caption" faint style={{ flex: 1, textAlign: 'center' }}>
            kg
          </Text>
          <Text variant="caption" faint style={{ flex: 1, textAlign: 'center' }}>
            Reps
          </Text>
          <View style={{ width: 40 }} />
        </Row>
        {ex.sets.map((s, i) => (
          <Row key={s.id} gap={space.sm} style={{ backgroundColor: s.done ? c.accentSoft : 'transparent', borderRadius: radius.sm, paddingVertical: 2 }}>
            <Text variant="bodyStrong" style={{ width: 40, textAlign: 'center' }} color={s.done ? c.accent : c.textMuted}>
              {i + 1}
            </Text>
            <Text variant="small" faint style={{ flex: 1.2, textAlign: 'center' }} numberOfLines={1}>
              {prevText(prev, i)}
            </Text>
            <SetInput value={s.weight} decimal placeholder={prev?.last?.sets[i]?.weightKg != null ? num(prev.last.sets[i]!.weightKg, 1) : 'kg'} label={`Peso da série ${i + 1}`} onChange={(v) => updateExercise(ex.key, (e) => ({ ...e, sets: e.sets.map((x) => (x.id === s.id ? { ...x, weight: v } : x)) }))} />
            <SetInput value={s.reps} placeholder={prev?.last?.sets[i]?.reps != null ? String(prev.last.sets[i]!.reps) : (ex.target?.split('-')[0] ?? 'reps')} label={`Repetições da série ${i + 1}`} onChange={(v) => updateExercise(ex.key, (e) => ({ ...e, sets: e.sets.map((x) => (x.id === s.id ? { ...x, reps: v } : x)) }))} />
            <Pressable
              onPress={() => toggle(s.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: s.done }}
              accessibilityLabel={`Série ${i + 1} feita`}
              hitSlop={6}
              style={{ width: 40, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: s.done ? c.accent : c.surfaceAlt }}
            >
              <Icon name="check" size={18} color={s.done ? c.onAccent : c.textFaint} />
            </Pressable>
          </Row>
        ))}
      </View>
      <Row gap={space.sm}>
        <Button title="Série" icon="plus" small kind="secondary" onPress={() => updateExercise(ex.key, (e) => ({ ...e, sets: [...e.sets, newSet(e.sets.at(-1))] }))} />
        {ex.sets.length > 1 ? <Button title="Tirar a última" small kind="ghost" onPress={() => updateExercise(ex.key, (e) => ({ ...e, sets: e.sets.slice(0, -1) }))} /> : null}
      </Row>
    </Card>
  );
}

/** Barra do descanso: contagem regressiva, ±15 s e pular. */
function RestBar({ w }: { w: ActiveWorkout }) {
  const { c } = useTheme();
  const now = useNow(250);
  const rest = w.rest!;
  const left = Math.ceil((Date.parse(rest.endsAt) - now) / 1000);
  const finished = left <= 0;
  const buzzed = useRef(false);
  useEffect(() => {
    if (finished && !buzzed.current) {
      buzzed.current = true;
      haptic('done');
      const t = setTimeout(() => endRest(w, rest.total), 4000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [finished, rest.total, w]);
  const shift = (sec: number) => setWorkout((x) => (x?.rest ? { ...x, rest: { ...x.rest, endsAt: new Date(Date.parse(x.rest.endsAt) + sec * 1000).toISOString(), total: Math.max(5, x.rest.total + sec) } } : x));
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: finished ? c.accent : c.surface, padding: space.md, gap: space.sm }} accessibilityLiveRegion="polite">
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Text variant="caption" color={finished ? c.onAccent : c.textMuted}>
            {finished ? 'Descanso acabou' : 'Descansando'}
          </Text>
          <Text style={{ fontFamily: font.bold, fontSize: 30, letterSpacing: -1 }} color={finished ? c.onAccent : c.text}>
            {finished ? 'Bora! 💪' : mmss(left)}
          </Text>
        </View>
        {!finished ? (
          <Row gap={space.sm}>
            <Button title="−15s" small kind="secondary" onPress={() => shift(-15)} />
            <Button title="+15s" small kind="secondary" onPress={() => shift(15)} />
            <Button title="Pular" small onPress={() => endRest(w, rest.total - left)} />
          </Row>
        ) : (
          <Button title="Fechar" small kind="secondary" onPress={() => endRest(w, rest.total)} />
        )}
      </Row>
      {!finished ? <ProgressBar value={1 - left / rest.total} label="Tempo de descanso" /> : null}
    </View>
  );
}

/** Termina o descanso e anota quanto tempo foi de verdade na série que o originou. */
function endRest(w: ActiveWorkout, restedSec: number) {
  const r = w.rest;
  if (!r) return;
  setWorkout((x) =>
    x
      ? {
          ...x,
          rest: null,
          exercises: x.exercises.map((e) => (e.key === r.exerciseKey ? { ...e, sets: e.sets.map((s) => (s.id === r.setId ? { ...s, restSec: Math.max(0, Math.round(restedSec)) } : s)) } : e)),
        }
      : x,
  );
}

function AddExercise({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const results = useExercises(q, null, null);
  const { c } = useTheme();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ padding: space.lg, gap: space.md, flex: 1, width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="title">Adicionar exercício</Text>
            <IconButton icon="x" label="Fechar" onPress={onClose} />
          </Row>
          <Field label="Buscar no catálogo" value={q} onChangeText={setQ} placeholder="Ex.: supino, agachamento, rosca" autoFocus />
          <ScrollView keyboardShouldPersistTaps="handled">
            {results.isLoading ? <Loading /> : null}
            {(results.data?.items ?? []).map((e, i) => (
              <View key={e.id}>
                {i ? <Divider /> : null}
                <ListItem
                  title={e.namePt}
                  subtitle={[e.bodyPart, e.equipment].filter(Boolean).join(' · ') || null}
                  right={<Icon name="plus" color={c.accent} />}
                  onPress={() => {
                    setWorkout((w) => (w ? { ...w, exercises: [...w.exercises, { key: uid(), exerciseId: e.id, name: capitalize(e.namePt), restSec: 90, target: null, sets: [newSet(), newSet(), newSet()] }] } : w));
                    setQ('');
                    onClose();
                  }}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Summary({ result }: { result: SessionResult }) {
  const { c } = useTheme();
  const s = result.summary;
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'Treino salvo', headerRight: () => null }} />
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl, width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', gap: space.sm }}>
          <Text style={{ fontSize: 48 }}>🏁</Text>
          <Text variant="display" style={{ textAlign: 'center' }}>
            Treino concluído!
          </Text>
          <Text muted style={{ textAlign: 'center' }}>
            {result.log.title} · {s.durationMin} min
          </Text>
        </View>
        <Card>
          <Row wrap gap={space.lg}>
            <View style={{ flex: 1, minWidth: 90, gap: 2 }}>
              <Text variant="caption" muted>
                Séries
              </Text>
              <Text variant="metric">{s.sets}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 90, gap: 2 }}>
              <Text variant="caption" muted>
                Repetições
              </Text>
              <Text variant="metric">{s.reps}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 90, gap: 2 }}>
              <Text variant="caption" muted>
                Volume
              </Text>
              <Text variant="metric">{num(s.volumeKg, 0)}</Text>
              <Text variant="small" faint>
                kg levantados
              </Text>
            </View>
          </Row>
        </Card>
        {s.records.length ? (
          <Card style={{ borderColor: c.warning, borderWidth: 1 }}>
            <Text variant="heading">🏆 Recordes pessoais</Text>
            {s.records.map((r) => (
              <Text key={r.exerciseId}>
                {r.name}: {num(r.weightKg, 1)} kg × {r.reps} (1RM ≈ {num(r.e1rm, 1)} kg)
              </Text>
            ))}
          </Card>
        ) : null}
        <Card>
          <Row gap={space.lg}>
            <Flame n={result.streak.current} size="large" />
            <Text style={{ flex: 1 }} muted>
              {result.streak.current === 1 ? 'Primeiro dia da sequência! Treine amanhã para ela crescer.' : `${result.streak.current} dias seguidos. Continue assim!`}
            </Text>
          </Row>
        </Card>
        <Button title="Ver treino" icon="list" kind="secondary" onPress={() => router.replace(`/treino/${result.log.id}`)} />
        <Button title="Fechar" onPress={() => router.replace('/treinar')} />
      </ScrollView>
    </SafeAreaView>
  );
}

export default function WorkoutScreen() {
  const w = useWorkout();
  const { c } = useTheme();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const now = useNow(1000);
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = useMemo(() => [...new Set((w?.exercises ?? []).map((e) => e.exerciseId))], [w?.exercises]);
  const previous = useExercisePrevious(ids);
  const prevOf = (id: string) => previous.data?.find((p) => p.exerciseId === id);

  const save = useMutation({
    mutationFn: (payload: unknown) => post<SessionResult>('/sessions', payload),
    onSuccess: async (r) => {
      setResult(r);
      setWorkout(null);
      await invalidate([...ACTIVITY_KEYS, ['exercise-previous']]);
    },
    onError: (err) => setError(errorText(err)),
  });

  if (result) return <Summary result={result} />;
  if (!w) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: space.xl }}>
        <Stack.Screen options={{ title: 'Treino' }} />
        <Empty icon="play" title="Nenhum treino em andamento" message="Comece pela aba Treinar: escolha uma rotina ou faça um treino livre." action={{ label: 'Ir para Treinar', onPress: () => router.replace('/treinar') }} />
      </SafeAreaView>
    );
  }

  const sets = w.exercises.flatMap((e) => e.sets);
  const done = sets.filter((s) => s.done);
  const volume = done.reduce((a, s) => a + (parseInput(s.weight) ?? 0) * (parseInput(s.reps) ?? 0), 0);
  const minutes = Math.floor((now - Date.parse(w.startedAt)) / 60_000);

  const startRest = (ex: WorkoutExercise, setId: string) => setWorkout((x) => (x ? { ...x, rest: { endsAt: new Date(Date.now() + ex.restSec * 1000).toISOString(), total: ex.restSec, exerciseKey: ex.key, setId } } : x));

  const finish = async () => {
    setError(null);
    const pending = sets.length - done.length;
    if (!done.length && !(await confirm('Nenhuma série marcada', 'Salvar mesmo assim? O treino conta como atividade do dia, sem as cargas.', 'Salvar'))) return;
    if (done.length && pending && !(await confirm('Finalizar treino?', `${pending} ${pending === 1 ? 'série não marcada fica' : 'séries não marcadas ficam'} de fora.`, 'Finalizar'))) return;
    if (done.length && !pending && !(await confirm('Finalizar treino?', `${done.length} séries feitas em ${minutes} min.`, 'Finalizar'))) return;
    const bad = done.find((s) => (s.weight && parseInput(s.weight) == null) || (s.reps && parseInput(s.reps) == null));
    if (bad) return setError('Tem peso ou repetição inválida numa série marcada. Confira os números.');
    save.mutate({
      title: w.title,
      routineId: w.routineId,
      kind: w.kind,
      startedAt: w.startedAt,
      finishedAt: new Date().toISOString(),
      exercises: w.exercises
        .map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.sets
            .filter((s) => s.done)
            .map((s) => {
              const reps = parseInput(s.reps);
              return { weightKg: parseInput(s.weight), reps: reps == null ? null : Math.round(reps), restSec: s.restSec };
            }),
        }))
        .filter((e) => e.sets.length),
    });
  };

  const discard = async () => {
    if (await confirm('Descartar treino?', 'Nada deste treino será salvo.', 'Descartar')) {
      setWorkout(null);
      router.back();
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      {Platform.OS !== 'web' ? <KeepAwake /> : null}
      <Stack.Screen options={{ title: w.title, headerRight: () => <Button title="Finalizar" small onPress={() => void finish()} loading={save.isPending} testID="finish-workout" /> }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'} keyboardVerticalOffset={headerHeight}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center', paddingBottom: space.xxxl }} keyboardShouldPersistTaps="handled">
          <Card>
            <Row wrap gap={space.lg}>
              <View style={{ flex: 1, minWidth: 80 }}>
                <Text variant="caption" muted>
                  Tempo
                </Text>
                <Text variant="metric">{minutes} min</Text>
              </View>
              <View style={{ flex: 1, minWidth: 80 }}>
                <Text variant="caption" muted>
                  Séries
                </Text>
                <Text variant="metric">
                  {done.length}/{sets.length}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 80 }}>
                <Text variant="caption" muted>
                  Volume
                </Text>
                <Text variant="metric">{num(volume, 0)}</Text>
              </View>
            </Row>
            <ProgressBar value={sets.length ? done.length / sets.length : 0} label="Séries feitas" />
            <Text variant="small" faint>
              Digite o peso e as repetições e toque no ✓ ao terminar cada série: o descanso começa sozinho. "Anterior" mostra o que você fez da última vez.
            </Text>
          </Card>
          {w.exercises.map((ex) => (
            <ExerciseCard key={ex.key} ex={ex} prev={prevOf(ex.exerciseId)} onRest={startRest} />
          ))}
          {!w.exercises.length ? <Empty icon="plus-circle" title="Treino livre" message="Adicione os exercícios conforme for treinando." /> : null}
          <Button title="Adicionar exercício" icon="plus" kind="secondary" onPress={() => setAdding(true)} />
          {error ? <Text color={c.danger}>{error}</Text> : null}
          <Button title="Finalizar e salvar treino" icon="check" onPress={() => void finish()} loading={save.isPending} />
          <Button title="Descartar treino" kind="danger" small onPress={() => void discard()} />
        </ScrollView>
      </KeyboardAvoidingView>
      {w.rest ? <RestBar w={w} /> : null}
      <AddExercise visible={adding} onClose={() => setAdding(false)} />
    </SafeAreaView>
  );
}
