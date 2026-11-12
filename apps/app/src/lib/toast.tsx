import { router } from 'expo-router';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export interface ToastInput {
  title: string;
  body?: string | null;
  url?: string | null;
  icon?: IconName;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

/** Aviso no topo da tela (notificação chegando com o app aberto, confirmação de ação). Toque abre o link. */
export function ToastHost({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastInput | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { c } = useTheme();

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setCurrent(null));
  }, [anim]);

  const show = useCallback(
    (t: ToastInput) => {
      if (timer.current) clearTimeout(timer.current);
      setCurrent(t);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, 4500);
    },
    [anim, hide],
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {current ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: insets.top + space.sm,
            alignItems: 'center',
            paddingHorizontal: space.md,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
          }}
        >
          <Pressable
            accessibilityRole="alert"
            accessibilityLabel={`${current.title}${current.body ? `. ${current.body}` : ''}`}
            onPress={() => {
              hide();
              if (current.url) router.push(current.url as never);
            }}
            style={{
              width: '100%',
              maxWidth: 520,
              flexDirection: 'row',
              gap: space.md,
              alignItems: 'center',
              padding: space.md,
              borderRadius: radius.lg,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.border,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }}
          >
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={current.icon ?? 'bell'} size={17} color={c.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={2}>
                {current.title}
              </Text>
              {current.body ? (
                <Text variant="small" muted numberOfLines={2}>
                  {current.body}
                </Text>
              ) : null}
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}
