import { ASSESSMENT_METHOD_LABELS, ASSESSMENT_METHODS, type AssessmentMethod, assessmentSchema, completeComposition } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { confirm, DateField, numText, parseNum, PhotoPicker } from '@/components/forms';
import { Button, Card, ChipGroup, Field, Loading, Row, Screen, Section, Text } from '@/components/ui';
import { del, post, put } from '@/lib/api';
import { errorText, num, today } from '@/lib/format';
import { BODY_KEYS, invalidate, useBody } from '@/lib/queries';
import type { FileRef } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const FIELDS = {
  weightKg: { label: 'Peso', unit: 'kg' },
  bodyFatPct: { label: '% de gordura', unit: '%' },
  fatMassKg: { label: 'Massa gorda', unit: 'kg' },
  leanMassKg: { label: 'Massa magra (massa livre de gordura)', unit: 'kg' },
  muscleMassKg: { label: 'Massa muscular esquelética', unit: 'kg' },
  visceralFat: { label: 'Gordura visceral (nível)', unit: '' },
  bodyWaterPct: { label: 'Água corporal', unit: '%' },
  bmrKcal: { label: 'Metabolismo basal', unit: 'kcal' },
  waistCm: { label: 'Cintura', unit: 'cm' },
  hipCm: { label: 'Quadril', unit: 'cm' },
  chestCm: { label: 'Peito', unit: 'cm' },
  armCm: { label: 'Braço', unit: 'cm' },
  thighCm: { label: 'Coxa', unit: 'cm' },
} as const;
type Key = keyof typeof FIELDS;
const COMPOSITION: Key[] = ['weightKg', 'bodyFatPct', 'fatMassKg', 'leanMassKg', 'muscleMassKg', 'visceralFat', 'bodyWaterPct', 'bmrKcal'];
const MEASURES: Key[] = ['waistCm', 'hipCm', 'chestCm', 'armCm', 'thighCm'];

export default function AssessmentScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const body = useBody();
  const { c } = useTheme();
  const [day, setDay] = useState(today());
  const [method, setMethod] = useState<AssessmentMethod>('bioimpedance');
  const [professional, setProfessional] = useState('');
  const [values, setValues] = useState<Partial<Record<Key, string>>>({});
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<FileRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    if (!id || loaded || !body.data) return;
    const a = body.data.assessments.find((x) => x.id === id);
    if (!a) return;
    setDay(a.date);
    setMethod(a.method as AssessmentMethod);
    setProfessional(a.professional ?? '');
    setValues(Object.fromEntries((Object.keys(FIELDS) as Key[]).map((k) => [k, numText(a[k])])));
    setNotes(a.notes ?? '');
    setFiles(a.attachments.map((p) => p.file));
    setLoaded(true);
  }, [id, loaded, body.data]);

  const parsed = Object.fromEntries((Object.keys(FIELDS) as Key[]).map((k) => [k, parseNum(values[k] ?? '')])) as Record<Key, number | null>;
  const preview = completeComposition({ date: day, weightKg: parsed.weightKg, bodyFatPct: parsed.bodyFatPct, fatMassKg: parsed.fatMassKg, leanMassKg: parsed.leanMassKg });

  const save = useMutation({
    mutationFn: (b: unknown) => (id ? put(`/body/assessments/${id}`, b) : post('/body/assessments', b)),
    onSuccess: async () => {
      await invalidate(BODY_KEYS);
      router.back();
    },
    onError: (err) => setError(errorText(err)),
  });
  const remove = useMutation({
    mutationFn: () => del(`/body/assessments/${id}`),
    onSuccess: async () => {
      await invalidate(BODY_KEYS);
      router.back();
    },
  });

  const submit = () => {
    const bad = (Object.keys(FIELDS) as Key[]).find((k) => Number.isNaN(parsed[k]));
    if (bad) return setError(`${FIELDS[bad].label}: número inválido`);
    const result = assessmentSchema.safeParse({ date: day, method, professional: professional.trim() || null, ...parsed, notes: notes.trim() || null, fileIds: files.map((f) => f.id) });
    if (!result.success) {
      const issue = result.error.issues[0]!;
      const k = issue.path[0] as Key | undefined;
      return setError(k && k in FIELDS && issue.code !== 'custom' ? `${FIELDS[k].label}: valor fora do esperado` : issue.message);
    }
    setError(null);
    save.mutate(result.data);
  };

  if (id && !loaded) return <Loading />;
  const field = (k: Key) => (
    <View key={k} style={{ flexBasis: 160, flexGrow: 1 }}>
      <Field
        label={`${FIELDS[k].label}${FIELDS[k].unit ? ` (${FIELDS[k].unit})` : ''}`}
        value={values[k] ?? ''}
        onChangeText={(v) => setValues((s) => ({ ...s, [k]: v }))}
        keyboardType="decimal-pad"
        placeholder={k === 'fatMassKg' && preview.derived.includes('fatMassKg') ? `calc. ${num(preview.fatMassKg, 1)}` : k === 'leanMassKg' && preview.derived.includes('leanMassKg') ? `calc. ${num(preview.leanMassKg, 1)}` : k === 'bodyFatPct' && preview.derived.includes('bodyFatPct') ? `calc. ${num(preview.bodyFatPct, 1)}` : undefined}
      />
    </View>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Editar avaliação' : 'Nova avaliação' }} />
      <Card>
        <DateField label="Data da avaliação" value={day} onChange={setDay} />
        <View style={{ gap: space.sm }}>
          <Text variant="small" muted>
            Método
          </Text>
          <ChipGroup options={ASSESSMENT_METHODS.map((m) => ({ value: m, label: ASSESSMENT_METHOD_LABELS[m] }))} value={method} onChange={setMethod} />
        </View>
        <Field label="Profissional (opcional)" value={professional} onChangeText={setProfessional} placeholder="Ex.: Dra. Paula (nutricionista)" maxLength={80} />
      </Card>

      <Section title="Composição corporal">
        <Card>
          <Row wrap gap={space.md} style={{ alignItems: 'flex-start' }}>
            {COMPOSITION.map(field)}
          </Row>
          <Text variant="small" faint>
            Preencha o que estiver no laudo. Com peso e % de gordura, o app calcula massa gorda e massa magra (e vice-versa).
          </Text>
        </Card>
      </Section>

      <Section title="Medidas">
        <Card>
          <Row wrap gap={space.md} style={{ alignItems: 'flex-start' }}>
            {MEASURES.map(field)}
          </Row>
        </Card>
      </Section>

      <Card>
        <Field label="Observações / análise do nutricionista" value={notes} onChangeText={setNotes} multiline maxLength={2000} style={{ minHeight: 90, textAlignVertical: 'top' }} />
        <PhotoPicker kind="assessment" files={files} onChange={setFiles} max={8} label="Fotos do laudo (só você vê)" />
      </Card>

      {error ? <Text color={c.danger}>{error}</Text> : null}
      <Button title="Salvar avaliação" icon="check" onPress={submit} loading={save.isPending} />
      {id ? (
        <Button
          title="Apagar avaliação"
          kind="danger"
          loading={remove.isPending}
          onPress={async () => {
            if (await confirm('Apagar avaliação?', 'Os dados e fotos do laudo serão removidos.', 'Apagar')) remove.mutate();
          }}
        />
      ) : null}
    </Screen>
  );
}
