import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveSync,
  keysForChange,
  type LiveStatus,
  type LiveSyncOptions,
} from './createLiveSync';
import { ALL_ROOT_KEYS, keyId, qk, type QueryKey } from './keys';

interface Binding {
  filter: { event: string; schema: string; table: string; filter?: string };
  cb: (payload: unknown) => void;
}

class FakeChannel {
  readonly name: string;
  readonly topic: string;
  readonly bindings: Binding[] = [];
  statusCb: ((s: string, err?: Error) => void) | undefined;
  removed = false;

  constructor(name: string) {
    this.name = name;
    this.topic = `realtime:${name}`;
  }

  on(_type: string, filter: Binding['filter'], cb: Binding['cb']): this {
    this.bindings.push({ filter, cb });
    return this;
  }

  subscribe(cb?: (s: string, err?: Error) => void): this {
    this.statusCb = cb;
    return this;
  }

  /** What the server would deliver for a change on `table`. */
  emit(
    table: string,
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    row: Record<string, unknown>,
  ): void {
    const payload =
      eventType === 'DELETE' ? { eventType, new: {}, old: row } : { eventType, new: row, old: {} };
    for (const b of this.bindings) {
      if (b.filter.table === table && (b.filter.event === '*' || b.filter.event === eventType)) {
        b.cb(payload);
      }
    }
  }

  status(s: string): void {
    this.statusCb?.(s);
  }
}

class FakeClient {
  channels: FakeChannel[] = [];
  readonly created: FakeChannel[] = [];

  channel(name: string): FakeChannel {
    const existing = this.channels.find((c) => c.name === name);
    if (existing) return existing;
    const c = new FakeChannel(name);
    this.channels.push(c);
    this.created.push(c);
    return c;
  }

  async removeChannel(c: FakeChannel): Promise<string> {
    c.removed = true;
    this.channels = this.channels.filter((x) => x !== c);
    c.statusCb?.('CLOSED');
    return 'ok';
  }

  getChannels(): FakeChannel[] {
    return this.channels;
  }

  last(): FakeChannel {
    const c = this.created[this.created.length - 1];
    if (!c) throw new Error('no channel');
    return c;
  }
}

function setup(extra: Partial<LiveSyncOptions> = {}) {
  const client = new FakeClient();
  const invalidations: QueryKey[][] = [];
  const statuses: LiveStatus[] = [];
  const notes: unknown[] = [];
  const sync = createLiveSync({
    client: client as unknown as SupabaseClient,
    uid: 'u1',
    onInvalidate: (keys) => invalidations.push(keys),
    onNotification: (row) => notes.push(row),
    onStatus: (s) => statuses.push(s),
    ...extra,
  });
  return { client, sync, invalidations, statuses, notes };
}

const ids = (keys: readonly QueryKey[]): string[] => keys.map(keyId).sort();
const ALL = ids(ALL_ROOT_KEYS);

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('keysForChange', () => {
  it('maps every table to the keys of PHASE_2 §2.1', () => {
    expect(ids(keysForChange('orders', { id: 5 }))).toEqual(
      ids([
        ['orders'],
        ['order', 5],
        ['workers'],
        ['brigades'],
        ['equipment'],
        ['dashboard'],
        ['shift'],
      ]),
    );
    expect(ids(keysForChange('employees', { id: 'x' }))).toEqual(ids([['workers'], ['brigades']]));
    expect(ids(keysForChange('ai_reviews', { id: 3, order_id: 7 }))).toEqual(
      ids([
        ['order', 7],
        ['reviews', 7],
      ]),
    );
    expect(ids(keysForChange('notifications', { id: 1 }))).toEqual(
      ids([['notifications'], ['orders']]),
    );
    // a DELETE without a usable id still refreshes every order card
    expect(keysForChange('orders', null)).toContainEqual(['order']);
  });

  it('builds the shared key constants', () => {
    expect(qk.order(4)).toEqual(['order', 4]);
    expect(qk.orders({ assignee_id: 'a' })).toEqual(['orders', { assignee_id: 'a' }]);
    expect(qk.reviews()).toEqual(['reviews']);
    expect(ALL_ROOT_KEYS).toContainEqual(['directories']);
  });
});

describe('createLiveSync', () => {
  it('subscribes once on rota-live-{uid} to the four tables', () => {
    const { client, statuses } = setup();
    expect(client.created).toHaveLength(1);
    const ch = client.last();
    expect(ch.name).toBe('rota-live-u1');
    expect(ch.bindings.map((b) => b.filter)).toEqual([
      { event: '*', schema: 'public', table: 'orders' },
      { event: 'UPDATE', schema: 'public', table: 'employees' },
      { event: 'INSERT', schema: 'public', table: 'ai_reviews' },
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'recipient_id=eq.u1' },
    ]);
    expect(statuses).toEqual(['connecting']);
  });

  it('goes live and resyncs on SUBSCRIBED', () => {
    const { client, sync, statuses, invalidations } = setup();
    client.last().status('SUBSCRIBED');
    expect(statuses).toEqual(['connecting', 'live']);
    expect(sync.status()).toBe('live');
    expect(invalidations).toHaveLength(1);
    expect(ids(invalidations[0] ?? [])).toEqual(ALL);
  });

  it('debounces invalidations 250 ms per key and batches what is due together', () => {
    const { client, invalidations } = setup();
    const ch = client.last();
    ch.emit('orders', 'UPDATE', { id: 1 });
    vi.advanceTimersByTime(100);
    ch.emit('orders', 'UPDATE', { id: 1 });
    ch.emit('orders', 'UPDATE', { id: 2 });
    vi.advanceTimersByTime(249);
    expect(invalidations).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(invalidations).toHaveLength(1);
    expect(ids(invalidations[0] ?? [])).toEqual(
      ids([
        ['orders'],
        ['order', 1],
        ['order', 2],
        ['workers'],
        ['brigades'],
        ['equipment'],
        ['dashboard'],
        ['shift'],
      ]),
    );
    vi.advanceTimersByTime(5000);
    expect(invalidations).toHaveLength(1);
  });

  it('invalidates a key that keeps changing at least once a second', () => {
    const { client, invalidations } = setup();
    const ch = client.last();
    for (let t = 0; t <= 1200; t += 200) {
      ch.emit('employees', 'UPDATE', { id: 'w' });
      vi.advanceTimersByTime(200);
    }
    // the first flush comes at 1000 ms (max wait), not 250 ms after the last event
    expect(invalidations.length).toBeGreaterThanOrEqual(1);
    expect(ids(invalidations[0] ?? [])).toEqual(ids([['workers'], ['brigades']]));
  });

  it('hands a new own notification to onNotification and refreshes orders', () => {
    const { client, notes, invalidations } = setup();
    const row = {
      id: 9,
      recipient_id: 'u1',
      kind: 'emergency',
      order_id: 3,
      title: 't',
      body: 'b',
    };
    client.last().emit('notifications', 'INSERT', row);
    expect(notes).toEqual([row]);
    vi.advanceTimersByTime(250);
    expect(ids(invalidations[0] ?? [])).toEqual(ids([['notifications'], ['orders']]));
  });

  it('reports raw changes through onChange, DELETE with the old key only', () => {
    const changes: unknown[] = [];
    const { client } = setup({ onChange: (c) => changes.push(c) });
    const ch = client.last();
    ch.emit('orders', 'INSERT', { id: 4, status: 'issued' });
    ch.emit('orders', 'DELETE', { id: 4 });
    ch.emit('ai_reviews', 'INSERT', { id: 1, order_id: 4 });
    expect(changes).toEqual([
      { table: 'orders', type: 'INSERT', row: { id: 4, status: 'issued' }, old: null },
      { table: 'orders', type: 'DELETE', row: null, old: { id: 4 } },
      { table: 'ai_reviews', type: 'INSERT', row: { id: 1, order_id: 4 }, old: null },
    ]);
  });

  it('resubscribes with backoff 1, 2, 5, 10 s while offline and resets after SUBSCRIBED', () => {
    const { client, statuses } = setup();
    client.last().status('SUBSCRIBED');

    const failAndWait = (state: string, delay: number): void => {
      const ch = client.last();
      ch.status(state);
      expect(ch.removed).toBe(true);
      const count = client.created.length;
      vi.advanceTimersByTime(delay - 1);
      expect(client.created).toHaveLength(count);
      vi.advanceTimersByTime(1);
      expect(client.created).toHaveLength(count + 1);
      expect(client.last().name).toBe('rota-live-u1');
    };

    failAndWait('CHANNEL_ERROR', 1000);
    expect(statuses).toEqual(['connecting', 'live', 'offline']);
    failAndWait('TIMED_OUT', 2000);
    failAndWait('CLOSED', 5000);
    failAndWait('CHANNEL_ERROR', 10_000);
    failAndWait('CHANNEL_ERROR', 10_000);
    expect(statuses).toEqual(['connecting', 'live', 'offline']);

    client.last().status('SUBSCRIBED');
    expect(statuses).toEqual(['connecting', 'live', 'offline', 'live']);
    failAndWait('CHANNEL_ERROR', 1000);
  });

  it('takes a fresh name when the old channel is still held by the client', () => {
    const { client } = setup();
    const first = client.last();
    // the removal never completes (dead socket): the client keeps the old channel
    client.removeChannel = async (c: FakeChannel) => {
      c.removed = true;
      return 'timed out';
    };
    first.status('CHANNEL_ERROR');
    vi.advanceTimersByTime(1000);
    const second = client.last();
    expect(second).not.toBe(first);
    expect(second.name).not.toBe('rota-live-u1');
    expect(second.name.startsWith('rota-live-u1-')).toBe(true);
  });

  it('ignores events and states of a replaced channel', () => {
    const { client, invalidations, statuses } = setup();
    const first = client.last();
    first.status('CHANNEL_ERROR');
    vi.advanceTimersByTime(1000);
    first.emit('orders', 'UPDATE', { id: 1 });
    first.status('SUBSCRIBED');
    vi.advanceTimersByTime(1000);
    expect(invalidations).toHaveLength(0);
    expect(statuses).toEqual(['connecting', 'offline']);
  });

  it('resync() invalidates every root key at once and drops pending ones', () => {
    const { client, sync, invalidations } = setup();
    client.last().emit('orders', 'UPDATE', { id: 1 });
    sync.resync();
    expect(invalidations).toHaveLength(1);
    expect(ids(invalidations[0] ?? [])).toEqual(ALL);
    vi.advanceTimersByTime(1000);
    expect(invalidations).toHaveLength(1);
  });

  it('stop() removes the channel and silences everything after', () => {
    const { client, sync, invalidations, statuses } = setup();
    const ch = client.last();
    ch.status('SUBSCRIBED');
    invalidations.length = 0;
    ch.emit('orders', 'UPDATE', { id: 1 });
    sync.stop();
    expect(ch.removed).toBe(true);
    expect(client.channels).toHaveLength(0);
    ch.emit('orders', 'UPDATE', { id: 2 });
    sync.resync();
    vi.advanceTimersByTime(20_000);
    expect(invalidations).toHaveLength(0);
    expect(statuses).toEqual(['connecting', 'live']);
    expect(client.created).toHaveLength(1);
    sync.stop();
  });

  it('stop() during the backoff wait cancels the resubscribe', () => {
    const { client, sync } = setup();
    client.last().status('CHANNEL_ERROR');
    sync.stop();
    vi.advanceTimersByTime(20_000);
    expect(client.created).toHaveLength(1);
  });
});
