import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExerciseSearch } from '@/components/exercises';
import { Text, useWide } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { CONTENT_MAX, space } from '@/theme/tokens';

export default function Exercises() {
  const { c } = useTheme();
  const wide = useWide();
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center', padding: wide ? space.xxl : space.lg, gap: space.md }}>
        <ExerciseSearch onSelect={(e) => router.push(`/exercises/${e.id}`)} />
        <Text variant="small" faint>
          Catálogo do openGym — textos sob AGPL-3.0 (openGym) e MIT (origem ExerciseDB).
        </Text>
      </View>
    </SafeAreaView>
  );
}
