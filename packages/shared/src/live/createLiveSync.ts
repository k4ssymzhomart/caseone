// Live sync (PHASE_2 §2.1): one Supabase Realtime channel per signed-in user that turns row changes into React
// Query invalidations. Platform free; both apps start it after sign in and stop it on sign out.
//
//   const live = createLiveSync({
//     client, uid,
//     onInvalidate: (keys) => keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey })),
//     onNotification: (row) => showToast(row),
//     onStatus: (s) => setLiveStatus(s),          // 'live' | 'connecting' | 'offline' («Нет связи»)
//   });
//   // foreground: supabase.auth.startAutoRefresh(); live.resync();   sign out: live.stop()
//
// Rules: payloads are never applied to the cache, only keys are invalidated (views emit no events, the base
// tables do); invalidations are debounced 250 ms per key; every SUBSCRIBED (first join and every rejoin) calls
// resync() for the events missed meanwhile; CHANNEL_ERROR, TIMED_OUT or CLOSED while running remove the channel
// and resubscribe after 1, 2, 5, 10 s (then every 10 s), reporting 'offline' until the next SUBSCRIBED.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppNotification } from '../domain/types';
import { cancelLater, later, type TimerHandle } from '../util/timers';
import { ALL_ROOT_KEYS, keyId, qk, type QueryKey } from './keys';

export type LiveStatus = 'live' | 'connecting' | 'offline';

/** Tables in the realtime publication that the apps listen to. */
export const LIVE_TABLES = ['orders', 'employees', 'ai_reviews', 'notifications'] as const;
export type LiveTable = (typeof LIVE_TABLES)[number];

export type LiveEventType = 'INSERT' | 'UPDATE' | 'DELETE';

/** One postgres_changes event as delivered (rows as the base table holds them, never a view row). */
export interface LiveChange {
  table: LiveTable;
  type: LiveEventType;
  /** The new row (INSERT, UPDATE); null on DELETE. */
  row: Record<string, unknown> | null;
  /** The old row: on DELETE only the primary key (replica identity default); null otherwise. */
  old: Record<string, unknown> | null;
}

export interface LiveSyncOptions {
  /** The app's client, already signed in; supabase-js passes refreshed tokens to the socket by itself. */
  client: SupabaseClient;
  /** auth user id (employees.id). */
  uid: string;
  /** React Query keys to invalidate, already debounced. */
  onInvalidate: (keys: QueryKey[]) => void;
  /** A new notification for this user: toast, or the emergency screen for kind 'emergency'. */
  onNotification?: (row: AppNotification) => void;
  /** 'connecting' first, 'live' after SUBSCRIBED, 'offline' while the channel is down. */
  onStatus?: (status: LiveStatus) => void;
  /** Every raw change (SupabaseApi.realtime builds its topic events on this). */
  onChange?: (change: LiveChange) => void;
  /** Channel name; default `rota-live-{uid}`. A second sync on the same client needs another name. */
  channelName?: string;
  /** Default 250. */
  debounceMs?: number;
  /** A key that keeps getting events is still invalidated at least this often. Default 1000. */
  maxWaitMs?: number;
  /** Resubscribe delays in ms. Default [1000, 2000, 5000, 10000]; the last one repeats. */
  backoffMs?: readonly number[];
}

export interface LiveSync {
  /** Removes the channel and drops pending invalidations. Idempotent. */
  stop(): void;
  /** Invalidates every root key now (foreground, pull to refresh, after demo.reset()). */
  resync(): void;
  /** The current status. */
  status(): LiveStatus;
}

export const LIVE_DEBOUNCE_MS = 250;
export const LIVE_MAX_WAIT_MS = 1000;
export const LIVE_BACKOFF_MS: readonly number[] = [1000, 2000, 5000, 10000];

/** Keys a change invalidates (the table of PHASE_2 §2.1). */
export function keysForChange(table: LiveTable, row: Record<string, unknown> | null): QueryKey[] {
  switch (table) {
    case 'orders': {
      const id = idOf(row?.id);
      return [
        qk.orders(),
        id == null ? qk.order() : qk.order(id),
        qk.workers(),
        qk.brigades(),
        qk.equipment(),
        qk.dashboard(),
        qk.shift(),
      ];
    }
    case 'employees':
      return [qk.workers(), qk.brigades()];
    case 'ai_reviews': {
      const orderId = idOf(row?.order_id);
      return orderId == null
        ? [qk.order(), qk.reviews()]
        : [qk.order(orderId), qk.reviews(orderId)];
    }
    case 'notifications':
      return [qk.notifications(), qk.orders()];
  }
}

function idOf(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// The few RealtimeChannel and SupabaseClient members used here, structurally (tests pass a fake).
interface PostgresChangesPayload {
  eventType?: string;
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}
interface PostgresChangesFilter {
  event: '*' | LiveEventType;
  schema: string;
  table: string;
  filter?: string;
}
interface LiveChannel {
  topic?: string;
  on(
    type: 'postgres_changes',
    filter: PostgresChangesFilter,
    cb: (payload: PostgresChangesPayload) => void,
  ): LiveChannel;
  subscribe(cb?: (status: string, err?: Error) => void): unknown;
}
interface LiveClient {
  channel(name: string): LiveChannel;
  removeChannel(channel: LiveChannel): Promise<unknown>;
  getChannels?(): { topic?: string }[];
}

const SUBSCRIPTIONS: readonly { table: LiveTable; event: '*' | LiveEventType; own?: boolean }[] = [
  { table: 'orders', event: '*' },
  { table: 'employees', event: 'UPDATE' },
  { table: 'ai_reviews', event: 'INSERT' },
  { table: 'notifications', event: 'INSERT', own: true },
];

function nonEmpty(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  return row && typeof row === 'object' && Object.keys(row).length > 0 ? row : null;
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    // a failing callback must not break the channel
  }
}

export function createLiveSync(options: LiveSyncOptions): LiveSync {
  const client = options.client as unknown as LiveClient;
  const { uid } = options;
  const baseName = options.channelName ?? `rota-live-${uid}`;
  const debounceMs = options.debounceMs ?? LIVE_DEBOUNCE_MS;
  const maxWaitMs = Math.max(options.maxWaitMs ?? LIVE_MAX_WAIT_MS, debounceMs);
  const backoff =
    options.backoffMs && options.backoffMs.length > 0 ? options.backoffMs : LIVE_BACKOFF_MS;

  let stopped = false;
  let status: LiveStatus = 'connecting';
  let channel: LiveChannel | null = null;
  /** Bumped on every (re)connect: callbacks of an older channel are ignored. */
  let generation = 0;
  let attempt = 0;
  let retryTimer: TimerHandle | null = null;

  const pending = new Map<string, { key: QueryKey; first: number; due: number }>();
  let flushTimer: TimerHandle | null = null;
  let flushAt = Number.POSITIVE_INFINITY;

  function setStatus(next: LiveStatus): void {
    if (next === status) return;
    status = next;
    safe(() => options.onStatus?.(next));
  }

  // --- debounce ------------------------------------------------------------

  function invalidate(keys: readonly QueryKey[]): void {
    if (stopped) return;
    const now = Date.now();
    for (const key of keys) {
      const id = keyId(key);
      const p = pending.get(id);
      if (p) p.due = Math.min(now + debounceMs, p.first + maxWaitMs);
      else pending.set(id, { key, first: now, due: now + debounceMs });
    }
    schedule();
  }

  function schedule(): void {
    let next = Number.POSITIVE_INFINITY;
    for (const p of pending.values()) next = Math.min(next, p.due);
    if (next === Number.POSITIVE_INFINITY) return;
    // an earlier timer stays: when it fires it flushes what is due and schedules the rest
    if (flushTimer != null && flushAt <= next) return;
    if (flushTimer != null) cancelLater(flushTimer);
    flushAt = next;
    flushTimer = later(flush, Math.max(0, next - Date.now()));
  }

  function flush(): void {
    flushTimer = null;
    flushAt = Number.POSITIVE_INFINITY;
    if (stopped) return;
    // timers may fire a millisecond early against Date.now()
    const now = Date.now() + 2;
    const due: QueryKey[] = [];
    for (const [id, p] of pending) {
      if (p.due <= now) {
        due.push(p.key);
        pending.delete(id);
      }
    }
    if (due.length > 0) safe(() => options.onInvalidate(due));
    schedule();
  }

  function clearPending(): void {
    pending.clear();
    if (flushTimer != null) cancelLater(flushTimer);
    flushTimer = null;
    flushAt = Number.POSITIVE_INFINITY;
  }

  // --- events --------------------------------------------------------------

  function handle(table: LiveTable, payload: PostgresChangesPayload): void {
    const type: LiveEventType =
      payload.eventType === 'INSERT' || payload.eventType === 'DELETE'
        ? payload.eventType
        : 'UPDATE';
    const row = type === 'DELETE' ? null : nonEmpty(payload.new);
    const old = type === 'DELETE' ? nonEmpty(payload.old) : null;
    invalidate(keysForChange(table, row ?? old));
    safe(() => options.onChange?.({ table, type, row, old }));
    if (table === 'notifications' && type === 'INSERT' && row) {
      safe(() => options.onNotification?.(row as unknown as AppNotification));
    }
  }

  // --- channel -------------------------------------------------------------

  function channelName(): string {
    // the client hands back an existing channel with the same topic; an old one that never closed (dead
    // socket) would swallow the new subscription, so a retry then takes a fresh name
    const taken = client.getChannels?.().some((c) => c.topic === `realtime:${baseName}`) ?? false;
    return taken ? `${baseName}-${generation}` : baseName;
  }

  function connect(): void {
    if (stopped) return;
    generation += 1;
    const gen = generation;
    const ch = client.channel(channelName());
    channel = ch;
    let chain = ch;
    for (const s of SUBSCRIPTIONS) {
      const filter: PostgresChangesFilter = { event: s.event, schema: 'public', table: s.table };
      if (s.own) filter.filter = `recipient_id=eq.${uid}`;
      chain = chain.on('postgres_changes', filter, (payload) => {
        if (!stopped && gen === generation) handle(s.table, payload);
      });
    }
    chain.subscribe((state) => {
      if (stopped || gen !== generation) return;
      if (state === 'SUBSCRIBED') {
        attempt = 0;
        setStatus('live');
        resync();
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
        reconnect();
      }
    });
  }

  function dropChannel(): void {
    const old = channel;
    channel = null;
    generation += 1; // late callbacks of the old channel (its CLOSED on removal) are ignored
    if (old) {
      client.removeChannel(old).catch(() => undefined);
    }
  }

  function reconnect(): void {
    setStatus('offline');
    dropChannel();
    if (retryTimer != null) return;
    const delay = backoff[Math.min(attempt, backoff.length - 1)] ?? 10_000;
    attempt += 1;
    retryTimer = later(() => {
      retryTimer = null;
      connect();
    }, delay);
  }

  function resync(): void {
    if (stopped) return;
    clearPending();
    safe(() => options.onInvalidate([...ALL_ROOT_KEYS]));
  }

  safe(() => options.onStatus?.('connecting'));
  connect();

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      clearPending();
      if (retryTimer != null) cancelLater(retryTimer);
      retryTimer = null;
      dropChannel();
    },
    resync,
    status: () => status,
  };
}
