import {
  ACTIVITY_LEVEL_LABELS,
  addDays,
  ageOn,
  ASSESSMENT_METHOD_LABELS,
  type AssessmentMethod,
  bmiLabel,
  type Goal,
  GOAL_LABELS,
  nutritionTargets,
  TEST_BY_ID,
  TEST_GROUP_LABELS,
  TEST_GROUPS,
} from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';
import { del } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, num, testValue, today } from '@/lib/format';
import { BODY_KEYS, invalidate, useBests, useBody, useDiet, useRadar, useStravaStatus } from '@/lib/queries';
import type { Assessment, DietPlan, FileRef } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { font, space } from '@/theme/tokens';
import { LineChart } from './charts/LineChart';
import { RadarChart, radarOverall } from './charts/RadarChart';
import { confirm } from './forms';
import { PhotoGrid } from './photos';
import { Avatar, Badge, Button, Card, Chip, Divider, Empty, ErrorBox, IconButton, ListItem, Loading, Row, Section, Segmented, Stat, Text } from './ui';

export function ProfileHeader({ name, avatar, goal, subtitle, right, online }: { name: string; avatar: FileRef | null; goal: Goal; subtitle?: string | null; right?: ReactNode; online?: boolean }) {
  return (
    <Row gap={space.lg}>
      <Avatar name={name} file={avatar} size={64} online={online} />
      <View style={{ flex: 1, gap: 6 }}>
        <Text variant="display" numberOfLines={1}>
          {name}
        </Text>
        <Row gap={space.sm} wrap>
          <Badge label={GOAL_LABELS[goal]} tone="accent" />
          {subtitle ? (
            <Text variant="small" muted>
              {subtitle}
            </Text>
          ) : null}
        </Row>
      </View>
      {right}
    </Row>
  );
}

/** Radar 0–20 com comparação opcional com um amigo. */
export function RadarCard({ userId, name, compareOptions, initialCompare = null }: { userId?: string; name: string; compareOptions: { id: string; name: string }[]; initialCompare?: string | null }) {
  const [compareWith, setCompareWith] = useState<string | null>(initialCompare);
  const radar = useRadar(userId, compareWith);
  const overall = radar.data ? radarOverall(radar.data.axes) : null;
  const compareName = compareOptions.find((o) => o.id === compareWith)?.name;
  return (
    <Card>
      <View style={{ gap: 2 }}>
        <Text variant="caption" muted>
          Atributos físicos
        </Text>
        <Text variant="heading">Nível geral {overall == null ? '—' : num(overall, 1)} / 20</Text>
      </View>
      {radar.error ? (
        <ErrorBox error={radar.error} onRetry={() => void radar.refetch()} />
      ) : radar.data ? (
        <RadarChart main={{ label: name, axes: radar.data.axes }} compare={radar.data.compare && compareName ? { label: compareName, axes: radar.data.compare } : null} />
      ) : (
        <Loading />
      )}
      {compareOptions.length ? (
        <View style={{ gap: space.sm }}>
          <Text variant="small" muted>
            Comparar com
          </Text>
          <Row wrap>
            {compareOptions.map((o) => (
              <Chip key={o.id} label={o.name} selected={compareWith === o.id} onPress={() => setCompareWith(compareWith === o.id ? null : o.id)} />
            ))}
          </Row>
        </View>
      ) : null}
      <Text variant="small" faint>
        0 = iniciante, 20 = muito avançado, em cada teste. Força conta em relação ao peso corporal. As referências estão em docs/TESTES_E_RANKING.md.
      </Text>
    </Card>
  );
}

export function TestsPanel({ userId, own }: { userId?: string; own: boolean }) {
  const bests = useBests(userId);
  const radar = useRadar(userId, null);
  const strava = useStravaStatus();
  const { c } = useTheme();
  if (bests.isLoading) return <Loading />;
  if (bests.error) return <ErrorBox error={bests.error} onRetry={() => void bests.refetch()} />;
  const score = (id: string) => radar.data?.axes.find((a) => a.testId === id)?.score ?? null;
  return (
    <>
      {own && strava.data?.configured ? (
        <Card onPress={() => router.push('/strava')} label="Strava">
          <Row gap={space.md}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FC4C02', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.bold, fontSize: 16 }} color="#fff">
                S
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{strava.data.connected ? 'Suas corridas do Strava' : 'Conectar com o Strava'}</Text>
              <Text variant="small" muted>
                {strava.data.connected ? 'Melhores tempos de 1 km, 5 km e 10 km para usar nos testes' : 'Puxe seus melhores tempos de corrida automaticamente'}
              </Text>
            </View>
          </Row>
        </Card>
      ) : null}
      {TEST_GROUPS.map((g) => (
        <Section key={g} title={TEST_GROUP_LABELS[g]}>
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {(bests.data ?? [])
              .filter((b) => TEST_BY_ID[b.testId].group === g)
              .map((b, i) => {
                const def = TEST_BY_ID[b.testId];
                const s = score(b.testId);
                const estimated = b.best && def.input === 'load' && (b.best.reps ?? 1) > 1;
                return (
                  <View key={b.testId}>
                    {i ? <Divider /> : null}
                    <ListItem
                      testID={`test-${b.testId}`}
                      title={def.name}
                      subtitle={
                        b.best
                          ? `${testValue(b.testId, b.best.value, b.best.reps)}${estimated ? ` (1RM ≈ ${num(b.best.effectiveValue, 1)} kg)` : ''} · ${date(b.best.date)}`
                          : own
                            ? 'Toque para registrar'
                            : 'Sem registro'
                      }
                      right={
                        s != null ? (
                          <Text variant="bodyStrong" color={c.accent}>
                            {num(s, 0)}
                            <Text variant="small" faint>
                              /20
                            </Text>
                          </Text>
                        ) : undefined
                      }
                      onPress={() => router.push({ pathname: '/tests/[testId]', params: userId ? { testId: b.testId, userId } : { testId: b.testId } })}
                    />
                  </View>
                );
              })}
          </Card>
        </Section>
      ))}
    </>
  );
}

type Range = '30' | '90' | '365' | 'all';

export function BodyPanel({ userId, own, name }: { userId?: string; own: boolean; name: string }) {
  const body = useBody(userId);
  const { c } = useTheme();
  const [range, setRange] = useState<Range>('90');
  const [compMode, setCompMode] = useState<'pct' | 'kg'>('pct');
  const removeWeighIn = useMutation({ mutationFn: (id: string) => del(`/body/weigh-ins/${id}`), onSuccess: () => invalidate(BODY_KEYS) });

  if (body.isLoading) return <Loading />;
  if (body.error) return <ErrorBox error={body.error} onRetry={() => void body.refetch()} />;
  const b = body.data!;
  if (!b.numbersVisible) {
    return (
      <Card>
        <Empty icon="lock" title={`${name} mantém o corpo privado`} message="Só as fotos que a pessoa marcou como “Grupo” aparecem aqui." />
        {b.photos.length ? <PhotoGrid photos={b.photos} /> : null}
      </Card>
    );
  }

  const since = range === 'all' ? '' : addDays(today(), -Number(range));
  const weights = new Map<string, number>();
  for (const a of b.assessments) if (a.weightKg != null) weights.set(a.date, a.weightKg);
  for (const w of b.weighIns) weights.set(w.date, w.weightKg);
  const weightPts = [...weights.entries()].map(([d, value]) => ({ date: d, value })).filter((p) => p.date >= since);
  const comps = b.assessments.map((a) => a.composition).filter((x) => x.date >= since);
  const pts = (k: 'bodyFatPct' | 'leanMassKg' | 'fatMassKg') => comps.filter((x) => x[k] != null).map((x) => ({ date: x.date, value: x[k]! }));
  const latest = b.latest;
  const sortedW = [...weightPts].sort((x, y) => x.date.localeCompare(y.date));
  const change = sortedW.length > 1 ? sortedW.at(-1)!.value - sortedW[0]!.value : null;

  return (
    <>
      {own ? (
        <Row wrap gap={space.sm}>
          <Button title="Registrar peso" icon="plus" small onPress={() => router.push('/body/weigh-in')} />
          <Button title="Avaliação do nutricionista" icon="clipboard" small kind="secondary" onPress={() => router.push('/body/assessment')} />
          <Button title="Fotos" icon="image" small kind="secondary" onPress={() => router.push('/body/photos')} />
        </Row>
      ) : null}

      <Card>
        <Row wrap gap={space.lg} style={{ alignItems: 'flex-start' }}>
          <Stat label="Peso" value={latest?.weight ? num(latest.weight.weightKg, 1) : '—'} unit="kg" hint={latest?.weight ? date(latest.weight.date) : null} />
          <Stat label="IMC" value={latest?.bmi ? num(latest.bmi, 1) : '—'} hint={latest?.bmi ? bmiLabel(latest.bmi) : own && !b.heightCm ? 'Informe a altura no perfil' : null} />
          <Stat label="Gordura" value={latest?.composition?.bodyFatPct != null ? num(latest.composition.bodyFatPct, 1) : '—'} unit="%" hint={latest?.composition ? date(latest.composition.date) : 'Sem avaliação'} />
          <Stat label="Massa magra" value={latest?.composition?.leanMassKg != null ? num(latest.composition.leanMassKg, 1) : '—'} unit="kg" />
        </Row>
      </Card>

      <Segmented
        options={[
          { value: '30', label: '30 dias' },
          { value: '90', label: '90 dias' },
          { value: '365', label: '1 ano' },
          { value: 'all', label: 'Tudo' },
        ]}
        value={range}
        onChange={setRange}
      />

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="heading">Peso</Text>
          {change != null ? (
            <Text variant="small" muted>
              {change > 0 ? '+' : ''}
              {num(change, 1)} kg no período
            </Text>
          ) : null}
        </Row>
        <LineChart
          series={[{ key: 'weight', label: 'Peso', color: c.chart1, points: weightPts }]}
          unit="kg"
          target={b.targetWeightKg ? { value: b.targetWeightKg, label: `Meta ${num(b.targetWeightKg, 1)} kg` } : null}
          emptyText={own ? 'Registre seu peso para ver a evolução.' : 'Sem pesagens no período.'}
        />
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }} wrap>
          <Text variant="heading">Composição corporal</Text>
          <View style={{ width: 200 }}>
            <Segmented
              options={[
                { value: 'pct', label: '% gordura' },
                { value: 'kg', label: 'Massas (kg)' },
              ]}
              value={compMode}
              onChange={setCompMode}
            />
          </View>
        </Row>
        {compMode === 'pct' ? (
          <LineChart series={[{ key: 'bf', label: '% de gordura', color: c.chart1, points: pts('bodyFatPct') }]} unit="%" emptyText="Registre uma avaliação (bioimpedância, dobras…) para ver aqui." />
        ) : (
          <LineChart
            series={[
              { key: 'lean', label: 'Massa magra', color: c.chart1, points: pts('leanMassKg') },
              { key: 'fat', label: 'Massa gorda', color: c.chart2, points: pts('fatMassKg') },
            ]}
            unit="kg"
            emptyText="Registre uma avaliação para ver massa magra e gorda."
          />
        )}
      </Card>

      <Section title="Avaliações">
        {b.assessments.length ? (
          [...b.assessments].reverse().map((a) => <AssessmentCard key={a.id} a={a} own={own} />)
        ) : (
          <Card>
            <Empty
              icon="clipboard"
              title="Nenhuma avaliação"
              message="Anote o laudo do nutricionista: % de gordura, massa magra, medidas e a foto do laudo."
              action={own ? { label: 'Adicionar avaliação', onPress: () => router.push('/body/assessment') } : undefined}
            />
          </Card>
        )}
      </Section>

      {b.photos.length ? (
        <Section title="Fotos de progresso" action={own ? <Button title="Ver todas" kind="ghost" small onPress={() => router.push('/body/photos')} /> : undefined}>
          <PhotoGrid photos={b.photos} limit={12} />
        </Section>
      ) : null}

      {own && b.weighIns.length ? (
        <Section title="Pesagens recentes">
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {[...b.weighIns]
              .reverse()
              .slice(0, 8)
              .map((w, i) => (
                <View key={w.id}>
                  {i ? <Divider /> : null}
                  <ListItem
                    title={`${num(w.weightKg, 1)} kg`}
                    subtitle={[date(w.date), w.note, w.photos.length ? `${w.photos.length} foto(s)` : null].filter(Boolean).join(' · ')}
                    right={
                      <IconButton
                        icon="trash-2"
                        size={16}
                        label="Apagar pesagem"
                        onPress={async () => {
                          if (await confirm('Apagar pesagem?', `${num(w.weightKg, 1)} kg em ${date(w.date)}`, 'Apagar')) removeWeighIn.mutate(w.id);
                        }}
                      />
                    }
                  />
                </View>
              ))}
          </Card>
        </Section>
      ) : null}
    </>
  );
}

function AssessmentCard({ a, own }: { a: Assessment; own: boolean }) {
  const d = a.composition.derived;
  const rows: [string, number | null, string, boolean?][] = [
    ['Peso', a.weightKg, 'kg'],
    ['% de gordura', a.composition.bodyFatPct, '%', d.includes('bodyFatPct')],
    ['Massa gorda', a.composition.fatMassKg, 'kg', d.includes('fatMassKg')],
    ['Massa magra', a.composition.leanMassKg, 'kg', d.includes('leanMassKg')],
    ['Massa muscular', a.muscleMassKg, 'kg'],
    ['Gordura visceral', a.visceralFat, ''],
    ['Água corporal', a.bodyWaterPct, '%'],
    ['Metabolismo basal', a.bmrKcal, 'kcal'],
    ['Cintura', a.waistCm, 'cm'],
    ['Quadril', a.hipCm, 'cm'],
    ['Peito', a.chestCm, 'cm'],
    ['Braço', a.armCm, 'cm'],
    ['Coxa', a.thighCm, 'cm'],
  ];
  const shown = rows.filter((r) => r[1] != null);
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">{date(a.date)}</Text>
          <Text variant="small" muted>
            {ASSESSMENT_METHOD_LABELS[a.method as AssessmentMethod] ?? a.method}
            {a.professional ? ` · ${a.professional}` : ''}
          </Text>
        </View>
        {own ? <Button title="Editar" kind="ghost" small onPress={() => router.push({ pathname: '/body/assessment', params: { id: a.id } })} /> : null}
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md }}>
        {shown.map(([label, value, unit, derived]) => (
          <View key={label} style={{ width: '33.33%', minWidth: 110, gap: 2 }}>
            <Text variant="small" muted>
              {label}
            </Text>
            <Text variant="bodyStrong">
              {num(value, unit === 'kcal' ? 0 : 1)}
              {unit ? ` ${unit}` : ''}
              {derived ? (
                <Text variant="small" faint>
                  {' '}
                  calc.
                </Text>
              ) : null}
            </Text>
          </View>
        ))}
      </View>
      {a.notes ? (
        <Text variant="small" muted>
          {a.notes}
        </Text>
      ) : null}
      {a.attachments.length ? <PhotoGrid photos={a.attachments} size={72} /> : null}
      {d.length ? (
        <Text variant="small" faint>
          “calc.” = calculado a partir do peso e do que foi medido.
        </Text>
      ) : null}
    </Card>
  );
}

export function DietPanel() {
  const { me } = useAuth();
  const diet = useDiet();
  const body = useBody();
  if (!me) return null;
  const weight = body.data?.latest?.weight?.weightKg ?? null;
  const lean = body.data?.latest?.composition?.leanMassKg ?? null;
  const targets = nutritionTargets({
    goal: me.goal,
    sex: me.sex,
    weightKg: weight,
    heightCm: me.heightCm,
    ageYears: me.birthDate ? ageOn(me.birthDate, today()) : null,
    leanMassKg: lean,
    activity: me.activityLevel,
  });
  const plans = diet.data ?? [];
  const active = plans.find((p) => p.active) ?? null;
  const others = plans.filter((p) => p !== active);
  return (
    <>
      <Card>
        <Text variant="caption" muted>
          Estimativa diária · {GOAL_LABELS[me.goal]}
        </Text>
        {'missing' in targets ? (
          <>
            <Text muted>Para estimar calorias e macros, falta: {targets.missing.join(', ')}.</Text>
            <Button title="Completar perfil" kind="secondary" small onPress={() => router.push('/settings')} style={{ alignSelf: 'flex-start' }} />
          </>
        ) : (
          <>
            <Row wrap gap={space.lg} style={{ alignItems: 'flex-start' }}>
              <Stat label="Calorias" value={num(targets.targetKcal, 0)} unit="kcal" hint={`gasto ≈ ${num(targets.tdeeKcal, 0)} kcal`} />
              <Stat label="Proteína" value={num(targets.proteinG, 0)} unit="g" />
              <Stat label="Carboidrato" value={num(targets.carbsG, 0)} unit="g" />
              <Stat label="Gordura" value={num(targets.fatG, 0)} unit="g" />
            </Row>
            <Text variant="small" faint>
              {targets.method === 'katch_mcardle' ? 'Katch-McArdle (usa sua massa magra)' : 'Mifflin-St Jeor'} · atividade: {ACTIVITY_LEVEL_LABELS[me.activityLevel]} · ajuste {targets.adjustmentPct > 0 ? '+' : ''}
              {targets.adjustmentPct}%. Estimativa geral — o plano do seu nutricionista vale mais.
            </Text>
          </>
        )}
      </Card>

      <Section title="Plano do nutricionista" action={<Button title="Novo" icon="plus" kind="ghost" small onPress={() => router.push('/diet/edit')} />}>
        {diet.isLoading ? <Loading /> : diet.error ? <ErrorBox error={diet.error} onRetry={() => void diet.refetch()} /> : null}
        {active ? (
          <PlanCard plan={active} />
        ) : diet.data ? (
          <Card>
            <Empty icon="book-open" title="Nenhum plano ativo" message="Cadastre as refeições do seu plano e anexe as fotos das páginas que o nutricionista passou." action={{ label: 'Cadastrar plano', onPress: () => router.push('/diet/edit') }} />
          </Card>
        ) : null}
      </Section>
      {others.length ? (
        <Section title="Planos anteriores">
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {others.map((p, i) => (
              <View key={p.id}>
                {i ? <Divider /> : null}
                <ListItem title={p.title} subtitle={[p.professional, p.startDate ? `desde ${date(p.startDate)}` : null].filter(Boolean).join(' · ') || null} onPress={() => router.push({ pathname: '/diet/edit', params: { id: p.id } })} />
              </View>
            ))}
          </Card>
        </Section>
      ) : null}
      <Text variant="small" faint>
        O openGym não tem módulo de dieta; esta parte é do FORJA. Seus planos alimentares ficam visíveis só para você.
      </Text>
    </>
  );
}

function PlanCard({ plan }: { plan: DietPlan }) {
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">{plan.title}</Text>
          <Text variant="small" muted>
            {[plan.professional, plan.startDate ? `desde ${date(plan.startDate)}` : null].filter(Boolean).join(' · ') || 'Plano ativo'}
          </Text>
        </View>
        <Button title="Editar" kind="ghost" small onPress={() => router.push({ pathname: '/diet/edit', params: { id: plan.id } })} />
      </Row>
      {plan.caloriesKcal || plan.proteinG || plan.carbsG || plan.fatG ? (
        <Row wrap gap={space.lg}>
          {plan.caloriesKcal ? <Stat label="Calorias" value={num(plan.caloriesKcal, 0)} unit="kcal" /> : null}
          {plan.proteinG ? <Stat label="Proteína" value={num(plan.proteinG, 0)} unit="g" /> : null}
          {plan.carbsG ? <Stat label="Carbo" value={num(plan.carbsG, 0)} unit="g" /> : null}
          {plan.fatG ? <Stat label="Gordura" value={num(plan.fatG, 0)} unit="g" /> : null}
        </Row>
      ) : null}
      {plan.meals.map((m, i) => (
        <View key={i} style={{ gap: 2, paddingTop: space.sm }}>
          <Row gap={space.sm}>
            <Text variant="bodyStrong">{m.name}</Text>
            {m.time ? (
              <Text variant="small" faint>
                {m.time}
              </Text>
            ) : null}
          </Row>
          <Text variant="small" muted>
            {m.items}
          </Text>
          {m.notes ? (
            <Text variant="small" faint>
              {m.notes}
            </Text>
          ) : null}
        </View>
      ))}
      {plan.notes ? <Text variant="small">{plan.notes}</Text> : null}
      {plan.attachments.length ? <PhotoGrid photos={plan.attachments} size={88} /> : null}
    </Card>
  );
}
