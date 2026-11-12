import { HeaderHeightContext } from 'expo-router/react-navigation';
import { type ReactNode, useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { session } from '@/lib/api';
import { queryClient } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Field, Text } from './ui';

/** No celular é preciso dizer onde está o servidor; no navegador ele é o próprio site. */
export function ServerField() {
  const [value, setValue] = useState(session.server());
  const [open, setOpen] = useState(false);
  const { c } = useTheme();
  if (Platform.OS === 'web') return null;
  if (!open) {
    return (
      <Text variant="small" faint onPress={() => setOpen(true)} accessibilityRole="button" style={{ textAlign: 'center' }}>
        Servidor: {session.server()} ·{' '}
        <Text variant="small" color={c.accent}>
          alterar
        </Text>
      </Text>
    );
  }
  return (
    <View style={{ alignSelf: 'stretch' }}>
      <Field
        label="Endereço do servidor"
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        hint="Ex.: https://forja.seudominio.com — quem hospeda o app passa esse endereço."
        onBlur={async () => {
          await session.setServer(value);
          await queryClient.invalidateQueries({ queryKey: ['auth-config'] });
        }}
      />
    </View>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'web' ? undefined : 'padding'} keyboardVerticalOffset={headerHeight} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', gap: space.xl }}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
