import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { storage } from '@/lib/storage';
import { type Colors, dark, light } from './tokens';

export type ThemePref = 'system' | 'dark' | 'light';
const KEY = 'forja.theme';

interface ThemeCtx {
  c: Colors;
  scheme: 'dark' | 'light';
  pref: ThemePref;
  setPref(p: ThemePref): void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>('system');
  useEffect(() => {
    void storage.get(KEY).then((v) => {
      if (v === 'dark' || v === 'light' || v === 'system') setPrefState(v);
    });
  }, []);
  const scheme: 'dark' | 'light' = pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
  const value = useMemo<ThemeCtx>(
    () => ({
      c: scheme === 'dark' ? dark : light,
      scheme,
      pref,
      setPref: (p) => {
        setPrefState(p);
        void storage.set(KEY, p);
      },
    }),
    [scheme, pref],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme fora do ThemeProvider');
  return v;
}
