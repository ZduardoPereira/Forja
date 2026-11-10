import { addDays, isLocalDate } from '@forja/shared';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, View } from 'react-native';
import { absoluteUrl, uploadImage } from '@/lib/api';
import { errorText, today } from '@/lib/format';
import type { FileRef } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Chip, Field, Icon, Row, Text } from './ui';

/** "82,5" → 82.5; vazio → null; inválido → NaN. */
export function parseNum(text: string): number | null {
  const t = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}
export const numText = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

const maskDate = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
};
const isoToBr = (iso: string) => (isLocalDate(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const brToIso = (br: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isLocalDate(iso) ? iso : null;
};

/** Data DD/MM/AAAA com atalhos (Hoje, Ontem). Valor no formato AAAA-MM-DD. */
export function DateField({ label, value, onChange, error, quick = true }: { label: string; value: string; onChange: (v: string) => void; error?: string | null; quick?: boolean }) {
  const [text, setText] = useState(isoToBr(value));
  useEffect(() => {
    if (brToIso(text) !== value) setText(isoToBr(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const t = today();
  const invalid = text.length === 10 && !brToIso(text);
  return (
    <View style={{ gap: space.sm }}>
      <Field
        label={label}
        value={text}
        placeholder="DD/MM/AAAA"
        keyboardType="number-pad"
        maxLength={10}
        error={error ?? (invalid ? 'Data inválida' : null)}
        onChangeText={(v) => {
          const masked = maskDate(v);
          setText(masked);
          const iso = brToIso(masked);
          if (iso) onChange(iso);
        }}
      />
      {quick ? (
        <Row>
          <Chip label="Hoje" selected={value === t} onPress={() => onChange(t)} />
          <Chip label="Ontem" selected={value === addDays(t, -1)} onPress={() => onChange(addDays(t, -1))} />
        </Row>
      ) : null}
    </View>
  );
}

const maskTime = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
};
export const isTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field
      label={label}
      value={value}
      placeholder="19:00"
      keyboardType="number-pad"
      maxLength={5}
      error={value.length === 5 && !isTime(value) ? 'Horário inválido' : null}
      onChangeText={(v) => onChange(maskTime(v))}
    />
  );
}

async function pick(fromCamera: boolean, multiple: boolean): Promise<{ uri: string; mimeType?: string | null; file?: Blob }[]> {
  if (fromCamera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Câmera', 'Permita o acesso à câmera nas configurações do aparelho.');
      return [];
    }
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.85, allowsMultipleSelection: multiple && !fromCamera, selectionLimit: multiple ? 4 : 1, exif: false };
  const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled) return [];
  return res.assets.map((a) => ({ uri: a.uri, mimeType: a.mimeType, file: a.file }));
}

/** Escolhe e envia imagens; devolve as referências já salvas no servidor. */
export async function pickAndUpload(kind: string, opts: { camera?: boolean; multiple?: boolean } = {}): Promise<FileRef[]> {
  const assets = await pick(!!opts.camera, !!opts.multiple);
  const out: FileRef[] = [];
  for (const a of assets) {
    const f = await uploadImage(a.uri, kind, a.mimeType ?? 'image/jpeg', a.file);
    out.push({ id: f.id, url: f.url, thumbUrl: f.thumbUrl });
  }
  return out;
}

/** Grade de fotos com botão para adicionar (galeria; câmera no celular). */
export function PhotoPicker({ kind, files, onChange, max = 4, label = 'Fotos' }: { kind: string; files: FileRef[]; onChange: (f: FileRef[]) => void; max?: number; label?: string }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async (camera: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const added = await pickAndUpload(kind, { camera, multiple: true });
      onChange([...files, ...added].slice(0, max));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const tile = { width: 84, height: 84, borderRadius: radius.md } as const;
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="small" muted>
        {label}
      </Text>
      <Row wrap gap={space.sm}>
        {files.map((f) => (
          <View key={f.id}>
            <Image source={{ uri: absoluteUrl(f.thumbUrl) }} style={[tile, { backgroundColor: c.surfaceAlt }]} contentFit="cover" />
            <Pressable
              onPress={() => onChange(files.filter((x) => x.id !== f.id))}
              accessibilityRole="button"
              accessibilityLabel="Remover foto"
              hitSlop={8}
              style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="x" size={13} color="#fff" />
            </Pressable>
          </View>
        ))}
        {files.length < max ? (
          <>
            <Pressable
              onPress={() => add(false)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Adicionar foto da galeria"
              style={[tile, { borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, alignItems: 'center', justifyContent: 'center', gap: 4 }]}
            >
              {busy ? <ActivityIndicator color={c.textMuted} /> : <Icon name="image" color={c.textMuted} />}
              <Text variant="small" faint>
                Galeria
              </Text>
            </Pressable>
            {Platform.OS !== 'web' ? (
              <Pressable
                onPress={() => add(true)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Tirar foto"
                style={[tile, { borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, alignItems: 'center', justifyContent: 'center', gap: 4 }]}
              >
                <Icon name="camera" color={c.textMuted} />
                <Text variant="small" faint>
                  Câmera
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </Row>
      {error ? (
        <Text variant="small" color={c.danger}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Confirmação que funciona no navegador e no celular. */
export function confirm(title: string, message: string, okLabel = 'Confirmar'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title);
  } else Alert.alert(title, message);
}
