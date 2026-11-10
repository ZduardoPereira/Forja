import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { absoluteUrl } from '@/lib/api';
import { date } from '@/lib/format';
import type { FileRef } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { IconButton, Text } from './ui';

export interface GridPhoto {
  id: string;
  file: FileRef;
  date?: string;
  caption?: string | null;
}

/** Grade de miniaturas; toque abre a foto inteira. */
export function PhotoGrid({ photos, size = 96, limit }: { photos: GridPhoto[]; size?: number; limit?: number }) {
  const { c } = useTheme();
  const [open, setOpen] = useState<GridPhoto | null>(null);
  const { width, height } = useWindowDimensions();
  const shown = limit ? photos.slice(0, limit) : photos;
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {shown.map((p) => (
          <Pressable key={p.id} onPress={() => setOpen(p)} accessibilityRole="imagebutton" accessibilityLabel={`Foto${p.date ? ` de ${date(p.date)}` : ''}${p.caption ? `: ${p.caption}` : ''}`}>
            <Image source={{ uri: absoluteUrl(p.file.thumbUrl) }} style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: c.surfaceAlt }} contentFit="cover" transition={150} />
            {p.date ? (
              <View style={{ position: 'absolute', left: 4, bottom: 4, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)' }}>
                <Text style={{ fontSize: 10, lineHeight: 13 }} color="#fff">
                  {date(p.date, true)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' }}>
          {open ? (
            <>
              <Image source={{ uri: absoluteUrl(open.file.url) }} style={{ width: Math.min(width, 1000), height: height * 0.8 }} contentFit="contain" accessibilityLabel={open.caption ?? 'Foto'} />
              <View style={{ padding: space.lg, alignItems: 'center', gap: 4 }}>
                {open.date ? <Text color="#fff">{date(open.date)}</Text> : null}
                {open.caption ? <Text color="#ddd">{open.caption}</Text> : null}
              </View>
            </>
          ) : null}
          <View style={{ position: 'absolute', top: space.xl, right: space.lg }}>
            <IconButton icon="x" label="Fechar" color="#fff" size={26} onPress={() => setOpen(null)} />
          </View>
        </View>
      </Modal>
    </>
  );
}
