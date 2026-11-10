import { loginSchema } from '@forja/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuthShell, ServerField } from '@/components/auth';
import { Button, Field, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { useAuthConfig } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { font, space } from '@/theme/tokens';

export default function Login() {
  const { signIn } = useAuth();
  const config = useAuthConfig();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { c } = useTheme();

  const submit = async () => {
    const parsed = loginSchema.safeParse({ name, password });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setError(null);
    setBusy(true);
    try {
      await signIn(parsed.data.name, parsed.data.password);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <View style={{ gap: space.sm }}>
        <Text style={{ fontFamily: font.bold, fontSize: 40, letterSpacing: 6, lineHeight: 46 }}>FORJA</Text>
        <Text muted>Treinos, evolução e competição com os amigos.</Text>
      </View>
      <View style={{ gap: space.lg }}>
        <Field label="Nome" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="username" textContentType="username" returnKeyType="next" testID="login-name" />
        <Field
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          testID="login-password"
        />
        {error ? (
          <Text color={c.danger} accessibilityLiveRegion="polite" testID="login-error">
            {error}
          </Text>
        ) : null}
        <Button title="Entrar" onPress={submit} loading={busy} testID="login-submit" />
      </View>
      <View style={{ gap: space.lg, alignItems: 'center' }}>
        {config.data && !config.data.hasUsers ? (
          <Text muted style={{ textAlign: 'center' }}>
            Ninguém cadastrado ainda: a primeira conta vira administradora do grupo.
          </Text>
        ) : null}
        <Link href="/register" style={{ color: c.text, fontFamily: font.semibold, fontSize: 15 }}>
          Criar conta
        </Link>
        <ServerField />
      </View>
    </AuthShell>
  );
}
