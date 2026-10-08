// Browser storage, always inside try/catch: a private window, blocked site data or a full quota must never break
// the panel. Falls back to memory for the session.
import type { KeyValueStorage } from '@rota/shared';

const memory = new Map<string, string>();

function ls(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Synchronous read (theme, remembered choices). */
export function readItem(key: string): string | null {
  try {
    const value = ls()?.getItem(key);
    if (value != null) return value;
  } catch {
    // blocked: use memory
  }
  return memory.get(key) ?? null;
}

export function writeItem(key: string, value: string): void {
  memory.set(key, value);
  try {
    ls()?.setItem(key, value);
  } catch {
    // blocked or full: memory only
  }
}

export function removeItem(key: string): void {
  memory.delete(key);
  try {
    ls()?.removeItem(key);
  } catch {
    // ignore
  }
}

/** The KeyValueStorage RotaApi needs (MockApi state, SupabaseApi's cached session). */
export const webStorage: KeyValueStorage = {
  getItem: async (key) => readItem(key),
  setItem: async (key, value) => writeItem(key, value),
  removeItem: async (key) => removeItem(key),
};
