import {
  ACTIVITY_LEVEL_LABELS,
  ACTIVITY_LEVELS,
  changePasswordSchema,
  EXPERIENCE_LABELS,
  EXPERIENCE_LEVELS,
  type Goal,
  GOAL_HINTS,
  GOAL_LABELS,
  GOALS,
  profileSchema,
  SEX_LABELS,
  SEXES,
} from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';
import { confirm, DateField, notify, numText, parseNum, pickAndUpload } from '@/components/forms';
import { Avatar, Button, Card, ChipGroup, Field, ListItem, Row, Screen, Section, Segmented, Text } from '@/components/ui';
import { del, get, patch, post, session } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { invalidate } from '@/lib/queries';
import type { Me } from '@/lib/types';
import { type ThemePref, useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

function ProfileForm({ me }: { me: Me }) {
  const { setMe } = useAuth();
  const { c } = useTheme();
  const [name, setName] = useState(me.name);
  const [bio, setBio] = useState(me.bio ?? '');
  const [goal, setGoal] = useState<Goal>(me.goal);
  const [sex, setSex] = useState(me.sex);
  const [birth, setBirth] = useState(me.birthDate ?? '');
  const [height, setHeight] = useState(numText(me.heightCm));
  const [experience, setExperience] = useState(me.experience);
  const [target, setTarget] = useState(numText(me.targetWeightKg));
  const [activity, setActivity] = useState(me.activityLevel);
  const [shareBody, setShareBody] = useState(me.shareBody);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  const save = useMutation({
    mutationFn: (b: unknown) => patch<Me>('/me', b),
    onSuccess: async (u) => {
      setMe(u);
      setSaved(true);
      setError(null);
      await invalidate([['members'], ['home'], ['body'], ['radar'], ['competition'], ['tests'], ['powerlifting'], ['leaderboard']]);
    },
    onError: (err) => setError(errorText(err)),
  });

  const changeAvatar = async () => {
    setUploading(true);
    try {
      const [f] = await pickAndUpload('avatar');
      if (f) save.mutate({ avatarFileId: f.id });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    setSaved(false);
    const h = parseNum(height);
    const t = parseNum(target);
    if (Number.isNaN(h) || Number.isNaN(t)) return setError('Altura e peso-meta precisam ser números.');
    const parsed = profileSchema.safeParse({ name: name.trim(), bio: bio.trim() || null, goal, sex, birthDate: birth || null, heightCm: h, experience, targetWeightKg: t, activityLevel: activity, shareBody });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const labels: Record<string, string> = { heightCm: 'Altura entre 100 e 250 cm', targetWeightKg: 'Peso-meta entre 30 e 300 kg', birthDate: 'Data de nascimento inválida' };
      return setError(labels[String(issue.path[0])] ?? issue.message);
    }
    save.mutate(parsed.data);
  };

  return (
    <>
      <Card>
        <Row gap={space.lg}>
          <Pressable onPress={changeAvatar} accessibilityRole="button" accessibilityLabel="Trocar foto de perfil">
            <Avatar name={me.name} file={me.avatar} size={72} />
          </Pressable>
          <View style={{ flex: 1, gap: space.sm }}>
            <Button title={uploading ? 'Enviando…' : 'Trocar foto'} small kind="secondary" onPress={changeAvatar} loading={uploading} style={{ alignSelf: 'flex-start' }} />
            {me.avatar ? <Button title="Remover foto" small kind="ghost" onPress={() => save.mutate({ avatarFileId: null })} style={{ alignSelf: 'flex-start' }} /> : null}
          </View>
        </Row>
        <Field label="Nome" value={name} onChangeText={setName} maxLength={24} hint="É com ele que você entra no app" />
        <Field label="Bio (opcional)" value={bio} onChangeText={setBio} maxLength={280} placeholder="Ex.: corredor de fim de semana" />
      </Card>

      <Section title="Objetivo">
        <Card>
          <ChipGroup options={GOALS.map((g) => ({ value: g, label: GOAL_LABELS[g] }))} value={goal} onChange={setGoal} />
          <Text variant="small" muted>
            {GOAL_HINTS[goal]} Nas competições você escolhe o objetivo de cada uma.
          </Text>
          <Field label="Peso-meta (kg, opcional)" value={target} onChangeText={setTarget} keyboardType="decimal-pad" hint="Aparece como linha no gráfico de peso" />
        </Card>
      </Section>

      <Section title="Dados físicos">
        <Card>
          <Text variant="small" muted>
            Sexo (usado na pontuação DOTS e nas fórmulas de calorias)
          </Text>
          <ChipGroup options={SEXES.map((s) => ({ value: s, label: SEX_LABELS[s] }))} value={sex} onChange={setSex} />
          <DateField label="Data de nascimento" value={birth} onChange={setBirth} quick={false} />
          <Field label="Altura (cm)" value={height} onChangeText={setHeight} keyboardType="number-pad" maxLength={3} />
          <Text variant="small" muted>
            Experiência de treino (define o ritmo esperado de ganho de massa)
          </Text>
          <ChipGroup options={EXPERIENCE_LEVELS.map((x) => ({ value: x, label: EXPERIENCE_LABELS[x] }))} value={experience} onChange={setExperience} />
          <Text variant="small" muted>
            Nível de atividade (para a estimativa de calorias)
          </Text>
          <ChipGroup options={ACTIVITY_LEVELS.map((x) => ({ value: x, label: ACTIVITY_LEVEL_LABELS[x] }))} value={activity} onChange={setActivity} />
        </Card>
      </Section>

      <Section title="Privacidade">
        <Card>
          <Row style={{ justifyContent: 'space-between' }} gap={space.md}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">Mostrar meus números do corpo ao grupo</Text>
              <Text variant="small" muted>
                Peso, % de gordura e avaliações no seu perfil. Fotos seguem a escolha de cada foto. A competição sempre usa seus dados para calcular a nota, mas só mostra os pontos.
              </Text>
            </View>
            <Switch value={shareBody} onValueChange={setShareBody} trackColor={{ true: c.accent, false: c.border }} accessibilityLabel="Mostrar meus números do corpo ao grupo" />
          </Row>
        </Card>
      </Section>

      {error ? <Text color={c.danger}>{error}</Text> : null}
      {saved ? <Text color={c.success}>Perfil salvo ✓</Text> : null}
      <Button title="Salvar perfil" icon="check" onPress={submit} loading={save.isPending} testID="profile-save" />
    </>
  );
}

function PasswordForm() {
  const { c } = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const change = useMutation({
    mutationFn: (b: unknown) => post('/me/password', b),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setMsg({ ok: true, text: 'Senha trocada. Os outros aparelhos foram desconectados.' });
    },
    onError: (err) => setMsg({ ok: false, text: errorText(err) }),
  });
  return (
    <Card>
      <Field label="Senha atual" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
      <Field label="Nova senha" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" hint="Mínimo de 6 caracteres" />
      {msg ? <Text color={msg.ok ? c.success : c.danger}>{msg.text}</Text> : null}
      <Button
        title="Trocar senha"
        kind="secondary"
        loading={change.isPending}
        onPress={() => {
          const parsed = changePasswordSchema.safeParse({ currentPassword: current, newPassword: next });
          if (!parsed.success) return setMsg({ ok: false, text: parsed.error.issues[0]!.message });
          change.mutate(parsed.data);
        }}
      />
    </Card>
  );
}

async function exportData() {
  const data = await get<unknown>('/me/export');
  const text = JSON.stringify(data, null, 2);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'forja-meus-dados.json';
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, 'forja-meus-dados.json');
  file.create({ overwrite: true });
  await file.write(text);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Meus dados do FORJA' });
  else notify('Arquivo salvo', file.uri);
}

export default function Settings() {
  const { me, signOut } = useAuth();
  const { pref, setPref } = useTheme();
  const [deletePw, setDeletePw] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  if (!me) return null;
  const version = Constants.expoConfig?.version ?? '';

  return (
    <Screen>
      <ProfileForm me={me} />

      <Section title="Aparência">
        <Segmented<ThemePref>
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'dark', label: 'Escuro' },
            { value: 'light', label: 'Claro' },
          ]}
          value={pref}
          onChange={setPref}
        />
      </Section>

      <Section title="Grupo e conexões">
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <ListItem title="Pessoas do grupo" subtitle={me.isAdmin ? 'Você é administrador: pode gerar senha temporária e remover pessoas' : 'Quem está no FORJA'} onPress={() => router.push('/members')} />
          <ListItem title="Strava" subtitle="Seus tempos de corrida (só você vê)" onPress={() => router.push('/strava')} />
        </Card>
      </Section>

      <Section title="Senha">
        <PasswordForm />
      </Section>

      <Section title="Seus dados">
        <Card>
          <Button
            title="Exportar meus dados (JSON)"
            icon="download"
            kind="secondary"
            loading={busy === 'export'}
            onPress={async () => {
              setBusy('export');
              try {
                await exportData();
              } catch (err) {
                notify('Não deu para exportar', errorText(err));
              } finally {
                setBusy(null);
              }
            }}
          />
          {Platform.OS !== 'web' ? (
            <Text variant="small" faint>
              Servidor: {session.server()}
            </Text>
          ) : null}
        </Card>
      </Section>

      <Button title="Sair deste aparelho" icon="log-out" kind="secondary" onPress={() => void signOut()} />

      <Section title="Zona de perigo">
        <Card>
          <Text variant="small" muted>
            Excluir a conta apaga seu perfil, pesagens, avaliações, fotos, testes, mensagens e participações. Não dá para desfazer.
          </Text>
          <Field label="Confirme com sua senha" value={deletePw} onChangeText={setDeletePw} secureTextEntry />
          <Button
            title="Excluir minha conta"
            kind="danger"
            loading={busy === 'delete'}
            disabled={!deletePw}
            onPress={async () => {
              if (!(await confirm('Excluir conta?', 'Todos os seus dados serão apagados para sempre.', 'Excluir'))) return;
              setBusy('delete');
              try {
                await del('/me', { password: deletePw });
                await signOut();
              } catch (err) {
                notify('Não foi possível excluir', errorText(err));
              } finally {
                setBusy(null);
              }
            }}
          />
        </Card>
      </Section>

      <Text variant="small" faint style={{ textAlign: 'center' }}>
        FORJA {version} · exercícios do catálogo openGym (AGPL-3.0; textos ExerciseDB sob MIT)
      </Text>
    </Screen>
  );
}
