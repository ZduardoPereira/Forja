import { router } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Icon, type IconName, Text, useWide } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useChatRooms } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';

const ICONS: Record<string, IconName> = { index: 'home', treinos: 'calendar', ranking: 'award', chat: 'message-circle', perfil: 'user' };

function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { c } = useTheme();
  const wide = useWide();
  const { me } = useAuth();

  const items = state.routes.map((route, index) => {
    const focused = index === state.index;
    const opts = descriptors[route.key]!.options;
    const label = typeof opts.title === 'string' ? opts.title : route.name;
    const badge = typeof opts.tabBarBadge === 'number' ? opts.tabBarBadge : undefined;
    const onPress = () => {
      const ev = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !ev.defaultPrevented) navigateToTab(route.key);
    };
    return { key: route.key, name: route.name, label, focused, badge, onPress };
  });

  if (wide) {
    return (
      <View style={{ width: 232, paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.md, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: c.border, backgroundColor: c.bg, gap: space.xl }}>
        <Text variant="title" style={{ paddingHorizontal: space.md, letterSpacing: 2, fontFamily: font.bold }}>
          FORJA
        </Text>
        <View role="tablist" style={{ gap: 2, flex: 1 }}>
          {items.map((it) => (
            <Pressable
              key={it.key}
              role="tab"
              accessibilityState={{ selected: it.focused }}
              accessibilityLabel={it.badge ? `${it.label}, ${it.badge} não lidas` : it.label}
              onPress={it.onPress}
              style={({ hovered }: { hovered?: boolean }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingHorizontal: space.md,
                minHeight: 42,
                borderRadius: radius.md,
                backgroundColor: it.focused ? c.surfaceAlt : hovered ? c.surface : 'transparent',
              })}
            >
              {it.name === 'perfil' && me ? <Avatar name={me.name} file={me.avatar} size={22} /> : <Icon name={ICONS[it.name] ?? 'circle'} color={it.focused ? c.text : c.textMuted} size={18} />}
              <Text variant="bodyStrong" color={it.focused ? c.text : c.textMuted} style={{ flex: 1 }}>
                {it.name === 'perfil' && me ? me.name : it.label}
              </Text>
              {it.badge ? <Badge n={it.badge} /> : null}
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, minHeight: 40 }}>
          <Icon name="settings" color={c.textMuted} size={18} />
          <Text variant="bodyStrong" muted>
            Configurações
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View role="tablist" style={{ flexDirection: 'row', paddingBottom: Math.max(insets.bottom, space.sm), paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.bg }}>
      {items.map((it) => (
        <Pressable
          key={it.key}
          role="tab"
          accessibilityState={{ selected: it.focused }}
          accessibilityLabel={it.badge ? `${it.label}, ${it.badge} não lidas` : it.label}
          onPress={it.onPress}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48 }}
        >
          <View>
            {it.name === 'perfil' && me ? (
              <View style={{ borderRadius: 13, borderWidth: 1.5, borderColor: it.focused ? c.text : 'transparent', padding: 1 }}>
                <Avatar name={me.name} file={me.avatar} size={20} />
              </View>
            ) : (
              <Icon name={ICONS[it.name] ?? 'circle'} color={it.focused ? c.text : c.textFaint} size={21} />
            )}
            {it.badge ? (
              <View style={{ position: 'absolute', top: -4, right: -10 }}>
                <Badge n={it.badge} />
              </View>
            ) : null}
          </View>
          <Text variant="small" color={it.focused ? c.text : c.textFaint} style={{ fontSize: 11, lineHeight: 13, fontFamily: it.focused ? font.semibold : font.medium }}>
            {it.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Badge({ n }: { n: number }) {
  const { c } = useTheme();
  return (
    <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 10, lineHeight: 12 }} color={c.onAccent}>
        {n > 99 ? '99+' : n}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const wide = useWide();
  const { c } = useTheme();
  const rooms = useChatRooms();
  const unread = (rooms.data ?? []).reduce((a, r) => a + r.unread, 0);
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: wide ? 'left' : 'bottom',
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início' }} />
      <Tabs.Screen name="treinos" options={{ title: 'Treinos' }} />
      <Tabs.Screen name="ranking" options={{ title: 'Ranking' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarBadge: unread || undefined }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
