// Realtime → React Query for the panel (PHASE_2 §2.1, web wiring). Supabase mode: createLiveSync opens one channel
// per signed in user and hands back the keys to invalidate, already debounced; a tab that becomes visible again
// resyncs (a sleeping laptop drops the socket). Mock mode: the API's own events through the same key map.
// Start it once per session (components/LiveBridge.tsx does); read the connection state with useLiveStatus().
import {
  ALL_ROOT_KEYS,
  createLiveSync,
  keysForChange,
  REALTIME_TOPICS,
  type AppNotification,
  type LiveStatus,
  type LiveTable,
  type QueryKey,
  type RealtimeTopic,
  type RotaApi,
} from '@rota/shared';
import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { apiMode, supabase } from './api';

let status: LiveStatus = 'connecting';
const listeners = new Set<() => void>();

function setStatus(next: LiveStatus): void {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}

/** 'live' | 'connecting' | 'offline' (the top bar shows «Нет связи»). Mock mode is always 'live'. */
export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
  );
}

const TOPIC_TABLE: Record<RealtimeTopic, LiveTable> = {
  orders: 'orders',
  workers: 'employees',
  reviews: 'ai_reviews',
  notifications: 'notifications',
};

export interface StartLiveOptions {
  api: RotaApi;
  queryClient: QueryClient;
  uid: string;
  onNotification: (row: AppNotification) => void;
  onStatus?: (s: LiveStatus) => void;
}

/** Starts live sync for one user; returns stop(). */
export function startLive({ api, queryClient, uid, onNotification, onStatus }: StartLiveOptions): () => void {
  const invalidate = (keys: readonly QueryKey[]) =>
    keys.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey: [...queryKey] }));
  const report = (s: LiveStatus) => {
    setStatus(s);
    onStatus?.(s);
  };

  let resync: () => void;
  let stop: () => void;

  if (apiMode === 'supabase' && supabase) {
    const live = createLiveSync({ client: supabase, uid, onInvalidate: invalidate, onNotification, onStatus: report });
    resync = () => live.resync();
    stop = () => live.stop();
  } else {
    // Mock mode: every mutation emits a topic event; debounce 250 ms per key like createLiveSync.
    report('live');
    const timers = new Map<string, number>();
    const later = (keys: readonly QueryKey[]) => {
      for (const key of keys) {
        const id = JSON.stringify(key);
        const prev = timers.get(id);
        if (prev != null) window.clearTimeout(prev);
        timers.set(
          id,
          window.setTimeout(() => {
            timers.delete(id);
            invalidate([key]);
          }, 250),
        );
      }
    };
    const offs = REALTIME_TOPICS.map((topic) =>
      api.realtime.subscribe(topic, (e) => {
        const row = e.row && typeof e.row === 'object' ? (e.row as Record<string, unknown>) : null;
        later(keysForChange(TOPIC_TABLE[topic], row));
        if (topic === 'notifications' && e.type === 'INSERT' && row) onNotification(row as unknown as AppNotification);
      }),
    );
    resync = () => {
      api.realtime.resync();
      invalidate(ALL_ROOT_KEYS);
    };
    stop = () => {
      offs.forEach((off) => off());
      timers.forEach((id) => window.clearTimeout(id));
    };
  }

  // supabase-js refreshes the token on visibility changes by itself in browsers; we only refetch.
  const onVisible = () => {
    if (document.visibilityState === 'visible') resync();
  };
  const onOnline = () => resync();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
    stop();
    setStatus('connecting');
  };
}
