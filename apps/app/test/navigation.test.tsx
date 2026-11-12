import { Slot } from 'expo-router';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { TabHeader } from '@/components/activity';
import TabsLayout from '@/app/(tabs)/_layout';
import { ME, mockFetch, Providers } from './helpers';

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ status: 'signedIn', me: require('./helpers').ME }),
}));

/** Abas principais: Início, Treinar, Dieta, Ranking e Perfil; chat e notificações no topo de cada aba. */
describe('navegação principal', () => {
  const routes = {
    _layout: () => (
      <Providers>
        <Slot />
      </Providers>
    ),
    '(tabs)/_layout': TabsLayout,
    '(tabs)/index': () => <TabHeader title="tela-inicio" />,
    '(tabs)/treinar': () => <Text>tela-treinar</Text>,
    '(tabs)/dieta': () => <Text>tela-dieta</Text>,
    '(tabs)/ranking': () => <Text>tela-ranking</Text>,
    '(tabs)/perfil': () => <Text>tela-perfil</Text>,
    chat: () => <Text>tela-chat</Text>,
    notificacoes: () => <Text>tela-notificacoes</Text>,
  };

  it('mostra as 5 abas, navega e leva ao chat e às notificações pelo topo', async () => {
    mockFetch({
      'GET /v1/chat/rooms': [
        { id: 'r1', kind: 'group', title: 'Grupo', unread: 3, lastMessage: null, eventId: null, eventStartsAt: null, eventCancelled: false },
        { id: 'r2', kind: 'event', title: 'Corrida', unread: 2, lastMessage: null, eventId: 'e1', eventStartsAt: null, eventCancelled: false },
      ],
      'GET /v1/notifications/unread': { count: 2 },
    });
    await renderRouter(routes, { initialUrl: '/' });
    expect(screen.getByText('tela-inicio')).toBeTruthy();
    for (const label of ['Início', 'Treinar', 'Dieta', 'Ranking', 'Perfil']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(await screen.findByLabelText('Chat, 5 não lidas')).toBeTruthy();
    expect(await screen.findByLabelText('Notificações, 2 novas')).toBeTruthy();

    await fireEvent.press(screen.getByText('Dieta'));
    expect(await screen.findByText('tela-dieta')).toBeTruthy();
    expect(screen).toHavePathname('/dieta');
    await fireEvent.press(screen.getByText('Ranking'));
    expect(screen).toHavePathname('/ranking');
    await fireEvent.press(screen.getByLabelText('Perfil'));
    expect(screen).toHavePathname('/perfil');
    expect(ME.name).toBe('Ana');

    await fireEvent.press(screen.getByText('Início'));
    await fireEvent.press(await screen.findByLabelText('Notificações, 2 novas'));
    expect(await screen.findByText('tela-notificacoes')).toBeTruthy();
  });
});
