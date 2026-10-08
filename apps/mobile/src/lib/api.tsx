// The app's RotaApi (mock or Supabase, CLAUDE.md §22) and the signed in session.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createApi, type RotaApi, type Session } from '@rota/shared';
import * as Crypto from 'expo-crypto';
import { useEffect, type ReactNode } from 'react';
import { create } from 'zustand';

import { queryClient } from './query';
import { apiMode, supabase } from './supabase';

export const api: RotaApi = createApi({
  mode: apiMode,
  storage: AsyncStorage,
  uuid: () => Crypto.randomUUID(),
  ...(supabase ? { client: supabase } : {}),
});

export { apiMode };

/** A fresh client_action_id for one user tap (reuse it for every retry of that tap). */
export function newActionId(): string {
  return Crypto.randomUUID();
}

interface SessionState {
  session: Session | null;
  ready: boolean;
  set: (s: Session | null) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: null,
  ready: false,
  set: (session) => {
    const prev = get().session;
    // A different person on this phone: nothing cached for the previous one may show.
    if (prev?.user_id !== session?.user_id) queryClient.clear();
    set({ session, ready: true });
  },
}));

export function useApi(): RotaApi {
  return api;
}

export function useSession(): Session | null {
  return useSessionStore((s) => s.session);
}

export function useSessionReady(): boolean {
  return useSessionStore((s) => s.ready);
}

/** Inside role routes the session exists; outside it throws, which the root redirect never allows. */
export function useRequiredSession(): Session {
  const s = useSession();
  if (!s) throw new Error('No session');
  return s;
}

export async function signIn(tabNo: string, pin: string): Promise<Session> {
  const s = await api.auth.signIn(tabNo, pin);
  useSessionStore.getState().set(s);
  return s;
}

export async function signOut(): Promise<void> {
  try {
    await api.auth.signOut();
  } finally {
    useSessionStore.getState().set(null);
  }
}

/** Restores the session on start and follows auth changes (token refresh, sign out elsewhere). */
export function ApiProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let alive = true;
    api.auth
      .session()
      .then((s) => alive && useSessionStore.getState().set(s))
      .catch(() => alive && useSessionStore.getState().set(null));
    const off = api.auth.onChange((s) => useSessionStore.getState().set(s));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return children;
}
