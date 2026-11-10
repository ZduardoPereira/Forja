import { registerSchema } from '@forja/shared';
import { useState } from 'react';
import { View } from 'react-native';
import { AuthShell, ServerField } from '@/components/auth';
import { Button, Field, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { useAuthConfig } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function Register() {
  const { signUp } = useAuth();
  const config = useAuthConfig();
  const { c } = useTheme();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [invite, setInvite] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = registerSchema.safeParse({ name, password, inviteCode: invite || undefined });
    const next: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message;
    if (password !== confirmPw) next.confirm = 'As senhas não conferem';
    if (config.data?.inviteRequired && !invite.trim()) next.inviteCode = 'Peça o código do grupo para quem administra';
    setErrors(next);
    if (Object.keys(next).length || !parsed.success) return;
    setBusy(true);
    try {
      await signUp(parsed.data.name, parsed.data.password, parsed.data.inviteCode);
    } catch (err) {
      setErrors({ form: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <View style={{ gap: space.sm }}>
        <Text variant="display">Criar conta</Text>
        <Text muted>Só nome e senha. Sem e-mail — o app é só do grupo.</Text>
      </View>
      <View style={{ gap: space.lg }}>
        <Field label="Nome (como os amigos te chamam)" value={name} onChangeText={setName} autoCapitalize="words" error={errors.name} maxLength={24} testID="register-name" />
        <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" error={errors.password} hint="Mínimo de 6 caracteres" testID="register-password" />
        <Field label="Repita a senha" value={confirmPw} onChangeText={setConfirmPw} secureTextEntry autoComplete="new-password" error={errors.confirm} testID="register-confirm" />
        {config.data?.inviteRequired !== false ? (
          <Field label="Código do grupo" value={invite} onChangeText={setInvite} autoCapitalize="none" autoCorrect={false} error={errors.inviteCode} hint="Quem hospeda o app define esse código" testID="register-invite" />
        ) : null}
        {errors.form ? (
          <Text color={c.danger} accessibilityLiveRegion="polite">
            {errors.form}
          </Text>
        ) : null}
        <Button title="Criar conta" onPress={submit} loading={busy} testID="register-submit" />
        <Text variant="small" faint style={{ textAlign: 'center' }}>
          Esqueceu a senha depois? O administrador do grupo gera uma senha temporária para você.
        </Text>
      </View>
      <ServerField />
    </AuthShell>
  );
}
