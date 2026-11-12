import { router } from 'expo-router';
import { View } from 'react-native';
import { Badge, Card, Divider, Empty, ErrorBox, Icon, ListItem, Loading, Row, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { relativeDay, time } from '@/lib/format';
import { useChatRooms } from '@/lib/queries';
import type { ChatRoom } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

function preview(r: ChatRoom, myId: string | undefined) {
  const m = r.lastMessage;
  if (!m) return r.kind === 'group' ? 'Conversa de todo o grupo' : 'Sem mensagens ainda';
  const who = m.userId === myId ? 'Você' : (m.author?.name.split(' ')[0] ?? '');
  return `${who}: ${m.text || '📷 Foto'}`;
}

export default function ChatList() {
  const rooms = useChatRooms();
  const { me } = useAuth();
  const { c } = useTheme();
  const list = rooms.data ?? [];
  const group = list.filter((r) => r.kind === 'group');
  const events = list.filter((r) => r.kind === 'event');
  const row = (r: ChatRoom) => (
    <ListItem
      key={r.id}
      testID={`room-${r.id}`}
      left={
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: r.kind === 'group' ? c.accentSoft : c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={r.kind === 'group' ? 'users' : 'calendar'} color={r.kind === 'group' ? c.accent : c.textMuted} size={18} />
        </View>
      }
      title={r.title}
      subtitle={preview(r, me?.id)}
      right={
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {r.lastMessage ? (
            <Text variant="small" faint>
              {relativeDay(r.lastMessage.createdAt) === 'Hoje' ? time(r.lastMessage.createdAt) : relativeDay(r.lastMessage.createdAt)}
            </Text>
          ) : null}
          {r.unread ? <Badge label={String(r.unread)} tone="accent" /> : r.eventCancelled ? <Badge label="Cancelado" tone="danger" /> : null}
        </View>
      }
      onPress={() => router.push(`/chat/${r.id}`)}
    />
  );
  return (
    <Screen refreshing={rooms.isRefetching} onRefresh={() => void rooms.refetch()}>
      {rooms.isLoading ? <Loading /> : rooms.error ? <ErrorBox error={rooms.error} onRetry={() => void rooms.refetch()} /> : null}
      {group.length ? (
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          {group.map(row)}
        </Card>
      ) : null}
      {events.length ? (
        <View style={{ gap: space.md }}>
          <Row>
            <Text variant="caption" muted>
              Conversas dos treinos marcados
            </Text>
          </Row>
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {events.map((r, i) => (
              <View key={r.id}>
                {i ? <Divider /> : null}
                {row(r)}
              </View>
            ))}
          </Card>
        </View>
      ) : rooms.data ? (
        <Empty icon="message-circle" title="Cada treino marcado ganha uma conversa" message="Combine os detalhes ali, sem poluir o chat do grupo." />
      ) : null}
    </Screen>
  );
}
