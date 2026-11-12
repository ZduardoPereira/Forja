import { dietPlanSchema, MEAL_PRESETS } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { FoodPicker, MacroTargets, mealTotals, planTotals, useDietTarget } from '@/components/diet';
import { confirm, DateField, numText, parseNum, PhotoPicker } from '@/components/forms';
import { Button, Card, Cell, Chip, Divider, Field, IconButton, Loading, Row, Screen, Section, Segmented, Text } from '@/components/ui';
import { del, post, put } from '@/lib/api';
import { errorText, num, today } from '@/lib/format';
import { invalidate, useDiet } from '@/lib/queries';
import type { DietFood, FileRef } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

interface MealDraft {
  key: string;
  name: string;
  time: string;
  foods: DietFood[];
  items: string;
  notes: string;
}
let seq = 0;
const mk = (name = '', time = ''): MealDraft => ({ key: `m${++seq}`, name, time, foods: [], items: '', notes: '' });
const DEFAULT_MEALS = () => [mk('Café da manhã', '07:00'), mk('Almoço', '12:30'), mk('Lanche da tarde', '16:00'), mk('Jantar', '20:00')];

function MealEditor({ meal, onChange, onRemove, onAddFood }: { meal: MealDraft; onChange: (p: Partial<MealDraft>) => void; onRemove: () => void; onAddFood: () => void }) {
  const { c } = useTheme();
  const t = mealTotals(meal);
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text variant="heading" style={{ flex: 1 }}>
          {meal.name || 'Refeição'}
          {meal.foods.length ? <Text color={c.accent}> · {num(t.kcal, 0)} kcal</Text> : null}
        </Text>
        <IconButton icon="trash-2" size={16} label={`Tirar ${meal.name || 'refeição'}`} onPress={onRemove} />
      </Row>
      <Row wrap gap={space.md}>
        <Cell basis={180}>
          <Field label="Nome" value={meal.name} onChangeText={(v) => onChange({ name: v })} placeholder="Ex.: Almoço" maxLength={60} />
        </Cell>
        <Cell basis={100}>
          <Field label="Horário" value={meal.time} onChangeText={(v) => onChange({ time: v })} placeholder="12:30" maxLength={10} />
        </Cell>
      </Row>
      {meal.foods.length ? (
        <View>
          {meal.foods.map((f, i) => (
            <View key={i}>
              {i ? <Divider /> : null}
              <Row gap={space.sm} style={{ paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text>{f.name}</Text>
                  <Text variant="small" faint>
                    {[f.amount, f.kcal != null ? `${num(f.kcal, 0)} kcal` : null, f.proteinG != null ? `P ${num(f.proteinG, 0)} g` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <IconButton icon="x" size={16} label={`Tirar ${f.name}`} onPress={() => onChange({ foods: meal.foods.filter((_, j) => j !== i) })} />
              </Row>
            </View>
          ))}
        </View>
      ) : (
        <Text variant="small" faint>
          Nenhum alimento ainda.
        </Text>
      )}
      <Button title="Adicionar alimento" icon="plus" small kind="secondary" onPress={onAddFood} />
      <Field label="Opções e observações (opcional)" value={meal.items} onChangeText={(v) => onChange({ items: v })} placeholder="Ex.: pode trocar o arroz por 1 batata-doce média" multiline maxLength={2000} />
    </Card>
  );
}

export default function EditDiet() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const diet = useDiet();
  const { c } = useTheme();
  const estimate = useDietTarget(null);
  const [title, setTitle] = useState('Minha dieta');
  const [professional, setProfessional] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [active, setActive] = useState<'yes' | 'no'>('yes');
  const [meals, setMeals] = useState<MealDraft[]>(DEFAULT_MEALS);
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<FileRef[]>([]);
  const [picking, setPicking] = useState<string | null>(null);
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
    setMeals(p.meals.map((m) => ({ key: `m${++seq}`, name: m.name, time: m.time ?? '', foods: m.foods ?? [], items: m.items ?? '', notes: m.notes ?? '' })));
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

  const target = (() => {
    const k = parseNum(kcal);
    return k && !Number.isNaN(k) ? { kcal: k, proteinG: parseNum(protein) ?? 0, carbsG: parseNum(carbs) ?? 0, fatG: parseNum(fat) ?? 0 } : estimate.target;
  })();

  const submit = () => {
    const nums = { caloriesKcal: parseNum(kcal), proteinG: parseNum(protein), carbsG: parseNum(carbs), fatG: parseNum(fat) };
    if (Object.values(nums).some((n) => Number.isNaN(n))) return setError('Confira os números da meta (use só números).');
    const parsed = dietPlanSchema.safeParse({
      title: title.trim(),
      professional: professional.trim() || null,
      startDate,
      ...nums,
      notes: notes.trim() || null,
      active: active === 'yes',
      // Refeição sem nenhum alimento e sem texto fica de fora.
      meals: meals
        .filter((m) => m.name.trim() && (m.foods.length || m.items.trim()))
        .map((m) => ({ name: m.name.trim(), time: m.time.trim() || null, foods: m.foods, items: m.items.trim(), notes: m.notes.trim() || null })),
      fileIds: files.map((f) => f.id),
    });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setError(null);
    save.mutate(parsed.data);
  };

  const setMeal = (key: string, patch: Partial<MealDraft>) => setMeals((l) => l.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const unused = MEAL_PRESETS.filter((p) => !meals.some((m) => m.name.trim().toLowerCase() === p.name.toLowerCase()));
  if (id && !loaded) return <Loading />;

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Editar dieta' : 'Montar dieta' }} />
      <Text muted>Monte refeição por refeição: busque o alimento, diga a quantidade e o app soma as calorias e os macros. Tem o plano do nutricionista? Copie as refeições e anexe a foto no fim.</Text>

      <Section title="1. Meta do dia">
        <Card>
          <Row wrap gap={space.md}>
            <Cell basis={110}>
              <Field label="Calorias (kcal)" value={kcal} onChangeText={setKcal} keyboardType="decimal-pad" placeholder={estimate.target ? num(estimate.target.kcal, 0) : 'Ex.: 2200'} />
            </Cell>
            <Cell basis={110}>
              <Field label="Proteína (g)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" placeholder={estimate.target ? num(estimate.target.proteinG, 0) : ''} />
            </Cell>
            <Cell basis={110}>
              <Field label="Carboidrato (g)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" placeholder={estimate.target ? num(estimate.target.carbsG, 0) : ''} />
            </Cell>
            <Cell basis={110}>
              <Field label="Gordura (g)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" placeholder={estimate.target ? num(estimate.target.fatG, 0) : ''} />
            </Cell>
          </Row>
          {estimate.target ? (
            <Button
              title="Usar a estimativa do meu perfil"
              icon="zap"
              small
              kind="ghost"
              onPress={() => {
                setKcal(String(Math.round(estimate.target!.kcal)));
                setProtein(String(Math.round(estimate.target!.proteinG)));
                setCarbs(String(Math.round(estimate.target!.carbsG)));
                setFat(String(Math.round(estimate.target!.fatG)));
              }}
            />
          ) : (
            <Text variant="small" faint>
              Para o app sugerir a meta, complete no perfil: {estimate.missing.join(', ') || 'peso, altura, idade e sexo'}.
            </Text>
          )}
          <Text variant="small" faint>
            Se o nutricionista passou a meta, use a dele. Em branco, vale a estimativa do perfil.
          </Text>
        </Card>
      </Section>

      <Section title="2. Refeições">
        {meals.map((m) => (
          <MealEditor
            key={m.key}
            meal={m}
            onChange={(p) => setMeal(m.key, p)}
            onAddFood={() => setPicking(m.key)}
            onRemove={async () => {
              if (!m.foods.length && !m.items.trim()) return setMeals((l) => l.filter((x) => x.key !== m.key));
              if (await confirm(`Tirar ${m.name || 'a refeição'}?`, 'Os alimentos dela saem do plano.', 'Tirar')) setMeals((l) => l.filter((x) => x.key !== m.key));
            }}
          />
        ))}
        <Card>
          <Text variant="small" muted>
            Adicionar refeição
          </Text>
          <Row wrap>
            {unused.map((p) => (
              <Chip key={p.name} label={p.name} icon="plus" onPress={() => setMeals((l) => [...l, mk(p.name, p.time)])} />
            ))}
            <Chip label="Outra" icon="plus" onPress={() => setMeals((l) => [...l, mk()])} />
          </Row>
        </Card>
      </Section>

      <Section title="3. Total do dia × meta">
        <Card>
          <MacroTargets total={planTotals(meals)} target={target} />
          {!target ? (
            <Text variant="small" faint>
              Sem meta: preencha a parte 1 para comparar.
            </Text>
          ) : null}
        </Card>
      </Section>

      <Section title="Detalhes">
        <Card>
          <Field label="Nome do plano" value={title} onChangeText={setTitle} maxLength={80} />
          <Field label="Nutricionista (opcional)" value={professional} onChangeText={setProfessional} maxLength={80} />
          <DateField label="Começou em" value={startDate} onChange={setStartDate} />
          <Segmented
            options={[
              { value: 'yes', label: 'Plano atual' },
              { value: 'no', label: 'Plano antigo' },
            ]}
            value={active}
            onChange={setActive}
          />
          <Field label="Observações gerais (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={4000} placeholder="Ex.: 3 L de água por dia; livre no sábado à noite" />
        </Card>
        <Card>
          <PhotoPicker kind="diet" files={files} onChange={setFiles} max={8} label="Fotos do plano do nutricionista (só você vê)" />
        </Card>
      </Section>

      {error ? <Text color={c.danger}>{error}</Text> : null}
      <Button title="Salvar dieta" icon="check" onPress={submit} loading={save.isPending} />
      {id ? (
        <Button
          title="Apagar plano"
          kind="danger"
          small
          loading={remove.isPending}
          onPress={async () => {
            if (await confirm('Apagar plano?', 'O plano e as fotos dele serão apagados.', 'Apagar')) remove.mutate();
          }}
        />
      ) : null}
      <FoodPicker
        visible={!!picking}
        onClose={() => setPicking(null)}
        onPick={(f) => {
          const key = picking;
          if (key) setMeals((l) => l.map((m) => (m.key === key ? { ...m, foods: [...m.foods, f] } : m)));
        }}
      />
    </Screen>
  );
}
