import { routineSchema } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExerciseSearch } from '@/components/exercises';
import { Button, Card, Cell, Field, IconButton, Loading, Row, Screen, Text } from '@/components/ui';
import { post, put } from '@/lib/api';
import { errorText } from '@/lib/format';
import { invalidate, useRoutine } from '@/lib/queries';
import type { Routine } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { CONTENT_MAX, space } from '@/theme/tokens';

interface Item {
  key: string;
  exerciseId: string;
  name: string;
  sets: string;
  reps: string;
  rest: string;
  notes: string;
}
let seq = 0;
const newKey = () => `i${++seq}`;

export default function EditRoutine() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useRoutine(id);
  const { c } = useTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    const r = existing.data;
    if (!id || !r || loaded) return;
    setName(r.name);
    setDescription(r.description ?? '');
    setItems((r.exercises ?? []).map((x) => ({ key: newKey(), exerciseId: x.id, name: x.namePt, sets: String(x.sets), reps: x.reps, rest: x.restSec ? String(x.restSec) : '', notes: x.notes ?? '' })));
    setLoaded(true);
  }, [existing.data, id, loaded]);

  const save = useMutation({
    mutationFn: (body: unknown) => (id ? put<Routine>(`/routines/${id}`, body) : post<Routine>('/routines', body)),
    onSuccess: async (r) => {
      await invalidate([['routines'], ['routine', r.id]]);
      router.replace(`/routines/${r.id}`);
    },
    onError: (err) => setError(errorText(err)),
  });

  const submit = () => {
    const parsed = routineSchema.safeParse({
      name: name.trim(),
      description: description.trim() || null,
      exercises: items.map((i) => ({ exerciseId: i.exerciseId, sets: Number(i.sets) || 0, reps: i.reps.trim(), restSec: i.rest ? Number(i.rest) : null, notes: i.notes.trim() || null })),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const idx = typeof issue.path[1] === 'number' ? issue.path[1] : null;
      return setError(idx != null ? `${items[idx]?.name}: confira séries (1–20), repetições e descanso (0–900 s)` : issue.message);
    }
    setError(null);
    save.mutate(parsed.data);
  };

  const update = (key: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const move = (index: number, dir: -1 | 1) =>
    setItems((list) => {
      const next = [...list];
      const j = index + dir;
      if (j < 0 || j >= next.length) return list;
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });

  if (id && !loaded) return <Loading />;
  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Editar rotina' : 'Nova rotina' }} />
      <Card>
        <Field label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Treino A — peito e tríceps" maxLength={60} />
        <Field label="Descrição (opcional)" value={description} onChangeText={setDescription} maxLength={500} />
      </Card>

      {items.map((it, i) => (
        <Card key={it.key}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>
              {i + 1}. {it.name}
            </Text>
            <Row gap={0}>
              <IconButton icon="arrow-up" label="Subir" size={16} onPress={() => move(i, -1)} />
              <IconButton icon="arrow-down" label="Descer" size={16} onPress={() => move(i, 1)} />
              <IconButton icon="trash-2" label="Remover" size={16} color={c.danger} onPress={() => setItems((l) => l.filter((x) => x.key !== it.key))} />
            </Row>
          </Row>
          <Row wrap gap={space.sm} style={{ alignItems: 'flex-start' }}>
            <Cell><Field label="Séries" value={it.sets} onChangeText={(v) => update(it.key, { sets: v.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={2} /></Cell>
            <Cell><Field label="Repetições" value={it.reps} onChangeText={(v) => update(it.key, { reps: v })} placeholder="10 ou 8-12" maxLength={20} /></Cell>
            <Cell><Field label="Descanso (s)" value={it.rest} onChangeText={(v) => update(it.key, { rest: v.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={3} /></Cell>
          </Row>
          <Field label="Observação" value={it.notes} onChangeText={(v) => update(it.key, { notes: v })} maxLength={200} placeholder="Ex.: cadência lenta na descida" />
        </Card>
      ))}

      <Button title="Adicionar exercício" icon="plus" kind="secondary" onPress={() => setPicking(true)} />
      {error ? <Text color={c.danger}>{error}</Text> : null}
      <Button title="Salvar rotina" icon="check" onPress={submit} loading={save.isPending} />

      <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={{ flex: 1, width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center', padding: space.lg, gap: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="title">Adicionar exercício</Text>
              <Button title="Pronto" small onPress={() => setPicking(false)} />
            </Row>
            <ExerciseSearch
              selectedIds={items.map((i) => i.exerciseId)}
              onSelect={(e) => setItems((l) => [...l, { key: newKey(), exerciseId: e.id, name: e.namePt, sets: '3', reps: '10', rest: '90', notes: '' }])}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}
