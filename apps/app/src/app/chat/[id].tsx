import { type InfiniteData, useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirm, pickAndUpload } from '@/components/forms';
import { Avatar, Button, ErrorBox, IconButton, Loading, Text } from '@/components/ui';
import { absoluteUrl, del, get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorText, relativeDay, time } from '@/lib/format';
import { invalidate, queryClient, useChatRooms } from '@/lib/queries';
import { onChatDeleted, onChatMessage } from '@/lib/realtime';
import type { ChatMessage, FileRef } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { CONTENT_MAX, radius, space, type } from '@/theme/tokens';

const PAGE = 40;
type Pages = InfiniteData<ChatMessage[], string | undefined>;

function dropMessage(roomId: string, messageId: string) {
  queryClient.setQueryData<Pages>(['chat-messages', roomId], (old) => (old ? { ...old, pages: old.pages.map((p) => p.filter((x) => x.id !== messageId)) } : old));
}

function addMessage(roomId: string, m: ChatMessage) {
  queryClient.setQueryData<Pages>(['chat-messages', roomId], (old) => {
    if (!old) return old;
    if (old.pages.some((p) => p.some((x) => x.id === m.id))) return old;
    const [first = [], ...rest] = old.pages;
    return { ...old, pages: [[m, ...first], ...rest] };
  });
}

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { c } = useTheme();
  const headerHeight = useHeaderHeight();
  const rooms = useChatRooms();
  const room = rooms.data?.find((r) => r.id === id);
  const [text, setText] = useState('');
  const [image, setImage] = useState<FileRef | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messages = useInfiniteQuery({
    queryKey: ['chat-messages', id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => get<ChatMessage[]>(`/chat/rooms/${id}/messages`, { before: pageParam, limit: PAGE }),
    getNextPageParam: (last) => (last.length < PAGE ? undefined : last.at(-1)!.createdAt),
  });
  const list = useMemo(() => messages.data?.pages.flat() ?? [], [messages.data]);

  const markRead = () => {
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      void post(`/chat/rooms/${id}/read`).then(() => invalidate([['chat-rooms'], ['home']]));
    }, 400);
  };

  useEffect(() => {
    markRead();
    const off = onChatMessage((m) => {
      if (m.roomId !== id) return;
      addMessage(id, m);
      markRead();
    });
    const offDeleted = onChatDeleted((roomId, messageId) => roomId === id && dropMessage(id, messageId));
    return () => {
      off();
      offDeleted();
      if (readTimer.current) clearTimeout(readTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const send = useMutation({
    mutationFn: () => post<ChatMessage>(`/chat/rooms/${id}/messages`, { text: text.trim(), fileId: image?.id ?? null }),
    onSuccess: (m) => {
      addMessage(id, m);
      setText('');
      setImage(null);
      setError(null);
      void invalidate([['chat-rooms']]);
    },
    onError: (err) => setError(errorText(err)),
  });

  const attach = async () => {
    setUploading(true);
    setError(null);
    try {
      const [f] = await pickAndUpload('chat');
      if (f) setImage(f);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
    }
  };

  const canSend = (text.trim().length > 0 || !!image) && !send.isPending && !uploading;

  // Toque longo: apagar a própria mensagem (o administrador apaga qualquer uma).
  const askDelete = async (m: ChatMessage) => {
    if (m.userId !== me?.id && !me?.isAdmin) return;
    const mine = m.userId === me?.id;
    if (!(await confirm('Apagar mensagem?', mine ? 'Ela some para todo mundo.' : 'Você é administrador: a mensagem some para todo mundo.', 'Apagar'))) return;
    try {
      await del(`/chat/messages/${m.id}`);
      dropMessage(id, m.id);
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: room?.title ?? 'Conversa',
          headerRight: room?.eventId ? () => <Button title="Ver treino" kind="ghost" small onPress={() => router.push(`/events/${room.eventId}`)} /> : undefined,
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'} keyboardVerticalOffset={Platform.OS === 'web' ? 0 : headerHeight}>
        <View style={{ flex: 1, width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' }}>
          {messages.isLoading ? (
            <Loading />
          ) : messages.error ? (
            <ErrorBox error={messages.error} onRetry={() => void messages.refetch()} />
          ) : (
            <FlatList
              inverted
              data={list}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{ padding: space.lg, gap: 2 }}
              onEndReached={() => messages.hasNextPage && !messages.isFetchingNextPage && void messages.fetchNextPage()}
              onEndReachedThreshold={0.3}
              ListFooterComponent={messages.isFetchingNextPage ? <ActivityIndicator color={c.textMuted} style={{ margin: space.md }} /> : undefined}
              ListEmptyComponent={
                <View style={{ padding: space.xl, alignItems: 'center' }}>
                  <Text muted>Nenhuma mensagem ainda. Diga oi!</Text>
                </View>
              }
              renderItem={({ item, index }) => {
                const mine = item.userId === me?.id;
                const older = list[index + 1];
                const newer = list[index - 1];
                const firstOfGroup = !older || older.userId !== item.userId || Date.parse(item.createdAt) - Date.parse(older.createdAt) > 10 * 60_000;
                const lastOfGroup = !newer || newer.userId !== item.userId;
                const dayChange = !older || relativeDay(older.createdAt) !== relativeDay(item.createdAt);
                return (
                  <View>
                    {dayChange ? (
                      <Text variant="caption" faint style={{ textAlign: 'center', marginVertical: space.md }}>
                        {relativeDay(item.createdAt)}
                      </Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: space.sm, marginTop: firstOfGroup ? space.sm : 0 }}>
                      {!mine ? <View style={{ width: 28 }}>{lastOfGroup ? <Avatar name={item.author?.name ?? '?'} file={item.author?.avatar} size={28} /> : null}</View> : null}
                      <Pressable onLongPress={() => void askDelete(item)} delayLongPress={450} style={{ maxWidth: '78%', gap: 2 }} accessibilityHint={item.userId === me?.id || me?.isAdmin ? 'Toque longo para apagar' : undefined}>
                        {!mine && firstOfGroup ? (
                          <Text variant="small" muted style={{ marginLeft: 4 }}>
                            {item.author?.name}
                          </Text>
                        ) : null}
                        <View
                          style={{
                            backgroundColor: mine ? c.primary : c.surfaceAlt,
                            borderRadius: radius.lg,
                            borderBottomRightRadius: mine && lastOfGroup ? 6 : radius.lg,
                            borderBottomLeftRadius: !mine && lastOfGroup ? 6 : radius.lg,
                            padding: item.image && !item.text ? 4 : 0,
                            overflow: 'hidden',
                          }}
                        >
                          {item.image ? (
                            <Pressable onPress={() => setViewer(absoluteUrl(item.image!.url) ?? null)} accessibilityRole="imagebutton" accessibilityLabel="Abrir foto">
                              <Image source={{ uri: absoluteUrl(item.image.thumbUrl) }} style={{ width: 220, height: 220, borderRadius: radius.md }} contentFit="cover" />
                            </Pressable>
                          ) : null}
                          {item.text ? (
                            <Text color={mine ? c.onPrimary : c.text} style={{ paddingHorizontal: space.md, paddingVertical: 8 }} selectable>
                              {item.text}
                            </Text>
                          ) : null}
                        </View>
                        {lastOfGroup ? (
                          <Text variant="small" faint style={{ fontSize: 11, textAlign: mine ? 'right' : 'left', marginHorizontal: 4 }}>
                            {time(item.createdAt)}
                          </Text>
                        ) : null}
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />
          )}

          {error ? (
            <Text variant="small" color={c.danger} style={{ paddingHorizontal: space.lg }}>
              {error}
            </Text>
          ) : null}
          {image ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm }}>
              <Image source={{ uri: absoluteUrl(image.thumbUrl) }} style={{ width: 56, height: 56, borderRadius: radius.sm }} />
              <IconButton icon="x" label="Remover foto" onPress={() => setImage(null)} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
            {uploading ? <ActivityIndicator color={c.textMuted} style={{ padding: 8 }} /> : <IconButton icon="image" label="Enviar foto" onPress={attach} color={c.textMuted} />}
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Mensagem"
              placeholderTextColor={c.textFaint}
              multiline
              // No navegador o campo começa com 1 linha (no Android ele cresce sozinho).
              {...(Platform.OS === 'web' ? { numberOfLines: 1 } : {})}
              maxLength={2000}
              accessibilityLabel="Mensagem"
              onKeyPress={(e) => {
                // No PC, Enter envia e Shift+Enter quebra a linha.
                const ev = e as unknown as { nativeEvent: { key: string; shiftKey?: boolean }; preventDefault?: () => void };
                if (Platform.OS === 'web' && ev.nativeEvent.key === 'Enter' && !ev.nativeEvent.shiftKey) {
                  ev.preventDefault?.();
                  if (canSend) send.mutate();
                }
              }}
              style={[type.body, { flex: 1, maxHeight: 120, minHeight: 42, color: c.text, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, paddingHorizontal: space.md, paddingTop: 10, paddingBottom: 10 }]}
            />
            <IconButton icon="send" label="Enviar" onPress={() => canSend && send.mutate()} color={canSend ? c.accent : c.textFaint} />
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setViewer(null)} accessibilityLabel="Fechar foto">
          {viewer ? <Image source={{ uri: viewer }} style={{ width: '100%', height: '85%' }} contentFit="contain" /> : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
