import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/queries';
import { onNotification, RealtimeBridge } from '@/lib/realtime';
import { ToastHost, useToast } from '@/lib/toast';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { font } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Abrir uma tela direto pelo link (ou recarregar a página) mantém as abas embaixo, para o "voltar" funcionar. */
export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <ToastHost>
                <Navigator ready={fontsLoaded || !!fontError} />
              </ToastHost>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Notificação chegando com o app aberto: aviso no topo (menos na própria tela de notificações). */
function NotificationToasts() {
  const toast = useToast();
  const pathname = usePathname();
  useEffect(
    () =>
      onNotification((n) => {
        if (pathname.startsWith('/notificacoes')) return;
        toast({ title: n.title, body: n.body, url: n.url });
      }),
    [toast, pathname],
  );
  return null;
}

function Navigator({ ready }: { ready: boolean }) {
  const { status } = useAuth();
  const { c, scheme } = useTheme();
  const loaded = ready && status !== 'loading';
  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded]);

  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, primary: c.accent, background: c.bg, card: c.bg, text: c.text, border: c.border, notification: c.accent } };
  }, [scheme, c]);

  if (!loaded) return null;
  const signedIn = status === 'signedIn';
  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {signedIn ? <RealtimeBridge /> : null}
      {signedIn ? <NotificationToasts /> : null}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerTitleStyle: { fontFamily: font.semibold, fontSize: 16 },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: c.bg },
          animation: Platform.OS === 'web' ? 'none' : 'slide_from_right',
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'FORJA' }} />
          <Stack.Screen name="events/new" options={{ title: 'Marcar treino' }} />
          <Stack.Screen name="events/[id]" options={{ title: 'Treino' }} />
          <Stack.Screen name="routines/[id]" options={{ title: 'Rotina' }} />
          <Stack.Screen name="routines/edit" options={{ title: 'Editar rotina' }} />
          <Stack.Screen name="exercises/index" options={{ title: 'Exercícios' }} />
          <Stack.Screen name="exercises/[id]" options={{ title: 'Exercício' }} />
          <Stack.Screen name="log" options={{ title: 'Marcar atividade' }} />
          <Stack.Screen name="treino/index" options={{ title: 'Treino', gestureEnabled: false }} />
          <Stack.Screen name="treino/[id]" options={{ title: 'Treino feito' }} />
          <Stack.Screen name="historico" options={{ title: 'Histórico' }} />
          <Stack.Screen name="agenda" options={{ title: 'Treinos marcados' }} />
          <Stack.Screen name="notificacoes" options={{ title: 'Notificações' }} />
          <Stack.Screen name="admin" options={{ title: 'Administração' }} />
          <Stack.Screen name="tutorial" options={{ title: 'Tutorial' }} />
          <Stack.Screen name="chat/index" options={{ title: 'Chat' }} />
          <Stack.Screen name="body/weigh-in" options={{ title: 'Registrar peso' }} />
          <Stack.Screen name="body/assessment" options={{ title: 'Avaliação' }} />
          <Stack.Screen name="body/photos" options={{ title: 'Fotos de progresso' }} />
          <Stack.Screen name="tests/[testId]" options={{ title: 'Teste' }} />
          <Stack.Screen name="strava" options={{ title: 'Strava' }} />
          <Stack.Screen name="diet/edit" options={{ title: 'Dieta' }} />
          <Stack.Screen name="competitions/new" options={{ title: 'Nova competição' }} />
          <Stack.Screen name="competitions/[id]" options={{ title: 'Competição' }} />
          <Stack.Screen name="people/[id]" options={{ title: 'Perfil' }} />
          <Stack.Screen name="chat/[id]" options={{ title: 'Conversa' }} />
          <Stack.Screen name="settings" options={{ title: 'Configurações' }} />
          <Stack.Screen name="members" options={{ title: 'Grupo' }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" options={{ headerShown: false, title: 'Entrar' }} />
          <Stack.Screen name="register" options={{ title: 'Criar conta' }} />
        </Stack.Protected>
      </Stack>
    </NavThemeProvider>
  );
}
