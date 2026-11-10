import { BODY_PART_LABELS, EQUIPMENT_LABELS, label, MUSCLE_LABELS } from '@forja/shared';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useExercises } from '@/lib/queries';
import type { ExerciseItem } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Chip, ChipStrip, Divider, Empty, ErrorBox, Field, Icon, ListItem, Loading, Text } from './ui';

const BODY_PARTS = Object.keys(BODY_PART_LABELS);
const EQUIPMENT = ['body weight', 'barbell', 'dumbbell', 'cable', 'leverage machine', 'kettlebell', 'band', 'smith machine'];

export const exerciseSubtitle = (e: Pick<ExerciseItem, 'bodyPart' | 'target' | 'equipment'>) =>
  [label(BODY_PART_LABELS, e.bodyPart), e.target ? label(MUSCLE_LABELS, e.target) : null, e.equipment ? label(EQUIPMENT_LABELS, e.equipment) : null].filter((x) => x && x !== '—').join(' · ');

/** Busca no catálogo do openGym (5 mil+ exercícios, nomes em português). */
export function ExerciseSearch({ onSelect, selectedIds = [] }: { onSelect: (e: ExerciseItem) => void; selectedIds?: string[] }) {
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const [bodyPart, setBodyPart] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const list = useExercises(q.trim(), bodyPart, equipment);
  return (
    <View style={{ flex: 1, gap: space.md }}>
      <Field label="Buscar exercício" value={q} onChangeText={setQ} placeholder="Ex.: supino, agachamento, remada" autoCorrect={false} returnKeyType="search" testID="exercise-search" />
      <ChipStrip>
        {BODY_PARTS.map((b) => (
          <Chip key={b} label={BODY_PART_LABELS[b]!} selected={bodyPart === b} onPress={() => setBodyPart(bodyPart === b ? null : b)} />
        ))}
      </ChipStrip>
      <ChipStrip>
        {EQUIPMENT.map((e) => (
          <Chip key={e} label={EQUIPMENT_LABELS[e]!} selected={equipment === e} onPress={() => setEquipment(equipment === e ? null : e)} />
        ))}
      </ChipStrip>
      {list.data ? (
        <Text variant="small" faint>
          {list.data.total} exercício(s){list.data.total > list.data.items.length ? ` · mostrando ${list.data.items.length}, refine a busca` : ''}
        </Text>
      ) : null}
      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorBox error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <FlatList
          data={list.data?.items ?? []}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={<Empty icon="search" title="Nada encontrado" message="Tente outro nome ou tire os filtros." />}
          renderItem={({ item }) => (
            <ListItem
              testID={`exercise-${item.id}`}
              title={item.namePt}
              subtitle={exerciseSubtitle(item)}
              right={selectedIds.includes(item.id) ? <Icon name="check" color={c.accent} /> : undefined}
              onPress={() => onSelect(item)}
            />
          )}
        />
      )}
    </View>
  );
}
