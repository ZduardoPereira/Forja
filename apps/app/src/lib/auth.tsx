import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, get, post, session } from './api';
import type { Me } from './types';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthCtx {
  status: Status;
  me: Me | null;
  signIn(name: string, password: string): Promise<void>;
  signUp(name: string, password: string, inviteCode?: string): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
  setMe(me: Me): void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await get<Me>('/me'));
      setStatus('signedIn');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await session.setToken(null);
        setMe(null);
        setStatus('signedOut');
      } else if (session.token()) {
        // Servidor fora do ar: mantém a sessão e tenta de novo depois.
        setStatus('signedIn');
      } else setStatus('signedOut');
    }
  }, []);

  useEffect(() => {
    session.onUnauthorized(() => {
      void session.setToken(null);
      setMe(null);
      setStatus('signedOut');
    });
    void (async () => {
      if (await session.load()) await refresh();
      else setStatus('signedOut');
    })();
  }, [refresh]);

  const value = useMemo<AuthCtx>(
    () => ({
      status,
      me,
      refresh,
      setMe,
      async signIn(name, password) {
        const res = await post<{ token: string; user: Me }>('/auth/login', { name, password });
        await session.setToken(res.token);
        setMe(res.user);
        setStatus('signedIn');
      },
      async signUp(name, password, inviteCode) {
        const res = await post<{ token: string; user: Me }>('/auth/register', { name, password, inviteCode: inviteCode || undefined });
        await session.setToken(res.token);
        setMe(res.user);
        setStatus('signedIn');
      },
      async signOut() {
        await post('/auth/logout').catch(() => undefined);
        await session.setToken(null);
        qc.clear();
        setMe(null);
        setStatus('signedOut');
      },
    }),
    [status, me, refresh, qc],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
