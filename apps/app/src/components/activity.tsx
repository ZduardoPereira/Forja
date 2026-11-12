import { ACTIVITY_KINDS, ACTIVITY_LABELS, type ActivityKind, addDays } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, errorText, today } from '@/lib/format';
import { ACTIVITY_KEYS, invalidate, useActivityCalendar, useActivityGroup, useChatRooms, useUnreadNotifications } from '@/lib/queries';
import { useToast } from '@/lib/toast';
import type { StreakInfo } from '@/lib/types';
import { useWorkout } from '@/lib/workout';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';
import { Avatar, Button, Card, Chip, Empty, Flame, IconButton, Loading, Row, Text, useWide } from './ui';

export const ACTIVITY_EMOJI: Record<ActivityKind, string> = { strength: '🏋️', run: '🏃', functional: '🤸', sport: '⚽', other: '✨' };

/** Cabeçalho das abas: título + atalhos do chat e das notificações (no PC eles ficam na barra lateral). */
export function TabHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const wide = useWide();
  const unread = useUnreadNotifications();
  const rooms = useChatRooms();
  const chat = (rooms.data ?? []).reduce((a, r) => a + r.unread, 0);
  const n = unread.data?.count ?? 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="display" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text muted>{subtitle}</Text> : null}
      </View>
      {right}
      {!wide ? (
        <Row gap={0}>
          <IconButton icon="message-circle" label={chat ? `Chat, ${chat} não lidas` : 'Chat'} badge={chat} size={22} onPress={() => router.push('/chat')} />
          <IconButton icon="bell" label={n ? `Notificações, ${n} novas` : 'Notificações'} badge={n} size={22} onPress={() => router.push('/notificacoes')} />
        </Row>
      ) : null}
    </View>
  );
}

function streakLine(s: StreakInfo): string {
  if (s.doneToday) return s.current === 1 ? 'Primeiro dia! Volte amanhã para a sequência crescer.' : 'Atividade de hoje marcada. Amanhã tem mais!';
  if (s.current > 0) return 'Ainda falta hoje: marque uma atividade até a meia-noite para não zerar.';
  return s.best ? `Sua sequência zerou (recorde: ${s.best}). Comece de novo hoje!` : 'Faça qualquer atividade e marque aqui para começar sua sequência.';
}

/** Cartão da sua sequência com o botão de marcar a atividade do dia. */
export function StreakHero({ streak }: { streak: StreakInfo }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const workout = useWorkout();
  return (
    <Card style={{ borderColor: streak.doneToday ? c.success : streak.current > 0 ? c.warning : c.border, borderWidth: 1 }}>
      <Row gap={space.lg} style={{ alignItems: 'center' }}>
        <View style={{ alignItems: 'center', minWidth: 76 }}>
          <Flame n={streak.current} size="large" active={streak.current > 0} />
          <Text variant="small" muted>
            {streak.current === 1 ? 'dia seguido' : 'dias seguidos'}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="heading">{streak.doneToday ? '✅ Hoje já contou' : streak.current > 0 ? '⏳ Falta marcar hoje' : 'Sua sequência'}</Text>
          <Text variant="small" muted>
            {streakLine(streak)}
          </Text>
          {streak.best > 0 ? (
            <Text variant="small" faint>
              Recorde: {streak.best} {streak.best === 1 ? 'dia' : 'dias'}
            </Text>
          ) : null}
        </View>
      </Row>
      <Row wrap gap={space.sm}>
        <Button title={workout ? 'Continuar treino' : 'Treinar agora'} icon="play" small onPress={() => router.push(workout ? '/treino' : '/treinar')} style={{ flexGrow: 1 }} />
        <Button title={streak.doneToday ? 'Marcar outra atividade' : 'Marcar atividade de hoje'} icon="check-circle" small kind={streak.doneToday ? 'secondary' : 'accent'} onPress={() => setOpen(true)} style={{ flexGrow: 1 }} testID="check-in" />
      </Row>
      <CheckInSheet visible={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

/** Marcar uma atividade (corrida, futebol, treino sem o assistente…) — conta para a sequência. */
export function CheckInSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const t = today();
  const [kind, setKind] = useState<ActivityKind>('strength');
  const [day, setDay] = useState(t);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => post<{ streak: StreakInfo }>('/logs', { date: day, kind, durationMin: minutes }),
    onSuccess: async (r) => {
      await invalidate(ACTIVITY_KEYS);
      onClose();
      setError(null);
      toast({ title: `🔥 Sequência: ${r.streak.current} ${r.streak.current === 1 ? 'dia' : 'dias'}`, body: `${ACTIVITY_EMOJI[kind]} ${ACTIVITY_LABELS[kind]} marcada${day === t ? ' hoje' : ` em ${date(day, true)}`}.`, icon: 'check-circle' });
    },
    onError: (err) => setError(errorText(err)),
  });
  const days = [
    { value: t, label: 'Hoje' },
    { value: addDays(t, -1), label: 'Ontem' },
    { value: addDays(t, -2), label: 'Anteontem' },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={{ backgroundColor: c.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, paddingBottom: space.xl + insets.bottom, gap: space.lg, maxHeight: '85%' }}>
        <ScrollView contentContainerStyle={{ gap: space.lg }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 4 }}>
            <Text variant="title">Marcar atividade</Text>
            <Text variant="small" muted>
              Qualquer atividade conta para a sequência: musculação, corrida, futebol, funcional, caminhada… Para anotar séries e cargas, use o "Treinar agora".
            </Text>
          </View>
          <View style={{ gap: space.sm }}>
            <Text variant="small" muted>
              O que você fez?
            </Text>
            <Row wrap>
              {ACTIVITY_KINDS.map((k) => (
                <Chip key={k} label={`${ACTIVITY_EMOJI[k]} ${ACTIVITY_LABELS[k]}`} selected={kind === k} onPress={() => setKind(k)} />
              ))}
            </Row>
          </View>
          <View style={{ gap: space.sm }}>
            <Text variant="small" muted>
              Quando?
            </Text>
            <Row wrap>
              {days.map((d) => (
                <Chip key={d.value} label={d.label} selected={day === d.value} onPress={() => setDay(d.value)} />
              ))}
            </Row>
            <Text variant="small" faint>
              Esqueceu de marcar? Dá para registrar até 2 dias para trás.
            </Text>
          </View>
          <View style={{ gap: space.sm }}>
            <Text variant="small" muted>
              Quanto tempo? (opcional)
            </Text>
            <Row wrap>
              {[20, 30, 45, 60, 90, 120].map((m) => (
                <Chip key={m} label={`${m} min`} selected={minutes === m} onPress={() => setMinutes(minutes === m ? null : m)} />
              ))}
            </Row>
          </View>
          {error ? <Text color={c.danger}>{error}</Text> : null}
          <Button title="Marcar atividade" icon="check" onPress={() => save.mutate()} loading={save.isPending} testID="check-in-save" />
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Quem já treinou hoje e a sequência de cada um (todo mundo vê). */
export function GroupToday({ limit }: { limit?: number }) {
  const group = useActivityGroup();
  const { me } = useAuth();
  const { c } = useTheme();
  if (group.isLoading) return <Loading />;
  if (!group.data) return null;
  const list = limit ? group.data.members.slice(0, limit) : group.data.members;
  return (
    <Card padded={false} style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
      {list.map((m) => {
        const done = m.streak.doneToday;
        return (
          <Pressable
            key={m.user.id}
            onPress={() => router.push(m.user.id === me?.id ? '/perfil' : `/people/${m.user.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${m.user.name}: ${done ? 'já treinou hoje' : 'ainda não treinou hoje'}, ${m.streak.current} dias seguidos`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}
          >
            <Avatar name={m.user.name} file={m.user.avatar} size={36} online={m.user.online} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {m.user.id === me?.id ? `${m.user.name} (você)` : m.user.name}
              </Text>
              <Text variant="small" color={done ? c.success : c.textFaint} numberOfLines={1}>
                {done ? `✓ Treinou hoje · ${m.todayKinds.map((k) => ACTIVITY_EMOJI[k]).join(' ')}` : m.streak.current > 0 ? 'Ainda não marcou hoje' : 'Sem sequência ativa'}
              </Text>
            </View>
            <Flame n={m.streak.current} />
          </Pressable>
        );
      })}
      {!list.length ? <Empty icon="users" title="Ninguém no grupo ainda" /> : null}
    </Card>
  );
}

const WEEK = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Calendário das últimas 5 semanas: quadradinho cheio = dia com atividade. */
export function ActivityCalendar({ userId, name }: { userId?: string; name?: string }) {
  const cal = useActivityCalendar(userId);
  const { c } = useTheme();
  if (cal.isLoading) return <Loading />;
  if (!cal.data) return null;
  const days = cal.data.days;
  const first = new Date(`${days[0]!.date}T12:00:00`).getDay();
  const cells: ({ date: string; kinds: ActivityKind[] } | null)[] = [...Array.from({ length: first }, () => null), ...days];
  const active = days.filter((d) => d.kinds.length).length;
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <Text variant="caption" muted>
            Últimas 5 semanas
          </Text>
          <Text variant="heading">
            {active} {active === 1 ? 'dia ativo' : 'dias ativos'}
          </Text>
        </View>
        <Flame n={cal.data.streak.current} />
      </Row>
      <View style={{ gap: 4 }} accessible accessibilityLabel={`${name ?? 'Você'}: ${active} dias ativos nas últimas 5 semanas, sequência atual de ${cal.data.streak.current} dias`}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {WEEK.map((w, i) => (
            <Text key={i} variant="caption" faint style={{ flex: 1, textAlign: 'center' }}>
              {w}
            </Text>
          ))}
        </View>
        {Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => (
          <View key={row} style={{ flexDirection: 'row', gap: 4 }}>
            {Array.from({ length: 7 }, (_, col) => {
              const d = cells[row * 7 + col];
              const isToday = d?.date === cal.data.today;
              const on = !!d?.kinds.length;
              return (
                <View
                  key={col}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    maxHeight: 40,
                    borderRadius: 6,
                    backgroundColor: !d ? 'transparent' : on ? c.accent : c.surfaceAlt,
                    borderWidth: isToday ? 2 : 0,
                    borderColor: c.text,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {d ? (
                    <Text style={{ fontSize: 10, fontFamily: font.medium }} color={on ? c.onAccent : c.textFaint}>
                      {Number(d.date.slice(8, 10))}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <Text variant="small" faint>
        Roxo = dia com atividade. O quadrado com borda é hoje.
      </Text>
    </Card>
  );
}
