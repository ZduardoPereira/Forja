import { VISIBILITY_LABELS, type Visibility } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { confirm, DateField, pickAndUpload } from '@/components/forms';
import { PhotoGrid } from '@/components/photos';
import { Button, Card, Chip, Divider, Empty, ErrorBox, Field, IconButton, Loading, Row, Screen, Section, Segmented, Text } from '@/components/ui';
import { absoluteUrl, del, patch, post } from '@/lib/api';
import { date, errorText, today } from '@/lib/format';
import { BODY_KEYS, invalidate, useBody } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export default function Photos() {
  const body = useBody();
  const { c } = useTheme();
  const [day, setDay] = useState(today());
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'grid' | 'list'>('grid');

  const update = useMutation({
    mutationFn: ({ id, ...b }: { id: string; visibility?: Visibility; caption?: string | null }) => patch(`/body/photos/${id}`, b),
    onSuccess: () => invalidate([['body']]),
  });
  const remove = useMutation({ mutationFn: (id: string) => del(`/body/photos/${id}`), onSuccess: () => invalidate(BODY_KEYS) });

  const add = async (camera: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const files = await pickAndUpload('body', { camera, multiple: true });
      for (const f of files) await post('/body/photos', { fileId: f.id, date: day, caption: caption.trim() || null, visibility });
      if (files.length) {
        setCaption('');
        await invalidate([['body']]);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const photos = body.data?.photos ?? [];
  return (
    <Screen>
      <Card>
        <Text variant="heading">Adicionar fotos</Text>
        <DateField label="Data" value={day} onChange={setDay} />
        <Field label="Legenda (opcional)" value={caption} onChangeText={setCaption} placeholder="Ex.: frente, 8 semanas" maxLength={280} />
        <View style={{ gap: space.sm }}>
          <Text variant="small" muted>
            Quem pode ver
          </Text>
          <Segmented
            options={[
              { value: 'private', label: 'Só eu' },
              { value: 'group', label: 'Grupo' },
            ]}
            value={visibility}
            onChange={setVisibility}
          />
        </View>
        <Row wrap gap={space.sm}>
          <Button title="Escolher da galeria" icon="image" onPress={() => add(false)} loading={busy} />
          {Platform.OS !== 'web' ? <Button title="Câmera" icon="camera" kind="secondary" onPress={() => add(true)} disabled={busy} /> : null}
        </Row>
        {error ? <Text color={c.danger}>{error}</Text> : null}
        <Text variant="small" faint>
          As fotos são convertidas e a localização (GPS) e outros metadados são removidos antes de salvar.
        </Text>
      </Card>

      {body.isLoading ? <Loading /> : body.error ? <ErrorBox error={body.error} onRetry={() => void body.refetch()} /> : null}
      {photos.length ? (
        <Section
          title={`${photos.length} foto(s)`}
          action={
            <View style={{ width: 160 }}>
              <Segmented
                options={[
                  { value: 'grid', label: 'Grade' },
                  { value: 'list', label: 'Editar' },
                ]}
                value={mode}
                onChange={setMode}
              />
            </View>
          }
        >
          {mode === 'grid' ? (
            <PhotoGrid photos={photos} size={104} />
          ) : (
            <Card padded={false} style={{ paddingHorizontal: space.lg }}>
              {photos.map((p, i) => (
                <View key={p.id}>
                  {i ? <Divider /> : null}
                  <Row gap={space.md} style={{ paddingVertical: space.md }}>
                    <Image source={{ uri: absoluteUrl(p.file.thumbUrl) }} style={{ width: 64, height: 64, borderRadius: radius.sm, backgroundColor: c.surfaceAlt }} contentFit="cover" />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text variant="bodyStrong">{date(p.date)}</Text>
                      {p.caption ? (
                        <Text variant="small" muted numberOfLines={2}>
                          {p.caption}
                        </Text>
                      ) : null}
                      <Row>
                        {(['private', 'group'] as const).map((v) => (
                          <Chip key={v} label={VISIBILITY_LABELS[v]} selected={p.visibility === v} onPress={() => p.visibility !== v && update.mutate({ id: p.id, visibility: v })} />
                        ))}
                      </Row>
                    </View>
                    <IconButton
                      icon="trash-2"
                      size={16}
                      label="Apagar foto"
                      color={c.danger}
                      onPress={async () => {
                        if (await confirm('Apagar foto?', 'Ela será removida de vez.', 'Apagar')) remove.mutate(p.id);
                      }}
                    />
                  </Row>
                </View>
              ))}
            </Card>
          )}
        </Section>
      ) : body.data ? (
        <Empty icon="image" title="Nenhuma foto ainda" message="Fotos de frente, lado e costas a cada 2–4 semanas mostram o que a balança não mostra." />
      ) : null}
    </Screen>
  );
}
