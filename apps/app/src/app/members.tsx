import { GOAL_LABELS } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { confirm, notify } from '@/components/forms';
import { Avatar, Badge, Button, Card, Divider, ErrorBox, ListItem, Loading, Row, Screen, Text } from '@/components/ui';
import { del, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { invalidate, useMembers } from '@/lib/queries';
import type { Member } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { font, space } from '@/theme/tokens';

function AdminActions({ m }: { m: Member }) {
  const { c } = useTheme();
  const [temp, setTemp] = useState<string | null>(null);
  const reset = useMutation({
    mutationFn: () => post<{ temporaryPassword: string }>(`/admin/members/${m.id}/reset-password`),
    onSuccess: (r) => setTemp(r.temporaryPassword),
    onError: (err) => notify('Erro', errorText(err)),
  });
  const toggleAdmin = useMutation({
    mutationFn: () => post(`/admin/members/${m.id}/admin`, { isAdmin: !m.isAdmin }),
    onSuccess: () => invalidate([['members']]),
    onError: (err) => notify('Erro', errorText(err)),
  });
  const remove = useMutation({
    mutationFn: () => del(`/admin/members/${m.id}`),
    onSuccess: () => invalidate([['members'], ['competition'], ['home']]),
    onError: (err) => notify('Erro', errorText(err)),
  });
  return (
    <View style={{ gap: space.sm, paddingBottom: space.md }}>
      <Row wrap gap={space.sm}>
        <Button
          title="Senha temporária"
          icon="key"
          small
          kind="secondary"
          loading={reset.isPending}
          onPress={async () => {
            if (await confirm(`Gerar senha temporária para ${m.name}?`, 'A senha atual deixa de funcionar e a pessoa é desconectada.', 'Gerar')) reset.mutate();
          }}
        />
        <Button title={m.isAdmin ? 'Tirar admin' : 'Tornar admin'} small kind="ghost" loading={toggleAdmin.isPending} onPress={() => toggleAdmin.mutate()} />
        <Button
          title="Remover"
          small
          kind="danger"
          loading={remove.isPending}
          onPress={async () => {
            if (await confirm(`Remover ${m.name}?`, 'Apaga a conta e todos os dados dessa pessoa. Não dá para desfazer.', 'Remover')) remove.mutate();
          }}
        />
      </Row>
      {temp ? (
        <Card style={{ backgroundColor: c.accentSoft, borderWidth: 0 }}>
          <Text variant="small" muted>
            Passe esta senha para {m.name} (ela deve trocar em Configurações depois de entrar):
          </Text>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 20, letterSpacing: 1 }} selectable>
              {temp}
            </Text>
            <Button title="Copiar" icon="copy" small kind="secondary" onPress={() => void Clipboard.setStringAsync(temp)} />
          </Row>
        </Card>
      ) : null}
    </View>
  );
}

export default function Members() {
  const members = useMembers();
  const { me } = useAuth();
  if (members.isLoading) return <Loading />;
  if (members.error) return <ErrorBox error={members.error} onRetry={() => void members.refetch()} />;
  const list = members.data ?? [];
  return (
    <Screen>
      <Text muted>
        {list.length} {list.length === 1 ? 'pessoa' : 'pessoas'} no grupo. Para alguém novo entrar, passe o endereço do app e o código do grupo.
      </Text>
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {list.map((m, i) => (
          <View key={m.id}>
            {i ? <Divider /> : null}
            <ListItem
              left={<Avatar name={m.name} file={m.avatar} size={38} online={m.online} />}
              title={m.id === me?.id ? `${m.name} (você)` : m.name}
              subtitle={GOAL_LABELS[m.goal]}
              right={m.isAdmin ? <Badge label="Admin" tone="accent" /> : undefined}
              onPress={() => router.push(m.id === me?.id ? '/perfil' : `/people/${m.id}`)}
            />
            {me?.isAdmin && m.id !== me.id ? <AdminActions m={m} /> : null}
          </View>
        ))}
      </Card>
    </Screen>
  );
}
