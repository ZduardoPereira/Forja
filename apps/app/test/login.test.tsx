import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Text } from 'react-native';
import Login from '@/app/login';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ME, mockFetch, Providers } from './helpers';

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: string }) => {
    const { Text: T } = require('react-native');
    return <T>{children}</T>;
  },
}));

function Status() {
  const { status, me } = useAuth();
  return <Text testID="status">{`${status}:${me?.name ?? '-'}`}</Text>;
}

describe('entrar com nome e senha', () => {
  it('valida, envia nome e senha e guarda a sessão', async () => {
    const fetch = mockFetch({
      'GET /v1/auth/config': { inviteRequired: true, hasUsers: true, strava: false },
      'POST /v1/auth/login': (init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        return body.password === 'segredo1' ? { body: { token: 'tok-123', user: ME } } : { status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'Nome ou senha incorretos' } } };
      },
    });
    await render(
      <Providers>
        <AuthProvider>
          <Login />
          <Status />
        </AuthProvider>
      </Providers>,
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signedOut:-'));

    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(screen.getByTestId('login-error')).toHaveTextContent('Informe seu nome');

    await fireEvent.changeText(screen.getByTestId('login-name'), 'Ana');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'errada');
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('Nome ou senha incorretos')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('login-password'), 'segredo1');
    await fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signedIn:Ana'));
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('forja.token', 'tok-123');
    const call = fetch.mock.calls.find(([url, init]) => String(url).endsWith('/v1/auth/login') && JSON.parse(String(init?.body)).password === 'segredo1');
    expect(JSON.parse(String(call![1]!.body))).toEqual({ name: 'Ana', password: 'segredo1' });
  });
});
