import { addDays, competitionSchema, type Goal, GOAL_HINTS, GOAL_LABELS, GOALS } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { DateField } from '@/components/forms';
import { Button, Card, Cell, Chip, ChipGroup, Field, Loading, Row, Screen, Section, Text } from '@/components/ui';
import { post, put } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorText, today } from '@/lib/format';
import { invalidate, useCompetition } from '@/lib/queries';
import type { CompetitionBoard } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const PRESETS = [
  { key: 'balanced', label: 'Equilibrado', w: { body: 50, performance: 30, consistency: 20 } },
  { key: 'body', label: 'Foco no corpo', w: { body: 70, performance: 15, consistency: 15 } },
  { key: 'tests', label: 'Foco nos testes', w: { body: 30, performance: 50, consistency: 20 } },
  { key: 'habit', label: 'Foco em constância', w: { body: 40, performance: 20, consistency: 40 } },
] as const;
const WEEKS = [4, 8, 12, 16];

export default function NewCompetition() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useCompetition(id);
  const { me } = useAuth();
  const { c } = useTheme();
  const [name, setName] = useState('');
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(addDays(today(), 12 * 7));
  const [goal, setGoal] = useState<Goal>(me?.goal ?? 'lose_fat');
  const [weights, setWeights] = useState({ body: '50', performance: '30', consistency: '20' });
  const [target, setTarget] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    const b = existing.data;
    if (!id || !b || loaded) return;
    setName(b.name);
    setStart(b.startDate);
    setEnd(b.endDate);
    setWeights({ body: String(b.weightBody), performance: String(b.weightPerformance), consistency: String(b.weightConsistency) });
    setTarget(b.consistencyTarget);
    setLoaded(true);
  }, [existing.data, id, loaded]);

  const save = useMutation({
    mutationFn: (body: unknown) => (id ? put<CompetitionBoard>(`/competitions/${id}`, body) : post<CompetitionBoard>('/competitions', body)),
    onSuccess: async (b) => {
      await invalidate([['competitions'], ['competition'], ['home']]);
      if (id) router.back();
      else router.replace(`/competitions/${b.id}`);
    },
    onError: (err) => setError(errorText(err)),
  });

  const submit = () => {
    const w = { body: Number(weights.body) || 0, performance: Number(weights.performance) || 0, consistency: Number(weights.consistency) || 0 };
    const parsed = competitionSchema.safeParse({ name: name.trim(), startDate: start, endDate: end, weights: w, consistencyTargetPerWeek: target, goal: id ? undefined : goal });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setError(null);
    save.mutate(parsed.data);
  };

  if (id && !loaded) return <Loading />;
  const sum = (Number(weights.body) || 0) + (Number(weights.performance) || 0) + (Number(weights.consistency) || 0);
  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Editar competição' : 'Nova competição' }} />
      <Card>
        <Field label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Projeto Verão 2027" maxLength={60} />
        <DateField label="Início" value={start} onChange={setStart} quick={false} />
        <View style={{ gap: space.sm }}>
          <Text variant="small" muted>
            Duração
          </Text>
          <Row wrap>
            {WEEKS.map((wk) => (
              <Chip key={wk} label={`${wk} semanas`} selected={end === addDays(start, wk * 7)} onPress={() => setEnd(addDays(start, wk * 7))} />
            ))}
          </Row>
        </View>
        <DateField label="Fim" value={end} onChange={setEnd} quick={false} />
      </Card>

      {!id ? (
        <Section title="Seu objetivo nesta competição">
          <Card>
            <ChipGroup options={GOALS.map((g) => ({ value: g, label: GOAL_LABELS[g] }))} value={goal} onChange={setGoal} />
            <Text variant="small" muted>
              {GOAL_HINTS[goal]}
            </Text>
            <Text variant="small" faint>
              Cada amigo escolhe o próprio objetivo ao entrar. Dá para trocar até 7 dias depois do início.
            </Text>
          </Card>
        </Section>
      ) : null}

      <Section title="Peso de cada parte na nota">
        <Card>
          <Row wrap>
            {PRESETS.map((p) => (
              <Chip
                key={p.key}
                label={p.label}
                selected={Number(weights.body) === p.w.body && Number(weights.performance) === p.w.performance && Number(weights.consistency) === p.w.consistency}
                onPress={() => setWeights({ body: String(p.w.body), performance: String(p.w.performance), consistency: String(p.w.consistency) })}
              />
            ))}
          </Row>
          <Row wrap gap={space.md} style={{ alignItems: 'flex-start' }}>
            <Cell><Field label="Corpo" value={weights.body} onChangeText={(v) => setWeights((s) => ({ ...s, body: v.replace(/\D/g, '') }))} keyboardType="number-pad" maxLength={3} /></Cell>
            <Cell><Field label="Testes" value={weights.performance} onChangeText={(v) => setWeights((s) => ({ ...s, performance: v.replace(/\D/g, '') }))} keyboardType="number-pad" maxLength={3} /></Cell>
            <Cell><Field label="Constância" value={weights.consistency} onChangeText={(v) => setWeights((s) => ({ ...s, consistency: v.replace(/\D/g, '') }))} keyboardType="number-pad" maxLength={3} /></Cell>
          </Row>
          <Text variant="small" faint>
            Os pesos são proporcionais (somam {sum}); a nota final vai de 0 a 100.
          </Text>
        </Card>
      </Section>

      <Section title="Meta de constância">
        <Card>
          <Row wrap>
            {[2, 3, 4, 5, 6].map((n) => (
              <Chip key={n} label={`${n}× por semana`} selected={target === n} onPress={() => setTarget(n)} />
            ))}
          </Row>
        </Card>
      </Section>

      {error ? <Text color={c.danger}>{error}</Text> : null}
      <Button title={id ? 'Salvar' : 'Criar competição'} icon="check" onPress={submit} loading={save.isPending} />
      {!id ? (
        <Text variant="small" faint style={{ textAlign: 'center' }}>
          Importante: registre peso (e, se possível, uma avaliação de composição) e faça os testes até 14 dias depois do início — essa é a sua linha de base.
        </Text>
      ) : null}
    </Screen>
  );
}
