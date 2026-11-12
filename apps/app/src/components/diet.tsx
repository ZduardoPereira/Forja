import { ageOn, type Food, FOODS, macrosFor, type Macros, nutritionTargets, searchFoods, sumMacros } from '@forja/shared';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { num, today } from '@/lib/format';
import { useBody } from '@/lib/queries';
import type { DietFood, DietMeal, DietPlan } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { CONTENT_MAX, space } from '@/theme/tokens';
import { parseNum } from './forms';
import { Button, Card, Cell, Chip, Divider, Field, IconButton, ListItem, ProgressBar, Row, Segmented, Text } from './ui';

export const mealTotals = (m: Pick<DietMeal, 'foods'>): Macros => sumMacros(m.foods ?? []);
export const planTotals = (meals: Pick<DietMeal, 'foods'>[]): Macros => sumMacros(meals.map(mealTotals));

/** Meta do dia: a do plano (nutricionista) ou a estimativa pelo perfil e pelo peso. */
export function useDietTarget(plan: DietPlan | null): { target: Macros | null; source: 'plan' | 'estimate' | null; missing: string[] } {
  const { me } = useAuth();
  const body = useBody();
  if (plan?.caloriesKcal) {
    return { target: { kcal: plan.caloriesKcal, proteinG: plan.proteinG ?? 0, carbsG: plan.carbsG ?? 0, fatG: plan.fatG ?? 0 }, source: 'plan', missing: [] };
  }
  if (!me) return { target: null, source: null, missing: [] };
  const t = nutritionTargets({
    goal: me.goal,
    sex: me.sex,
    weightKg: body.data?.latest?.weight?.weightKg ?? null,
    heightCm: me.heightCm,
    ageYears: me.birthDate ? ageOn(me.birthDate, today()) : null,
    leanMassKg: body.data?.latest?.composition?.leanMassKg ?? null,
    activity: me.activityLevel,
  });
  if ('missing' in t) return { target: null, source: null, missing: t.missing };
  return { target: { kcal: t.targetKcal, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG }, source: 'estimate', missing: [] };
}

/** Barras: quanto do dia o plano cobre (calorias e macros). */
export function MacroTargets({ total, target }: { total: Macros; target: Macros | null }) {
  const { c } = useTheme();
  const rows: [string, number, number | null, string, string][] = [
    ['Calorias', total.kcal, target?.kcal ?? null, 'kcal', c.accent],
    ['Proteína', total.proteinG, target?.proteinG ?? null, 'g', c.chart2],
    ['Carboidrato', total.carbsG, target?.carbsG ?? null, 'g', c.warning],
    ['Gordura', total.fatG, target?.fatG ?? null, 'g', c.danger],
  ];
  return (
    <View style={{ gap: space.md }}>
      {rows.map(([label, value, goal, unit, color]) => {
        const over = goal ? value > goal * 1.1 : false;
        return (
          <View key={label} style={{ gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="bodyStrong">{label}</Text>
              <Text variant="small" color={over ? c.danger : c.textMuted}>
                {num(value, 0)}
                {goal ? ` / ${num(goal, 0)}` : ''} {unit}
              </Text>
            </Row>
            <ProgressBar value={goal ? value / goal : 0} color={over ? c.danger : color} label={`${label}: ${num(value, 0)} de ${goal ? num(goal, 0) : '?'} ${unit}`} />
          </View>
        );
      })}
    </View>
  );
}

const macroLine = (m: { [K in keyof Macros]?: number | null }) => `P ${num(m.proteinG ?? 0, 0)} · C ${num(m.carbsG ?? 0, 0)} · G ${num(m.fatG ?? 0, 0)}`;

/** Uma refeição com os alimentos e o total. */
export function MealCard({ meal, onPress }: { meal: DietMeal; onPress?: () => void }) {
  const { c } = useTheme();
  const t = mealTotals(meal);
  const foods = meal.foods ?? [];
  return (
    <Card onPress={onPress} label={meal.name}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={space.sm}>
          <Text variant="heading">{meal.name}</Text>
          {meal.time ? (
            <Text variant="small" faint>
              {meal.time}
            </Text>
          ) : null}
        </Row>
        {foods.length ? (
          <Text variant="bodyStrong" color={c.accent}>
            {num(t.kcal, 0)} kcal
          </Text>
        ) : null}
      </Row>
      {foods.map((f, i) => (
        <View key={i}>
          {i ? <Divider /> : null}
          <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }} gap={space.md}>
            <View style={{ flex: 1 }}>
              <Text>{f.name}</Text>
              <Text variant="small" faint>
                {[f.amount || (f.grams ? `${num(f.grams, 0)} g` : null), f.proteinG != null || f.carbsG != null || f.fatG != null ? macroLine(f) : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {f.kcal != null ? (
              <Text variant="small" muted>
                {num(f.kcal, 0)} kcal
              </Text>
            ) : null}
          </Row>
        </View>
      ))}
      {meal.items ? (
        <Text variant="small" muted>
          {meal.items}
        </Text>
      ) : null}
      {foods.length ? (
        <Text variant="small" faint>
          Total: {macroLine(t)} g
        </Text>
      ) : null}
      {meal.notes ? (
        <Text variant="small" faint>
          {meal.notes}
        </Text>
      ) : null}
    </Card>
  );
}

/** Escolher um alimento da lista (com a quantidade) ou cadastrar um à mão. */
export function FoodPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (f: DietFood) => void }) {
  const { c } = useTheme();
  const [mode, setMode] = useState<'list' | 'manual'>('list');
  const [q, setQ] = useState('');
  const [food, setFood] = useState<Food | null>(null);
  const [grams, setGrams] = useState('');
  const [manual, setManual] = useState({ name: '', amount: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) {
      setQ('');
      setFood(null);
      setGrams('');
      setError(null);
      setManual({ name: '', amount: '', kcal: '', protein: '', carbs: '', fat: '' });
    }
  }, [visible]);
  const results = searchFoods(q, 20);
  const g = parseNum(grams);
  const preview = food && g != null && !Number.isNaN(g) && g > 0 ? macrosFor(food, g) : null;
  const unit = food?.ml ? 'ml' : 'g';

  const addFromList = () => {
    if (!food || !preview || g == null) return setError(`Informe a quantidade em ${unit}.`);
    const portion = food.portion && Math.abs(food.portion.grams - g) < 0.01 ? food.portion.label : null;
    onPick({ name: food.name, foodId: food.id, grams: g, amount: portion ? `${portion} (${num(g, 0)} ${unit})` : `${num(g, 0)} ${unit}`, ...preview });
    onClose();
  };
  const addManual = () => {
    const n = (v: string) => (v.trim() ? parseNum(v) : null);
    const vals = { kcal: n(manual.kcal), proteinG: n(manual.protein), carbsG: n(manual.carbs), fatG: n(manual.fat) };
    if (!manual.name.trim()) return setError('Escreva o nome do alimento.');
    if (Object.values(vals).some((v) => v != null && Number.isNaN(v))) return setError('Use só números nas calorias e nos macros.');
    onPick({ name: manual.name.trim(), amount: manual.amount.trim() || null, foodId: null, grams: null, ...vals });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg, width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="title">Adicionar alimento</Text>
            <IconButton icon="x" label="Fechar" onPress={onClose} />
          </Row>
          <Segmented
            options={[
              { value: 'list', label: 'Da lista' },
              { value: 'manual', label: 'Escrever à mão' },
            ]}
            value={mode}
            onChange={(v) => {
              setMode(v);
              setError(null);
            }}
          />
          {mode === 'list' ? (
            food ? (
              <Card>
                <Text variant="heading">{food.name}</Text>
                <Text variant="small" faint>
                  Em 100 {unit}: {num(food.kcal, 0)} kcal · {macroLine(food)} g
                </Text>
                <Row wrap>
                  {food.portion ? <Chip label={`${food.portion.label} (${food.portion.grams} ${unit})`} selected={g === food.portion.grams} onPress={() => setGrams(String(food.portion!.grams))} /> : null}
                  {food.portion ? <Chip label={`2× (${food.portion.grams * 2} ${unit})`} selected={g === food.portion.grams * 2} onPress={() => setGrams(String(food.portion!.grams * 2))} /> : null}
                  <Chip label={`100 ${unit}`} selected={g === 100} onPress={() => setGrams('100')} />
                </Row>
                <Field label={`Quantidade (${unit})`} value={grams} onChangeText={setGrams} keyboardType="decimal-pad" placeholder="Ex.: 150" autoFocus />
                {preview ? (
                  <Text variant="bodyStrong" color={c.accent}>
                    {num(preview.kcal, 0)} kcal · {macroLine(preview)} g
                  </Text>
                ) : null}
                {error ? <Text color={c.danger}>{error}</Text> : null}
                <Row gap={space.sm}>
                  <Button title="Adicionar" icon="check" onPress={addFromList} style={{ flex: 1 }} />
                  <Button title="Voltar" kind="ghost" onPress={() => setFood(null)} />
                </Row>
              </Card>
            ) : (
              <>
                <Field label="Buscar alimento" value={q} onChangeText={setQ} placeholder="Ex.: arroz, frango, banana, whey" autoFocus />
                {q.trim() && !results.length ? (
                  <Text muted>
                    Não achei "{q}". Use "Escrever à mão" para cadastrar com os números do rótulo.
                  </Text>
                ) : null}
                <Card padded={false} style={{ paddingHorizontal: space.lg }}>
                  {(q.trim() ? results : []).map((x, i) => (
                    <View key={x.id}>
                      {i ? <Divider /> : null}
                      <ListItem
                        title={x.name}
                        subtitle={`${num(x.kcal, 0)} kcal em 100 ${x.ml ? 'ml' : 'g'}${x.portion ? ` · ${x.portion.label} ≈ ${num((x.kcal * x.portion.grams) / 100, 0)} kcal` : ''}`}
                        onPress={() => {
                          setFood(x);
                          setGrams(x.portion ? String(x.portion.grams) : '100');
                          setError(null);
                        }}
                      />
                    </View>
                  ))}
                  {!q.trim() ? (
                    <Text muted style={{ paddingVertical: space.lg }}>
                      Digite para buscar entre {FOOD_COUNT} alimentos comuns (valores aproximados da tabela TACO).
                    </Text>
                  ) : null}
                </Card>
              </>
            )
          ) : (
            <Card>
              <Field label="Alimento" value={manual.name} onChangeText={(v) => setManual({ ...manual, name: v })} placeholder="Ex.: Pão integral da padaria" maxLength={80} />
              <Field label="Quantidade (opcional)" value={manual.amount} onChangeText={(v) => setManual({ ...manual, amount: v })} placeholder="Ex.: 2 fatias, 1 pote" maxLength={40} />
              <Row wrap gap={space.md}>
                <Cell basis={110}>
                  <Field label="Calorias (kcal)" value={manual.kcal} onChangeText={(v) => setManual({ ...manual, kcal: v })} keyboardType="decimal-pad" />
                </Cell>
                <Cell basis={110}>
                  <Field label="Proteína (g)" value={manual.protein} onChangeText={(v) => setManual({ ...manual, protein: v })} keyboardType="decimal-pad" />
                </Cell>
                <Cell basis={110}>
                  <Field label="Carbo (g)" value={manual.carbs} onChangeText={(v) => setManual({ ...manual, carbs: v })} keyboardType="decimal-pad" />
                </Cell>
                <Cell basis={110}>
                  <Field label="Gordura (g)" value={manual.fat} onChangeText={(v) => setManual({ ...manual, fat: v })} keyboardType="decimal-pad" />
                </Cell>
              </Row>
              <Text variant="small" faint>
                Os números são opcionais: sem eles o alimento entra no plano, mas não soma nas calorias.
              </Text>
              {error ? <Text color={c.danger}>{error}</Text> : null}
              <Button title="Adicionar" icon="check" onPress={addManual} />
            </Card>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const FOOD_COUNT = FOODS.length;
