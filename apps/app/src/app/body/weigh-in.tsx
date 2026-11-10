import { weighInSchema } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { DateField, parseNum, PhotoPicker } from '@/components/forms';
import { Button, Card, Field, Screen, Text } from '@/components/ui';
import { post } from '@/lib/api';
import { date, errorText, num, today } from '@/lib/format';
import { BODY_KEYS, invalidate, useBody } from '@/lib/queries';
import type { FileRef } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';

export default function WeighIn() {
  const body = useBody();
  const { c } = useTheme();
  const [day, setDay] = useState(today());
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<FileRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const last = body.data?.latest?.weight;

  const save = useMutation({
    mutationFn: (b: unknown) => post('/body/weigh-ins', b),
    onSuccess: async () => {
      await invalidate(BODY_KEYS);
      router.back();
    },
    onError: (err) => setError(errorText(err)),
  });

  const submit = () => {
    const parsed = weighInSchema.safeParse({ date: day, weightKg: parseNum(weight), note: note.trim() || null, photoFileIds: photos.map((p) => p.id) });
    if (!parsed.success) return setError(parsed.error.issues[0]!.path[0] === 'weightKg' ? 'Informe o peso entre 30 e 300 kg (ex.: 82,4)' : parsed.error.issues[0]!.message);
    setError(null);
    save.mutate(parsed.data);
  };

  return (
    <Screen>
      <Card>
        <Field label="Peso (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={last ? num(last.weightKg, 1) : 'Ex.: 82,4'} autoFocus testID="weight-input" hint={last ? `Último: ${num(last.weightKg, 1)} kg em ${date(last.date)}` : undefined} />
        <DateField label="Data" value={day} onChange={setDay} />
        <Field label="Observação (opcional)" value={note} onChangeText={setNote} placeholder="Ex.: em jejum, depois do treino" maxLength={280} />
      </Card>
      <Card>
        <PhotoPicker kind="body" files={photos} onChange={setPhotos} max={4} label="Fotos do dia (opcional, só você vê)" />
      </Card>
      {error ? <Text color={c.danger}>{error}</Text> : null}
      <Button title="Salvar peso" icon="check" onPress={submit} loading={save.isPending} testID="weight-save" />
      <Text variant="small" faint style={{ textAlign: 'center' }}>
        Dica: pese-se sempre no mesmo horário (ex.: ao acordar) para o gráfico mostrar a tendência real.
      </Text>
    </Screen>
  );
}
