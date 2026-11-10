import { BODY_PART_LABELS, CATEGORY_LABELS, EQUIPMENT_LABELS, label, MUSCLE_LABELS } from '@forja/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Badge, Card, ErrorBox, Loading, Row, Screen, Section, Text } from '@/components/ui';
import { useExercise } from '@/lib/queries';
import { space } from '@/theme/tokens';

export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ex = useExercise(id);
  if (ex.isLoading) return <Loading />;
  if (ex.error || !ex.data) return <ErrorBox error={ex.error} onRetry={() => void ex.refetch()} />;
  const e = ex.data;
  return (
    <Screen>
      <Stack.Screen options={{ title: e.namePt }} />
      <View style={{ gap: space.sm }}>
        <Text variant="display">{e.namePt}</Text>
        {e.nameEn.toLowerCase() !== e.namePt.toLowerCase() ? <Text muted>{e.nameEn}</Text> : null}
        <Row wrap gap={space.sm}>
          {e.bodyPart ? <Badge label={label(BODY_PART_LABELS, e.bodyPart)} tone="accent" /> : null}
          {e.equipment ? <Badge label={label(EQUIPMENT_LABELS, e.equipment)} /> : null}
          {e.category ? <Badge label={label(CATEGORY_LABELS, e.category)} /> : null}
          {e.hold ? <Badge label="Isométrico (tempo)" /> : null}
        </Row>
      </View>
      <Card>
        <Row wrap gap={space.xl}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" muted>
              Músculo alvo
            </Text>
            <Text variant="bodyStrong">{label(MUSCLE_LABELS, e.target)}</Text>
          </View>
          {e.secondary.length ? (
            <View style={{ gap: 2, flexShrink: 1 }}>
              <Text variant="caption" muted>
                Secundários
              </Text>
              <Text variant="bodyStrong">{e.secondary.map((m) => label(MUSCLE_LABELS, m)).join(', ')}</Text>
            </View>
          ) : null}
        </Row>
      </Card>
      {e.description ? <Text muted>{e.description}</Text> : null}
      {e.instructions.length ? (
        <Section title={e.instructionsLang === 'pt' ? 'Como fazer' : 'Como fazer (em inglês — tradução ainda não disponível)'}>
          <Card>
            {e.instructions.map((step, i) => (
              <Row key={i} gap={space.md} style={{ alignItems: 'flex-start' }}>
                <Text variant="bodyStrong" style={{ width: 20 }}>
                  {i + 1}
                </Text>
                <Text style={{ flex: 1 }}>{step}</Text>
              </Row>
            ))}
          </Card>
        </Section>
      ) : null}
      <Text variant="small" faint>
        Fonte: catálogo openGym ({e.textSource === 'exercisedb-mit' ? 'texto de origem ExerciseDB, licença MIT' : e.textSource === 'opengym-agpl' ? 'texto openGym, licença AGPL-3.0' : e.textSource}). Imagens e
        animações do openGym não são usadas por causa da licença delas.
      </Text>
    </Screen>
  );
}
