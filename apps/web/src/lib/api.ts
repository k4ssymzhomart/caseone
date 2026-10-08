// The panel's RotaApi (mock or Supabase, CLAUDE.md §22), the signed in session and the API context.
//
//   const api = useApi();                      // the RotaApi (prefer the hooks of lib/queries.ts and lib/mutations.ts)
//   const session = useRequiredSession();      // inside guarded routes: { user_id, role, short_name, ... }
//   await signIn('1001', '1111'); await signOut();
//
// Mode: VITE_API_MODE ('mock' by default). 'supabase' needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY;
// without them the panel falls back to mock and says so in the console. The client keeps its session in
// localStorage (supabase-js default on the web).
import { createApi, type ApiMode, type RotaApi, type RotaDatabase, type Session } from '@rota/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext, useSyncExternalStore } from 'react';
import { queryClient } from './query';
import { webStorage } from './storage';

const env = import.meta.env;
const url = env.VITE_SUPABASE_URL?.trim();
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const requested = (env.VITE_API_MODE ?? 'mock').trim();

export const apiMode: ApiMode = requested === 'supabase' && url && key ? 'supabase' : 'mock';
if (requested === 'supabase' && apiMode === 'mock') {
  console.warn('VITE_API_MODE=supabase needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY; using mock data.');
}

/** Demo account chips on the login page (on unless VITE_DEMO_ACCOUNTS=false). */
export const demoAccounts = env.VITE_DEMO_ACCOUNTS !== 'false';

/** RFC 4122 v4. crypto.randomUUID exists only in secure contexts (https, localhost); a LAN address gets the fallback. */
export function uuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A fresh client_action_id for one user click; reuse it for every retry of that same click. */
export function newActionId(): string {
  return uuid();
}

/** The one Supabase client (publishable key only), or null in mock mode. Pass it to createLiveSync. */
export const supabase: SupabaseClient<RotaDatabase> | null =
  apiMode === 'supabase' && url && key ? createClient<RotaDatabase>(url, key) : null;

export const api: RotaApi = createApi({
  mode: apiMode,
  storage: webStorage,
  uuid,
  ...(supabase ? { client: supabase } : {}),
});

/** React context with the api; AppProviders provides `api`, tests may provide another RotaApi. */
export const ApiContext = createContext<RotaApi>(api);

export function useApi(): RotaApi {
  return useContext(ApiContext);
}

// ---------------------------------------------------------------------------
// session store
// ---------------------------------------------------------------------------

interface SessionState {
  session: Session | null;
  /** false until the stored session has been read once. */
  ready: boolean;
}

let state: SessionState = { session: null, ready: false };
const listeners = new Set<() => void>();

function setSession(session: Session | null): void {
  if (state.session?.user_id !== session?.user_id) queryClient.clear();
  state = { session, ready: true };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, () => state.session);
}

export function useSessionReady(): boolean {
  return useSyncExternalStore(subscribe, () => state.ready);
}

/** Inside guarded routes the session exists; elsewhere this throws. */
export function useRequiredSession(): Session {
  const s = useSession();
  if (!s) throw new Error('No session');
  return s;
}

export async function signIn(tabNo: string, pin: string): Promise<Session> {
  const s = await api.auth.signIn(tabNo, pin);
  setSession(s);
  return s;
}

export async function signOut(): Promise<void> {
  try {
    await api.auth.signOut();
  } finally {
    setSession(null);
  }
}

let started = false;

/** Reads the stored session once and follows auth changes (token refresh, sign out in another tab). Idempotent. */
export function startSession(): void {
  if (started) return;
  started = true;
  api.auth.onChange((s) => setSession(s));
  api.auth.session().then(setSession, () => setSession(null));
}
