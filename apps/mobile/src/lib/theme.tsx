import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, type Theme, type ThemeMode } from '@rota/design';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export type ThemePreference = 'system' | ThemeMode;

const STORAGE_KEY = 'rota.theme';

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children, initial }: { children: ReactNode; initial?: ThemePreference }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>(initial ?? 'dark');

  useEffect(() => {
    if (initial) return;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'system' || v === 'dark' || v === 'light') setPref(v);
      })
      .catch(() => undefined);
  }, [initial]);

  const mode: ThemeMode = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
  const theme = getTheme(mode);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.color.bgCanvas).catch(() => undefined);
  }, [theme.color.bgCanvas]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      preference,
      setPreference: (p) => {
        setPref(p);
        AsyncStorage.setItem(STORAGE_KEY, p).catch(() => undefined);
      },
    }),
    [theme, preference],
  );

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
}

/** Overrides the theme for a subtree, for example the kit showing both modes side by side. */
export function ThemeScope({ mode, children }: { mode: ThemeMode; children: ReactNode }) {
  const parent = useContext(ThemeContext);
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: getTheme(mode),
      preference: mode,
      setPreference: parent?.setPreference ?? (() => undefined),
    }),
    [mode, parent?.setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme outside ThemeProvider');
  return ctx.theme;
}

export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void] {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePreference outside ThemeProvider');
  return [ctx.preference, ctx.setPreference];
}
