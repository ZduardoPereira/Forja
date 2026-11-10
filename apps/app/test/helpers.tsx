import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/theme/ThemeProvider';

export type Route = (url: string, init: RequestInit) => { status?: number; body?: unknown } | undefined;

/** Substitui o fetch global por respostas fixas por rota ("GET /v1/home"). */
export function mockFetch(routes: Record<string, unknown | ((init: RequestInit) => { status?: number; body?: unknown })>) {
  const fn = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const key = `${init.method ?? 'GET'} ${url.pathname}`;
    const hit = routes[key];
    if (hit === undefined) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: `sem dublê para ${key}` } }), { status: 404 });
    const res = typeof hit === 'function' ? (hit as (i: RequestInit) => { status?: number; body?: unknown })(init) : { status: 200, body: hit };
    return new Response(res.body === undefined ? null : JSON.stringify(res.body), { status: res.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

export function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

export const ME = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Ana',
  isAdmin: true,
  avatar: null,
  avatarFileId: null,
  goal: 'lose_fat',
  sex: 'female',
  birthDate: '1995-03-10',
  heightCm: 165,
  experience: 'intermediate',
  targetWeightKg: 60,
  activityLevel: 'moderate',
  shareBody: false,
  bio: null,
  createdAt: '2026-11-01T10:00:00.000Z',
} as const;
