import { NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_LABELS, type NotificationCategory } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';
import { Avatar, Button, Card, Divider, Empty, ErrorBox, Icon, type IconName, Loading, Row, Screen, Section, Text } from '@/components/ui';
import { post, put } from '@/lib/api';
import { errorText, relativeDay, time } from '@/lib/format';
import { invalidate, useNotifications, useNotifyPrefs } from '@/lib/queries';
import { disablePush, enablePush, isIos, pushState, type PushState } from '@/lib/push';
import type { AppNotification } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const CATEGORY_ICON: Record<NotificationCategory, IconName> = { events: 'calendar', chat: 'message-circle', ranking: 'award', streak: 'zap', group: 'users' };

/** Ligar as notificações neste aparelho (navegador / app instalado pelo navegador). */
function DeviceCard() {
  const prefs = useNotifyPrefs();
  const { c } = useTheme();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void pushState().then(setState);
  }, []);

  if (Platform.OS !== 'web') {
    return (
      <Card>
        <Text variant="heading">Avisos neste celular</Text>
        <Text variant="small" muted>
          No app Android, os avisos aparecem aqui no sininho e no topo da tela enquanto o app está aberto. Para receber com o app fechado, use o FORJA instalado pelo Chrome (abra o endereço do grupo → menu ⋮ → "Instalar app") e ative as notificações lá.
        </Text>
      </Card>
    );
  }
  if (!state) return null;
  const toggle = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (state === 'on') {
        await disablePush();
        setMsg('Notificações desligadas neste aparelho.');
      } else {
        await enablePush(prefs.data?.publicKey ?? '');
        await post('/push/test');
        setMsg('Pronto! Mandamos uma notificação de teste.');
      }
      setState(await pushState());
      await invalidate([['notify-prefs']]);
    } catch (err) {
      setMsg(err instanceof Error && !('status' in err) ? err.message : errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ borderColor: state === 'on' ? c.success : c.accent, borderWidth: 1 }}>
      <Row gap={space.md}>
        <Icon name={state === 'on' ? 'bell' : 'bell-off'} color={state === 'on' ? c.success : c.accent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">{state === 'on' ? 'Notificações ligadas neste aparelho' : 'Receber notificações neste aparelho'}</Text>
          <Text variant="small" muted>
            {state === 'needs-install'
              ? 'No iPhone: toque em Compartilhar (□↑) → "Adicionar à Tela de Início", abra o FORJA pelo ícone novo e volte aqui para ativar.'
              : state === 'denied'
                ? 'As notificações do FORJA estão bloqueadas no navegador. Libere em: cadeado da barra de endereço → Notificações → Permitir.'
                : state === 'unsupported'
                  ? 'Este navegador não recebe notificações. Use o Chrome (Android/PC) ou o Safari do iPhone com o app na Tela de Início.'
                  : state === 'on'
                    ? 'Os avisos chegam mesmo com o app fechado.'
                    : isIos()
                      ? 'Os avisos chegam mesmo com o FORJA fechado (iOS 16.4 ou mais novo).'
                      : 'Treino marcado, mensagens, 1º lugar nos rankings e lembrete da sequência, mesmo com o app fechado.'}
          </Text>
        </View>
      </Row>
      {state === 'on' || state === 'off' ? <Button title={state === 'on' ? 'Desligar neste aparelho' : 'Ativar notificações'} kind={state === 'on' ? 'secondary' : 'accent'} small loading={busy} onPress={() => void toggle()} /> : null}
      {msg ? <Text variant="small">{msg}</Text> : null}
    </Card>
  );
}

function Categories() {
  const prefs = useNotifyPrefs();
  const save = useMutation({ mutationFn: (p: Partial<Record<NotificationCategory, boolean>>) => put('/notifications/prefs', p), onSuccess: () => invalidate([['notify-prefs']]) });
  if (!prefs.data) return null;
  return (
    <Section title="O que chega no celular/PC">
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {NOTIFICATION_CATEGORIES.map((cat, i) => (
          <View key={cat}>
            {i ? <Divider /> : null}
            <Row gap={space.md} style={{ paddingVertical: space.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{NOTIFICATION_CATEGORY_LABELS[cat].title}</Text>
                <Text variant="small" muted>
                  {NOTIFICATION_CATEGORY_LABELS[cat].hint}
                </Text>
              </View>
              <Switch value={prefs.data.prefs[cat]} onValueChange={(v) => save.mutate({ [cat]: v })} accessibilityLabel={NOTIFICATION_CATEGORY_LABELS[cat].title} />
            </Row>
          </View>
        ))}
      </Card>
      <Text variant="small" faint>
        Tudo continua aparecendo aqui no sininho; isso só escolhe o que vira notificação no aparelho.
      </Text>
    </Section>
  );
}

function Item({ n, unread }: { n: AppNotification; unread: boolean }) {
  const { c } = useTheme();
  const cat = n.category as NotificationCategory;
  return (
    <Pressable
      onPress={() => n.url && router.push(n.url as never)}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Nova: ' : ''}${n.title}. ${n.body}`}
      style={({ pressed }) => ({ flexDirection: 'row', gap: space.md, paddingVertical: space.md, opacity: pressed ? 0.7 : 1 })}
    >
      {n.actor ? (
        <Avatar name={n.actor.name} file={n.actor.avatar} size={38} />
      ) : (
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={CATEGORY_ICON[cat] ?? 'bell'} color={c.accent} size={17} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{n.title}</Text>
        <Text variant="small" muted>
          {n.body}
        </Text>
        <Text variant="small" faint>
          {time(n.createdAt)}
        </Text>
      </View>
      {unread ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.accent, marginTop: 6 }} /> : null}
    </Pressable>
  );
}

export default function Notificacoes() {
  const list = useNotifications();
  const unreadAtOpen = useRef<Set<string> | null>(null);
  const markAll = useMutation({ mutationFn: () => post('/notifications/read', {}), onSuccess: () => invalidate([['notifications-unread'], ['home']]) });
  useEffect(() => {
    if (!list.data || unreadAtOpen.current) return;
    unreadAtOpen.current = new Set(list.data.filter((n) => !n.readAt).map((n) => n.id));
    // Abriu a tela: tudo vira lido (as novas continuam destacadas até sair).
    if (unreadAtOpen.current.size) markAll.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data]);

  const byDay = new Map<string, AppNotification[]>();
  for (const n of list.data ?? []) byDay.set(relativeDay(n.createdAt), [...(byDay.get(relativeDay(n.createdAt)) ?? []), n]);

  return (
    <Screen refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <DeviceCard />
      {list.isLoading ? <Loading /> : list.error ? <ErrorBox error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.data && !list.data.length ? <Empty icon="bell" title="Nenhuma notificação ainda" message="Treinos marcados, 1º lugar nos rankings, marcos de sequência e avisos do grupo aparecem aqui." /> : null}
      {[...byDay.entries()].map(([day, items]) => (
        <Section key={day} title={day}>
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {items.map((n, i) => (
              <View key={n.id}>
                {i ? <Divider /> : null}
                <Item n={n} unread={!n.readAt || !!unreadAtOpen.current?.has(n.id)} />
              </View>
            ))}
          </Card>
        </Section>
      ))}
      <Categories />
    </Screen>
  );
}
