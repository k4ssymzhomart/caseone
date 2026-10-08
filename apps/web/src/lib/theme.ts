// Theme: dark by default (the Rota look), light for sunlight. `data-theme` on <html> drives tokens.css; the choice
// is stored in localStorage (index.html applies it before the first paint).
import { useSyncExternalStore } from 'react';
import { readItem, writeItem } from './storage';

export type ThemeMode = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'rota.web.theme';

function initial(): ThemeMode {
  return readItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

let mode: ThemeMode = initial();
const listeners = new Set<() => void>();

function apply(next: ThemeMode): void {
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', next === 'dark' ? 'dark light' : 'light dark');
}

apply(mode);

export function setTheme(next: ThemeMode): void {
  if (next === mode) return;
  mode = next;
  apply(next);
  writeItem(THEME_STORAGE_KEY, next);
  listeners.forEach((l) => l());
}

export function toggleTheme(): void {
  setTheme(mode === 'dark' ? 'light' : 'dark');
}

export function getTheme(): ThemeMode {
  return mode;
}

/** The current theme; re-renders when it changes. Charts and the mascots read colors from CSS variables, so most
 *  components never need this. */
export function useTheme(): ThemeMode {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => mode,
    () => 'dark',
  );
}
