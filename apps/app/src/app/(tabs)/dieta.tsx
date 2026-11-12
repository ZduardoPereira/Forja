import { ACTIVITY_LEVEL_LABELS, GOAL_LABELS } from '@forja/shared';
import { router } from 'expo-router';
import { View } from 'react-native';
import { TabHeader } from '@/components/activity';
import { MacroTargets, MealCard, planTotals, useDietTarget } from '@/components/diet';
import { PhotoGrid } from '@/components/photos';
import { Button, Card, Divider, ErrorBox, ListItem, Loading, Row, Screen, Section, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { date, num } from '@/lib/format';
import { useDiet } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

function Steps() {
  const { c } = useTheme();
  const steps = [
    ['Escolha as refeições', 'Café da manhã, almoço, lanche, jantar… do jeito da sua rotina.'],
    ['Adicione os alimentos', 'Busque (arroz, frango, banana…), diga a quantidade e o app calcula calorias e proteína.'],
    ['Compare com a meta', 'O app mostra quanto o plano cobre da sua meta do dia (a do nutricionista ou a estimativa pelo seu perfil).'],
  ];
  return (
    <Card>
      <Text variant="heading">Monte sua dieta em 3 passos</Text>
      {steps.map(([title, text], i) => (
        <Row key={title} gap={space.md} style={{ alignItems: 'flex-start' }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="small" color={c.accent}>
              {i + 1}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{title}</Text>
            <Text variant="small" muted>
              {text}
            </Text>
          </View>
        </Row>
      ))}
      <Button title="Montar minha dieta" icon="plus" onPress={() => router.push('/diet/edit')} />
      <Text variant="small" faint>
        Já tem o plano do nutricionista em papel ou PDF? Monte as refeições e anexe as fotos das páginas.
      </Text>
    </Card>
  );
}

export default function Dieta() {
  const { me } = useAuth();
  const diet = useDiet();
  const plans = diet.data ?? [];
  const active = plans.find((p) => p.active) ?? null;
  const others = plans.filter((p) => p !== active);
  const { target, source, missing } = useDietTarget(active);
  const totals = active ? planTotals(active.meals) : null;

  return (
    <Screen tab refreshing={diet.isRefetching} onRefresh={() => void diet.refetch()}>
      <TabHeader title="Dieta" subtitle={me ? `Objetivo: ${GOAL_LABELS[me.goal]}` : undefined} right={active ? <Button title="Editar" icon="edit-2" small kind="secondary" onPress={() => router.push({ pathname: '/diet/edit', params: { id: active.id } })} /> : undefined} />
      {diet.isLoading ? <Loading /> : diet.error ? <ErrorBox error={diet.error} onRetry={() => void diet.refetch()} /> : null}

      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 2, flex: 1 }}>
            <Text variant="caption" muted>
              Meta do dia {source === 'plan' ? '· do seu plano' : source === 'estimate' ? '· estimada pelo perfil' : ''}
            </Text>
            <Text variant="title">{target ? `${num(target.kcal, 0)} kcal` : 'Sem meta ainda'}</Text>
            {target ? (
              <Text variant="small" muted>
                Proteína {num(target.proteinG, 0)} g · Carbo {num(target.carbsG, 0)} g · Gordura {num(target.fatG, 0)} g
              </Text>
            ) : (
              <Text variant="small" muted>
                Complete no perfil ({missing.join(', ') || 'peso, altura, idade e sexo'}) para o app estimar.
              </Text>
            )}
          </View>
        </Row>
        {totals ? <MacroTargets total={totals} target={target} /> : null}
        {source === 'estimate' && me ? (
          <Text variant="small" faint>
            Estimativa pelo seu peso, altura, idade e nível de atividade ({ACTIVITY_LEVEL_LABELS[me.activityLevel]}). A do nutricionista vale mais.
          </Text>
        ) : null}
        {!target ? <Button title="Completar perfil" kind="secondary" small onPress={() => router.push('/settings')} /> : null}
      </Card>

      {active ? (
        <>
          <Section title={`${active.title}${active.professional ? ` · ${active.professional}` : ''}`}>
            {active.meals.length ? (
              active.meals.map((m, i) => <MealCard key={i} meal={m} onPress={() => router.push({ pathname: '/diet/edit', params: { id: active.id } })} />)
            ) : (
              <Card>
                <Text muted>Plano sem refeições. Toque em Editar para adicionar.</Text>
              </Card>
            )}
            {active.notes ? (
              <Card>
                <Text variant="small" muted>
                  {active.notes}
                </Text>
              </Card>
            ) : null}
          </Section>
          {active.attachments.length ? (
            <Section title="Fotos do plano">
              <PhotoGrid photos={active.attachments} size={96} />
            </Section>
          ) : null}
        </>
      ) : diet.data ? (
        <Steps />
      ) : null}

      {others.length ? (
        <Section title="Planos antigos">
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
      {active ? <Button title="Montar outro plano" icon="plus" kind="ghost" small onPress={() => router.push('/diet/edit')} /> : null}
      <Text variant="small" faint>
        Sua dieta fica visível só para você. Os valores dos alimentos são aproximados (tabela TACO).
      </Text>
    </Screen>
  );
}
