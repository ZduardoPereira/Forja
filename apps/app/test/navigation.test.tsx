import { Slot } from 'expo-router';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';
import TabsLayout from '@/app/(tabs)/_layout';
import { ME, mockFetch, Providers } from './helpers';

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ status: 'signedIn', me: require('./helpers').ME }),
}));

/** Abas principais: Início, Treinos, Ranking, Chat e Perfil (com não lidas no Chat). */
describe('navegação principal', () => {
  const routes = {
    _layout: () => (
      <Providers>
        <Slot />
      </Providers>
    ),
    '(tabs)/_layout': TabsLayout,
    '(tabs)/index': () => <Text>tela-inicio</Text>,
    '(tabs)/treinos': () => <Text>tela-treinos</Text>,
    '(tabs)/ranking': () => <Text>tela-ranking</Text>,
    '(tabs)/chat': () => <Text>tela-chat</Text>,
    '(tabs)/perfil': () => <Text>tela-perfil</Text>,
  };

  it('mostra as 5 abas, navega e exibe as mensagens não lidas', async () => {
    mockFetch({
      'GET /v1/chat/rooms': [
        { id: 'r1', kind: 'group', title: 'Grupo', unread: 3, lastMessage: null, eventId: null, eventStartsAt: null, eventCancelled: false },
        { id: 'r2', kind: 'event', title: 'Corrida', unread: 2, lastMessage: null, eventId: 'e1', eventStartsAt: null, eventCancelled: false },
      ],
    });
    await renderRouter(routes, { initialUrl: '/' });
    expect(screen.getByText('tela-inicio')).toBeTruthy();
    for (const label of ['Início', 'Treinos', 'Ranking', 'Chat', 'Perfil']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(await screen.findByLabelText('Chat, 5 não lidas')).toBeTruthy();
    await fireEvent.press(screen.getByText('Ranking'));
    expect(await screen.findByText('tela-ranking')).toBeTruthy();
    expect(screen).toHavePathname('/ranking');
    await fireEvent.press(screen.getByLabelText('Perfil'));
    expect(screen).toHavePathname('/perfil');
    expect(ME.name).toBe('Ana');
  });
});
