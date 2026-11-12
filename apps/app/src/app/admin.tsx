import { ACTIVITY_KINDS, ACTIVITY_LABELS, type ActivityKind, announcementSchema } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ACTIVITY_EMOJI } from '@/components/activity';
import { confirm, DateField, notify } from '@/components/forms';
import { Avatar, Button, Card, Chip, Divider, ErrorBox, Field, Flame, IconButton, ListItem, Loading, Row, Screen, Section, Stat, Text } from '@/components/ui';
import { del, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, errorText, num, today } from '@/lib/format';
import { ACTIVITY_KEYS, invalidate, useAdminActivity, useAdminOverview, useMembers } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const mb = (b: number) => `${num(b / 1024 / 1024, 1)} MB`;
const uptime = (s: number) => (s >= 86_400 ? `${Math.floor(s / 86_400)} d ${Math.floor((s % 86_400) / 3600)} h` : s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)} min`);

const TESTS = [
  { type: 'simple', label: 'Teste simples' },
  { type: 'event', label: 'Treino marcado' },
  { type: 'leader_gain', label: 'Assumiu o 1º lugar' },
  { type: 'leader_loss', label: 'Perdeu o 1º lugar' },
  { type: 'streak_reminder', label: 'Lembrete da sequência' },
] as const;

function Overview() {
  const o = useAdminOverview(true);
  if (o.isLoading) return <Loading />;
  if (o.error) return <ErrorBox error={o.error} onRetry={() => void o.refetch()} />;
  const d = o.data!;
  return (
    <Card>
      <Row wrap gap={space.lg} style={{ alignItems: 'flex-start' }}>
        <Stat label="Pessoas" value={String(d.counts.members)} />
        <Stat label="Atividades" value={String(d.counts.activities)} hint={`${d.counts.sessions} pelo assistente`} />
        <Stat label="Aparelhos com push" value={String(d.counts.pushDevices)} />
      </Row>
      <Text variant="small" muted>
        Versão {d.version} · no ar há {uptime(d.uptimeSec)} · Node {d.node} · fuso {d.timezone}
      </Text>
      <Text variant="small" muted>
        Banco {mb(d.storage.dbBytes)} · fotos {mb(d.storage.uploadsBytes)} ({d.counts.photos}) · {d.counts.chatMessages} mensagens · {d.counts.tests} testes · {d.counts.weighIns} pesagens
      </Text>
      <Text variant="small" muted>
        {d.backup ? `Último backup: ${d.backup.name} (${mb(d.backup.sizeBytes)}) em ${new Date(d.backup.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Backup: não encontrado (rode "npm run pc:backup" no PC do servidor)'}
      </Text>
      <Button title="Atualizar" icon="refresh-cw" small kind="ghost" onPress={() => void o.refetch()} />
    </Card>
  );
}

function Announce() {
  const { c } = useTheme();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (b: unknown) => post<{ sent: number }>('/admin/announce', b),
    onSuccess: (r) => {
      setTitle('');
      setBody('');
      setMsg(`Aviso enviado para ${r.sent} ${r.sent === 1 ? 'pessoa' : 'pessoas'}.`);
      void invalidate([['notifications'], ['notifications-unread']]);
    },
    onError: (err) => setMsg(errorText(err)),
  });
  return (
    <Card>
      <Field label="Título" value={title} onChangeText={setTitle} placeholder="Ex.: Treinão de sábado" maxLength={80} />
      <Field label="Mensagem" value={body} onChangeText={setBody} placeholder="Ex.: Sábado às 8h no parque. Quem vem?" multiline maxLength={400} />
      {msg ? <Text variant="small" color={send.isError ? c.danger : c.success}>{msg}</Text> : null}
      <Button
        title="Mandar para o grupo todo"
        icon="send"
        small
        loading={send.isPending}
        onPress={async () => {
          const parsed = announcementSchema.safeParse({ title: title.trim(), body: body.trim() });
          if (!parsed.success) return setMsg(parsed.error.issues[0]!.message);
          if (await confirm('Mandar aviso?', 'Todo mundo do grupo recebe a notificação.', 'Mandar')) send.mutate(parsed.data);
        }}
      />
    </Card>
  );
}

function FixStreak() {
  const members = useMembers();
  const [who, setWho] = useState<string | null>(null);
  const activity = useAdminActivity(who);
  const [day, setDay] = useState(today());
  const [kind, setKind] = useState<ActivityKind>('other');
  const refresh = () => invalidate([...ACTIVITY_KEYS, ['admin-activity', who ?? '']]);
  const add = useMutation({ mutationFn: () => post(`/admin/members/${who}/activity`, { date: day, kind }), onSuccess: refresh, onError: (err) => notify('Erro', errorText(err)) });
  const remove = useMutation({ mutationFn: (id: string) => del(`/admin/logs/${id}`), onSuccess: refresh, onError: (err) => notify('Erro', errorText(err)) });
  return (
    <Card>
      <Text variant="small" muted>
        Alguém treinou e esqueceu de marcar (ou marcou errado)? Escolha a pessoa, veja os dias e corrija. Aqui vale qualquer data até hoje.
      </Text>
      <Row wrap>
        {(members.data ?? []).map((m) => (
          <Chip key={m.id} label={m.name.split(' ')[0]!} selected={who === m.id} onPress={() => setWho(m.id)} />
        ))}
      </Row>
      {who && activity.isLoading ? <Loading /> : null}
      {who && activity.data ? (
        <>
          <Row gap={space.md}>
            <Avatar name={activity.data.user.name} size={32} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {activity.data.user.name}
            </Text>
            <Flame n={activity.data.streak.current} />
          </Row>
          <DateField label="Dia" value={day} onChange={setDay} />
          <Row wrap>
            {ACTIVITY_KINDS.map((k) => (
              <Chip key={k} label={`${ACTIVITY_EMOJI[k]} ${ACTIVITY_LABELS[k]}`} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </Row>
          <Button title="Marcar atividade neste dia" icon="plus" small loading={add.isPending} onPress={() => add.mutate()} />
          <Text variant="caption" muted>
            Últimos 60 dias
          </Text>
          {activity.data.logs.length ? (
            activity.data.logs.map((l, i) => (
              <View key={l.id}>
                {i ? <Divider /> : null}
                <ListItem
                  title={`${date(l.date)} · ${ACTIVITY_EMOJI[l.kind as ActivityKind] ?? '✨'} ${l.title ?? ACTIVITY_LABELS[l.kind as ActivityKind] ?? l.kind}`}
                  subtitle={l.source === 'admin' ? 'marcado por administrador' : l.source === 'session' ? 'assistente de treino' : 'marcado pela pessoa'}
                  right={
                    <IconButton
                      icon="trash-2"
                      size={16}
                      label="Apagar atividade"
                      onPress={async () => {
                        if (await confirm('Apagar atividade?', `${date(l.date)} deixa de contar para a sequência de ${activity.data!.user.name}.`, 'Apagar')) remove.mutate(l.id);
                      }}
                    />
                  }
                />
              </View>
            ))
          ) : (
            <Text muted>Nenhuma atividade nos últimos 60 dias.</Text>
          )}
        </>
      ) : null}
    </Card>
  );
}

export default function Admin() {
  const { me } = useAuth();
  const [last, setLast] = useState<string | null>(null);
  const test = useMutation({
    mutationFn: (type: string) => post<{ devices: number }>('/admin/test-notification', { type }),
    onSuccess: (r) => {
      setLast(r.devices ? `Enviada para o sininho e para ${r.devices} ${r.devices === 1 ? 'aparelho' : 'aparelhos'} seus.` : 'Enviada para o sininho. Nenhum aparelho seu ativou as notificações ainda (Notificações → Ativar).');
      void invalidate([['notifications'], ['notifications-unread']]);
    },
    onError: (err) => setLast(errorText(err)),
  });
  const check = useMutation({ mutationFn: () => post('/admin/rankings/check'), onSuccess: () => setLast('Rankings conferidos: se alguém assumiu o 1º lugar, o aviso já saiu.'), onError: (err) => setLast(errorText(err)) });
  if (me && !me.isAdmin) return <Redirect href="/" />;
  return (
    <Screen>
      <Text muted>Ferramentas para cuidar do grupo e testar o app. Só administradores veem esta tela.</Text>
      <Section title="Servidor">
        <Overview />
      </Section>
      <Section title="Aviso para o grupo">
        <Announce />
      </Section>
      <Section title="Testar notificações (só você recebe)">
        <Card>
          <Row wrap gap={space.sm}>
            {TESTS.map((t) => (
              <Button key={t.type} title={t.label} small kind="secondary" onPress={() => test.mutate(t.type)} />
            ))}
          </Row>
          <Button title="Conferir líderes dos rankings agora" icon="award" small kind="ghost" loading={check.isPending} onPress={() => check.mutate()} />
          {last ? <Text variant="small">{last}</Text> : null}
        </Card>
      </Section>
      <Section title="Corrigir a sequência de alguém">
        <FixStreak />
      </Section>
      <Section title="Pessoas e moderação">
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          <ListItem title="Pessoas do grupo" subtitle="Senha temporária, tornar administrador e remover" onPress={() => router.push('/members')} />
          <Divider />
          <ListItem title="Apagar mensagem do chat" subtitle="No chat, toque e segure a mensagem (vale para qualquer pessoa)" />
          <Divider />
          <ListItem title="Cancelar ou editar treino marcado" subtitle="Abra o treino na agenda: como administrador você pode mudar qualquer um" onPress={() => router.push('/agenda')} />
        </Card>
      </Section>
    </Screen>
  );
}
