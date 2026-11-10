import { dietPlanSchema } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { confirm, DateField, numText, parseNum, PhotoPicker } from '@/components/forms';
import { Button, Card, Cell, Field, IconButton, Loading, Row, Screen, Section, Segmented, Text } from '@/components/ui';
import { del, post, put } from '@/lib/api';
import { errorText, today } from '@/lib/format';
import { invalidate, useDiet } from '@/lib/queries';
import type { FileRef } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

interface Meal {
  key: string;
  name: string;
  time: string;
  items: string;
  notes: string;
}
let seq = 0;
const mk = (name = '', time = ''): Meal => ({ key: `m${++seq}`, name, time, items: '', notes: '' });
const DEFAULT_MEALS = () => [mk('Café da manhã', '07:00'), mk('Almoço', '12:30'), mk('Lanche', '16:00'), mk('Jantar', '20:00')];

export default function EditDiet() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const diet = useDiet();
  const { c } = useTheme();
  const [title, setTitle] = useState('');
  const [professional, setProfessional] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [active, setActive] = useState<'yes' | 'no'>('yes');
  const [meals, setMeals] = useState<Meal[]>(DEFAULT_MEALS);
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<FileRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    if (!id || loaded || !diet.data) return;
    const p = diet.data.find((x) => x.id === id);
    if (!p) return;
    setTitle(p.title);
    setProfessional(p.professional ?? '');
    setStartDate(p.startDate ?? today());
    setKcal(numText(p.caloriesKcal));
    setProtein(numText(p.proteinG));
    setCarbs(numText(p.carbsG));
    setFat(numText(p.fatG));
    setActive(p.active ? 'yes' : 'no');
    setMeals(p.meals.map((m) => ({ key: `m${++seq}`, name: m.name, time: m.time ?? '', items: m.items, notes: m.notes ?? '' })));
    setNotes(p.notes ?? '');
    setFiles(p.attachments.map((a) => a.file));
    setLoaded(true);
  }, [id, loaded, diet.data]);

  const save = useMutation({
    mutationFn: (b: unknown) => (id ? put(`/diet/${id}`, b) : post('/diet', b)),
    onSuccess: async () => {
      await invalidate([['diet']]);
      router.back();
    },
    onError: (err) => setError(errorText(err)),
  });
  const remove = useMutation({
    mutationFn: () => del(`/diet/${id}`),
    onSuccess: async () => {
      await invalidate([['diet']]);
      router.back();
    },
  });

  const submit = () => {
    const nums = { caloriesKcal: parseNum(kcal), proteinG: parseNum(protein), carbsG: parseNum(carbs), fatG: parseNum(fat) };
    if (Object.values(nums).some((n) => Number.isNaN(n))) return setError('Confira os números das metas (use só números).');
    const parsed = dietPlanSchema.safeParse({
      title: title.trim(),
      professional: professional.trim() || null,
      startDate,
      ...nums,
      notes: notes.trim() || null,
      active: active === 'yes',
      meals: meals.filter((m) => m.name.trim() && m.items.trim()).map((m) => ({ name: m.name.trim(), time: m.time.trim() || null, items: m.items.trim(), notes: m.notes.trim() || null })),
      fileIds: files.map((f) => f.id),
    });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setError(null);
    save.mutate(parsed.data);
  };

  const setMeal = (key: string, patch: Partial<Meal>) => setMeals((l) => l.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  if (id && !loaded) return <Loading />;
  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Editar plano' : 'Novo plano alimentar' }} />
      <Card>
        <Field label="Nome do plano" value={title} onChangeText={setTitle} placeholder="Ex.: Cutting — novembro" maxLength={80} />
        <Field label="Nutricionista (opcional)" value={professional} onChangeText={setProfessional} maxLength={80} />
        <DateField label="Início" value={startDate} onChange={setStartDate} quick={false} />
        <Segmented
          options={[
            { value: 'yes', label: 'Plano atual' },
            { value: 'no', label: 'Arquivado' },
          ]}
          value={active}
          onChange={setActive}
        />
      </Card>
      <Section title="Metas diárias (opcional)">
        <Card>
          <Row wrap gap={space.md} style={{ alignItems: 'flex-start' }}>
            <Cell><Field label="Calorias (kcal)" value={kcal} onChangeText={setKcal} keyboardType="number-pad" /></Cell>
            <Cell><Field label="Proteína (g)" value={protein} onChangeText={setProtein} keyboardType="number-pad" /></Cell>
            <Cell><Field label="Carboidrato (g)" value={carbs} onChangeText={setCarbs} keyboardType="number-pad" /></Cell>
            <Cell><Field label="Gordura (g)" value={fat} onChangeText={setFat} keyboardType="number-pad" /></Cell>
          </Row>
        </Card>
      </Section>
      <Section title="Refeições">
        {meals.map((m) => (
          <Card key={m.key}>
            <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 2 }}>
                <Field label="Refeição" value={m.name} onChangeText={(v) => setMeal(m.key, { name: v })} maxLength={60} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Horário" value={m.time} onChangeText={(v) => setMeal(m.key, { time: v })} placeholder="07:00" maxLength={10} />
              </View>
              <View style={{ paddingTop: 24 }}>
                <IconButton icon="trash-2" label="Remover refeição" size={16} color={c.danger} onPress={() => setMeals((l) => l.filter((x) => x.key !== m.key))} />
              </View>
            </Row>
            <Field label="O que comer" value={m.items} onChangeText={(v) => setMeal(m.key, { items: v })} multiline placeholder="Ex.: 2 ovos, 2 fatias de pão integral, 1 banana" maxLength={2000} style={{ minHeight: 70, textAlignVertical: 'top' }} />
            <Field label="Substituições / observações" value={m.notes} onChangeText={(v) => setMeal(m.key, { notes: v })} maxLength={500} />
          </Card>
        ))}
        <Button title="Adicionar refeição" icon="plus" kind="secondary" onPress={() => setMeals((l) => [...l, mk()])} disabled={meals.length >= 12} />
      </Section>
      <Card>
        <Field label="Observações gerais" value={notes} onChangeText={setNotes} multiline maxLength={4000} style={{ minHeight: 80, textAlignVertical: 'top' }} />
        <PhotoPicker kind="diet" files={files} onChange={setFiles} max={8} label="Fotos do plano impresso / PDF (só você vê)" />
      </Card>
      {error ? <Text color={c.danger}>{error}</Text> : null}
      <Button title="Salvar plano" icon="check" onPress={submit} loading={save.isPending} />
      {id ? (
        <Button
          title="Apagar plano"
          kind="danger"
          loading={remove.isPending}
          onPress={async () => {
            if (await confirm('Apagar plano?', title, 'Apagar')) remove.mutate();
          }}
        />
      ) : null}
    </Screen>
  );
}
