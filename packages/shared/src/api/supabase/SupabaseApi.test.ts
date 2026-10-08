// SupabaseApi against a fake client: the calls it makes (tables, filters, RPC names and payloads, storage paths),
// the error mapping of PHASE_1 §6, the session, the signed URL cache and realtime on createLiveSync.
// The live project runs the shared contract in SupabaseApi.contract.test.ts (RUN_SUPABASE=1).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RatingRow, RealtimeEvent, ShiftReport } from '../../domain/types';
import { mockExplainRating, mockShiftSummary } from '../mock/ai';
import { isRotaError, parseAnotherInProgress, RotaError } from '../errors';
import { createApi } from '../index';
import { memoryStorage } from '../RotaApi';
import { fromAuth, fromPostgrest, fromStorage, fromThrown } from './errors';
import {
  AI_REPORT_TIMEOUT_MS,
  AI_VERIFY_TIMEOUT_MS,
  downtimeMinutes,
  foldSettings,
  functionErrorStatus,
  SupabaseApi,
} from './SupabaseApi';

// ---------------------------------------------------------------------------
// a fake supabase-js client
// ---------------------------------------------------------------------------

interface Call {
  /** table name, or rpc:<fn> */
  target: string;
  args?: unknown;
  ops: [string, ...unknown[]][];
}

interface Response {
  data?: unknown;
  error?: { code?: string; message?: string; details?: string | null } | null;
  status?: number;
  count?: number | null;
}

type Responder = (call: Call) => Response | undefined;

/** functions.invoke of the fake client; absent unless a test passes one. */
type FakeInvoke = (
  name: string,
  options: { body: unknown; timeout?: number },
) => Promise<{ data: unknown; error: unknown }>;

function query(call: Call, calls: Call[], respond: Responder): unknown {
  calls.push(call);
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (onF: (v: unknown) => unknown, onR: (e: unknown) => unknown) => {
            const r = respond(call) ?? {};
            return Promise.resolve({
              data: r.data ?? null,
              error: r.error ?? null,
              status: r.status ?? (r.error ? 400 : 200),
              count: r.count ?? null,
            }).then(onF, onR);
          };
        }
        return (...args: unknown[]) => {
          call.ops.push([String(prop), ...args]);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

interface FakeChannel {
  name: string;
  topic: string;
  bindings: { filter: { table: string; event: string }; cb: (p: unknown) => void }[];
  statusCb?: (s: string) => void;
}

const MASTER_ID = 'u-1001';
const WORKER_ID = 'u-2001';

const EMPLOYEES: Record<string, Record<string, unknown>> = {
  [MASTER_ID]: {
    id: MASTER_ID,
    tab_no: '1001',
    full_name: 'Жумабаев Нурлан',
    short_name: 'Жумабаев Н.',
    pseudonym: 'M01',
    role: 'master',
  },
  [WORKER_ID]: {
    id: WORKER_ID,
    tab_no: '2001',
    full_name: 'Ахметов Ерлан',
    short_name: 'Ахметов Е.',
    pseudonym: 'E01',
    role: 'worker',
  },
};

function fakeClient(respond: Responder = () => undefined, invoke?: FakeInvoke) {
  const calls: Call[] = [];
  const channels: FakeChannel[] = [];
  let session: { user: { id: string; app_metadata: Record<string, unknown> } } | null = null;
  const authListeners: ((event: string, s: unknown) => void)[] = [];
  const uploads: { bucket: string; path: string; body: unknown; opts: unknown }[] = [];
  let signCount = 0;
  const signed: string[][] = [];

  const users: Record<string, { id: string; pin: string; role: string }> = {
    '1001@naryad.local': { id: MASTER_ID, pin: 'nr_1111_kz', role: 'master' },
    '2001@naryad.local': { id: WORKER_ID, pin: 'nr_1234_kz', role: 'worker' },
  };

  const employeesResponder: Responder = (call) => {
    if (call.target === 'employees' && call.ops.some((o) => o[0] === 'maybeSingle')) {
      const id = call.ops.find((o) => o[0] === 'eq')?.[2] as string;
      return { data: EMPLOYEES[id] ?? null };
    }
    return undefined;
  };
  const answer: Responder = (call) => respond(call) ?? employeesResponder(call);

  const client = {
    auth: {
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const u = users[email];
        if (!u || u.pin !== password) {
          return {
            data: { user: null, session: null },
            error: {
              name: 'AuthApiError',
              status: 400,
              code: 'invalid_credentials',
              message: 'Invalid login credentials',
            },
          };
        }
        session = { user: { id: u.id, app_metadata: { app_role: u.role } } };
        for (const l of authListeners) l('SIGNED_IN', session);
        return { data: { user: session.user, session }, error: null };
      },
      async signOut() {
        session = null;
        for (const l of authListeners) l('SIGNED_OUT', null);
        return { error: null };
      },
      async getSession() {
        return { data: { session }, error: null };
      },
      onAuthStateChange(cb: (event: string, s: unknown) => void) {
        authListeners.push(cb);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
    ...(invoke ? { functions: { invoke } } : {}),
    from: (table: string) => query({ target: table, ops: [] }, calls, answer),
    rpc: (fn: string, args?: unknown) =>
      query({ target: `rpc:${fn}`, args, ops: [] }, calls, answer),
    storage: {
      from: (bucket: string) => ({
        async upload(path: string, body: unknown, opts: unknown) {
          uploads.push({ bucket, path, body, opts });
          return { data: { path }, error: null };
        },
        async createSignedUrl(path: string) {
          signCount += 1;
          signed.push([path]);
          if (path.includes('missing')) {
            return {
              data: null,
              error: {
                name: 'StorageApiError',
                status: 400,
                statusCode: '404',
                message: 'Object not found',
              },
            };
          }
          return { data: { signedUrl: `https://signed/${path}?n=${signCount}` }, error: null };
        },
        async createSignedUrls(paths: string[]) {
          signCount += 1;
          signed.push(paths);
          return {
            data: paths.map((p) =>
              p.includes('missing')
                ? { path: p, signedUrl: null, error: 'Object not found' }
                : { path: p, signedUrl: `https://signed/${p}?n=${signCount}`, error: null },
            ),
            error: null,
          };
        },
      }),
    },
    channel(name: string) {
      const ch: FakeChannel & Record<string, unknown> = {
        name,
        topic: `realtime:${name}`,
        bindings: [],
        on(
          _type: string,
          filter: FakeChannel['bindings'][number]['filter'],
          cb: (p: unknown) => void,
        ) {
          ch.bindings.push({ filter, cb });
          return ch;
        },
        subscribe(cb: (s: string) => void) {
          ch.statusCb = cb;
          return ch;
        },
      };
      channels.push(ch);
      return ch;
    },
    async removeChannel(ch: FakeChannel) {
      const i = channels.indexOf(ch);
      if (i >= 0) channels.splice(i, 1);
      return 'ok';
    },
    getChannels: () => channels,
  };

  return {
    client: client as unknown as SupabaseClient,
    calls,
    channels,
    uploads,
    signed,
    rpcCalls: (fn: string) => calls.filter((c) => c.target === `rpc:${fn}`),
  };
}

let clock = new Date('2026-10-08T10:00:00Z'); // 15:00 local

function makeApi(respond?: Responder, invoke?: FakeInvoke) {
  const fake = fakeClient(respond, invoke);
  const api = new SupabaseApi({
    mode: 'supabase',
    client: fake.client,
    storage: memoryStorage(),
    uuid: () => '11111111-2222-4333-8444-555555555555',
    now: () => clock,
  });
  return { api, ...fake };
}

async function failure(p: Promise<unknown>): Promise<RotaError> {
  try {
    await p;
  } catch (e) {
    if (isRotaError(e)) return e;
    throw e;
  }
  throw new Error('expected a failure');
}

afterEach(() => {
  clock = new Date('2026-10-08T10:00:00Z');
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('error mapping (PHASE_1 §6)', () => {
  it('maps the state machine codes with their details', () => {
    const another = fromPostgrest({
      code: 'P0001',
      message: 'ANOTHER_IN_PROGRESS',
      details: '{"order_id": 12, "number": 147}',
    });
    expect(another.code).toBe('ANOTHER_IN_PROGRESS');
    expect(parseAnotherInProgress(another.details)).toEqual({ order_id: 12, number: 147 });
    expect(another.message).toBe('Приостановить наряд №147 и начать этот?');

    const off = fromPostgrest({ code: 'P0001', message: 'NOT_ON_SHIFT', details: 'Литвиненко О.' });
    expect(off.code).toBe('NOT_ON_SHIFT');
    expect(off.message).toBe('Литвиненко О. не на смене. Всё равно выдать?');

    for (const code of ['FORBIDDEN', 'BAD_TRANSITION', 'MISSING_REASON', 'BAD_INPUT'] as const) {
      expect(fromPostgrest({ code: 'P0001', message: code, details: 'x' }).code).toBe(code);
    }
  });

  it('maps permission, JWT, network and input errors', () => {
    expect(fromPostgrest({ code: '42501', message: 'permission denied for function x' }).code).toBe(
      'FORBIDDEN',
    );
    expect(fromPostgrest({ code: 'PGRST301', message: 'JWT expired' }, 401).code).toBe('FORBIDDEN');
    expect(fromPostgrest({ code: '', message: 'TypeError: fetch failed' }, 0).code).toBe('NETWORK');
    expect(fromPostgrest({ code: '', message: 'Bad gateway' }, 502).code).toBe('NETWORK');
    expect(
      fromPostgrest({ code: '22P02', message: 'invalid input syntax for type uuid' }).code,
    ).toBe('BAD_INPUT');
    expect(fromPostgrest({ code: 'P0001', message: 'something else' }).code).toBe('UNKNOWN');
    expect(fromAuth({ name: 'AuthApiError', status: 400, code: 'invalid_credentials' }).code).toBe(
      'WRONG_PIN',
    );
    expect(
      fromAuth({ name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' }).code,
    ).toBe('NETWORK');
    expect(
      fromStorage({
        name: 'StorageApiError',
        status: 400,
        statusCode: '403',
        message: 'new row violates row-level security policy',
      }).code,
    ).toBe('FORBIDDEN');
    expect(
      fromStorage({ name: 'StorageUnknownError', message: 'Network request failed' }).code,
    ).toBe('NETWORK');
    expect(
      fromStorage({ name: 'StorageApiError', status: 413, statusCode: '413', message: 'too large' })
        .code,
    ).toBe('BAD_INPUT');
    expect(fromThrown(new TypeError('Network request failed')).code).toBe('NETWORK');
    expect(fromThrown(new RotaError('BAD_INPUT')).code).toBe('BAD_INPUT');
  });
});

describe('SupabaseApi', () => {
  it('is what createApi builds in supabase mode, and needs a client', () => {
    const { client } = fakeClient();
    expect(
      createApi({ mode: 'supabase', client, storage: memoryStorage(), uuid: () => 'x' }),
    ).toBeInstanceOf(SupabaseApi);
    expect(() =>
      createApi({ mode: 'supabase', storage: memoryStorage(), uuid: () => 'x' }),
    ).toThrow(RotaError);
  });

  it('signs in with {tab}@naryad.local and nr_{pin}_kz, the role from app_metadata', async () => {
    const { api } = makeApi();
    expect((await failure(api.auth.signIn('1001', '0000'))).code).toBe('WRONG_PIN');
    const changes: unknown[] = [];
    api.auth.onChange((s) => changes.push(s?.tab_no ?? null));
    const s = await api.auth.signIn(' 1001 ', '1111');
    expect(s).toEqual({
      user_id: MASTER_ID,
      role: 'master',
      short_name: 'Жумабаев Н.',
      full_name: 'Жумабаев Нурлан',
      tab_no: '1001',
      pseudonym: 'M01',
    });
    expect(await api.auth.session()).toEqual(s);
    await api.auth.signOut();
    expect(await api.auth.session()).toBeNull();
    // the deferred SIGNED_IN and SIGNED_OUT events do not notify twice
    await new Promise((r) => setTimeout(r, 5));
    expect(changes).toEqual(['1001', null]);
  });

  it('passes create_order and order_action payloads through untouched', async () => {
    const { api, rpcCalls } = makeApi((call) =>
      call.target.startsWith('rpc:') ? { data: { id: 7, status: 'issued' } } : undefined,
    );
    await api.orders.create(
      {
        type: 'unplanned',
        priority: 'emergency',
        description: 'Течь масла',
        equipment_id: 20,
        assignee_id: WORKER_ID,
        client_ref: 'ref-1',
        due_in_min: 1,
      },
      'caid-1',
    );
    expect(rpcCalls('create_order')[0]?.args).toEqual({
      p: {
        type: 'unplanned',
        priority: 'emergency',
        description: 'Течь масла',
        equipment_id: 20,
        assignee_id: WORKER_ID,
        client_ref: 'ref-1',
        due_in_min: 1,
      },
      p_client_action_id: 'caid-1',
    });
    await api.orders.action(7, 'start', { pause_current: true }, 'caid-2');
    expect(rpcCalls('order_action')[0]?.args).toEqual({
      p_order_id: 7,
      p_action: 'start',
      p_payload: { pause_current: true },
      p_client_action_id: 'caid-2',
    });
    await api.orders.suggestAssignees(20);
    expect(rpcCalls('suggest_assignees')[0]?.args).toEqual({ p_equipment_id: 20 });
  });

  it('raises the database code as a RotaError', async () => {
    const { api } = makeApi((call) =>
      call.target === 'rpc:order_action'
        ? {
            error: {
              code: 'P0001',
              message: 'ANOTHER_IN_PROGRESS',
              details: '{"order_id":3,"number":104}',
            },
          }
        : undefined,
    );
    const err = await failure(api.orders.action(9, 'start', {}, 'c'));
    expect(err.code).toBe('ANOTHER_IN_PROGRESS');
    expect(err.message).toBe('Приостановить наряд №104 и начать этот?');
  });

  it('lists v_orders with filters, emergency first then by due_at', async () => {
    const { api, calls } = makeApi((call) =>
      call.target === 'v_orders' ? { data: [] } : undefined,
    );
    await api.orders.list({
      assignee_id: WORKER_ID,
      statuses: ['issued', 'queued'],
      since: '2026-10-01T00:00:00Z',
      limit: 5,
    });
    const ops = calls[0]?.ops ?? [];
    expect(calls[0]?.target).toBe('v_orders');
    expect(ops).toContainEqual(['eq', 'assignee_id', WORKER_ID]);
    expect(ops).toContainEqual(['in', 'status', ['issued', 'queued']]);
    expect(ops).toContainEqual(['gte', 'created_at', '2026-10-01T00:00:00Z']);
    expect(ops.filter((o) => o[0] === 'order').map((o) => o[1])).toEqual([
      'priority',
      'due_at',
      'id',
    ]);
    expect(ops).toContainEqual(['limit', 5]);
  });

  it('builds the board from active, rejected, done and ai_review plus closed today, brigade on the client', async () => {
    const rows = [
      { id: 1, brigade_id: 2, assignee_id: 'a' },
      { id: 2, brigade_id: null, assignee_id: 'b' },
      { id: 3, brigade_id: null, assignee_id: 'c' },
    ];
    const { api, calls } = makeApi((call) => {
      if (call.target === 'v_orders') return { data: rows };
      if (call.target === 'employees') {
        return {
          data: [
            { id: 'a', brigade_id: 1 },
            { id: 'b', brigade_id: 2 },
            { id: 'c', brigade_id: 3 },
          ],
        };
      }
      return undefined;
    });
    const board = await api.orders.forBoard({ brigade_id: 2 });
    expect(board.map((o) => o.id)).toEqual([1, 2]);
    const or = calls[0]?.ops.find((o) => o[0] === 'or');
    // 15:00 local on 08.10 → local midnight is 19:00 UTC the day before
    expect(or?.[1]).toBe(
      'status.in.(issued,accepted,queued,in_progress,paused,rework,rejected,done,ai_review),closed_at.gte."2026-10-07T19:00:00.000Z"',
    );
  });

  it('assembles the order card and maps material names', async () => {
    const { api } = makeApi((call) => {
      switch (call.target) {
        case 'v_orders':
          return { data: [{ id: 5, number: 150 }] };
        case 'order_events':
          return { data: [{ id: 1, action: 'create' }] };
        case 'order_photos':
          return { data: [] };
        case 'order_materials':
          return {
            data: [
              {
                id: 1,
                order_id: 5,
                material_id: 21,
                qty: 2,
                materials: { name: 'Кольцо уплотнительное', unit: 'шт' },
              },
            ],
          };
        case 'ai_reviews':
          return { data: [] };
        default:
          return undefined;
      }
    });
    const d = await api.orders.get(5);
    expect(d.order.number).toBe(150);
    expect(d.materials).toEqual([
      {
        id: 1,
        order_id: 5,
        material_id: 21,
        qty: 2,
        material_name: 'Кольцо уплотнительное',
        unit: 'шт',
      },
    ]);
    const missing = makeApi((call) => (call.target.startsWith('rpc:') ? undefined : { data: [] }));
    expect((await failure(missing.api.orders.get(99))).code).toBe('BAD_INPUT');
  });

  it('uploads the bytes as an ArrayBuffer to orders/{client_ref}/{kind}/{uuid}.jpg, then attach_photo', async () => {
    const { api, uploads, rpcCalls } = makeApi((call) =>
      call.target === 'rpc:attach_photo' ? { data: { id: 1, storage_path: 'p' } } : undefined,
    );
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    await api.photos.upload({
      client_ref: 'ref-9',
      kind: 'after',
      data: bytes.subarray(1, 3),
      source: 'camera',
      captured_at: '2026-10-08T09:59:00Z',
      dhash: 'aaaaaaaaaaaaaaaa',
      sha256: 'b'.repeat(64),
      width: 1600,
      height: 1200,
      bytes: 2,
      exif: null,
    });
    expect(uploads[0]?.bucket).toBe('photos');
    expect(uploads[0]?.path).toBe('orders/ref-9/after/11111111-2222-4333-8444-555555555555.jpg');
    expect(uploads[0]?.body).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(uploads[0]?.body as ArrayBuffer)]).toEqual([0xd8, 0xff]);
    expect(uploads[0]?.opts).toEqual({ contentType: 'image/jpeg', upsert: false });
    expect(rpcCalls('attach_photo')[0]?.args).toEqual({
      p: {
        client_ref: 'ref-9',
        kind: 'after',
        storage_path: 'orders/ref-9/after/11111111-2222-4333-8444-555555555555.jpg',
        source: 'camera',
        captured_at: '2026-10-08T09:59:00Z',
        dhash: 'aaaaaaaaaaaaaaaa',
        sha256: 'b'.repeat(64),
        width: 1600,
        height: 1200,
        bytes: 2,
        exif: null,
      },
    });
  });

  it('caches signed URLs until 5 minutes before they expire', async () => {
    const { api, signed } = makeApi();
    const first = await api.photos.url('orders/r/after/a.jpg');
    expect(first).toContain('n=1');
    clock = new Date(clock.getTime() + 54 * 60_000);
    expect(await api.photos.url('orders/r/after/a.jpg')).toBe(first);
    clock = new Date(clock.getTime() + 2 * 60_000);
    expect(await api.photos.url('orders/r/after/a.jpg')).not.toBe(first);
    expect(await api.photos.url('orders/r/after/missing.jpg')).toBe('');

    const urls = await api.photos.urls([
      'orders/r/after/a.jpg',
      'orders/r/before/b.jpg',
      'orders/r/before/c.jpg',
      'orders/r/before/missing.jpg',
    ]);
    expect(Object.keys(urls).sort()).toEqual([
      'orders/r/after/a.jpg',
      'orders/r/before/b.jpg',
      'orders/r/before/c.jpg',
    ]);
    // the cached one is not signed again
    expect(signed[signed.length - 1]).toEqual([
      'orders/r/before/b.jpg',
      'orders/r/before/c.jpg',
      'orders/r/before/missing.jpg',
    ]);
    expect(await api.photos.urls([])).toEqual({});
  });

  it('verifies by rules without a functions client and falls back to the review that moved the order on', async () => {
    const { api, rpcCalls } = makeApi((call) => {
      if (call.target === 'rpc:ai_check_rules') {
        return {
          error: {
            code: 'P0001',
            message: 'BAD_TRANSITION',
            details: 'the order is not waiting for a check',
          },
        };
      }
      if (call.target === 'orders') return { data: { ai_review_id: 44 } };
      if (call.target === 'ai_reviews') return { data: { id: 44, verdict: 'rework' } };
      return undefined;
    });
    expect(await api.ai.verify(8)).toEqual({ id: 44, verdict: 'rework' });
    expect(rpcCalls('ai_check_rules')[0]?.args).toEqual({ p_order_id: 8 });
  });

  describe('ai.verify through the ai-verify Edge Function', () => {
    const llmReview = {
      id: 51,
      order_id: 8,
      attempt: 1,
      verdict: 'accepted',
      model: 'claude-sonnet-5-5',
    };
    const rulesReview = { id: 52, order_id: 8, attempt: 1, verdict: 'accepted', model: 'rules' };
    const rules: Responder = (call) =>
      call.target === 'rpc:ai_check_rules' ? { data: rulesReview } : undefined;
    const failing =
      (error: unknown): FakeInvoke =>
      async () => ({ data: null, error });

    it('returns the review of ai-verify without the rules check', async () => {
      const invocations: [string, unknown][] = [];
      const { api, rpcCalls } = makeApi(rules, async (name, options) => {
        invocations.push([name, options]);
        return { data: { review: llmReview }, error: null };
      });
      expect(await api.ai.verify(8)).toEqual(llmReview);
      expect(invocations).toEqual([
        ['ai-verify', { body: { order_id: 8, source: 'app' }, timeout: AI_VERIFY_TIMEOUT_MS }],
      ]);
      expect(rpcCalls('ai_check_rules')).toHaveLength(0);
    });

    it('reads the review of an already reviewed attempt and a JSON text body', async () => {
      const { api } = makeApi(rules, async () => ({
        data: JSON.stringify({ review: llmReview, already_reviewed: true }),
        error: null,
      }));
      expect(await api.ai.verify(8)).toEqual(llmReview);
    });

    it.each([
      [
        'a network error',
        { name: 'FunctionsFetchError', context: new TypeError('Network request failed') },
      ],
      ['a missing function', { name: 'FunctionsHttpError', context: { status: 404 } }],
      ['a server error', { name: 'FunctionsHttpError', context: { status: 503 } }],
      ['a relay error', { name: 'FunctionsRelayError', context: { status: 400 } }],
      ['a rate limit', { name: 'FunctionsHttpError', context: { status: 429 } }],
    ])('falls back to the rules check on %s', async (_, error) => {
      const { api, rpcCalls } = makeApi(rules, failing(error));
      expect(await api.ai.verify(8)).toEqual(rulesReview);
      expect(rpcCalls('ai_check_rules')[0]?.args).toEqual({ p_order_id: 8 });
    });

    it('falls back when invoke throws or answers without a review', async () => {
      const thrown = makeApi(rules, async () => {
        throw new Error('boom');
      });
      expect(await thrown.api.ai.verify(8)).toEqual(rulesReview);
      const empty = makeApi(rules, async () => ({ data: { ok: true }, error: null }));
      expect(await empty.api.ai.verify(8)).toEqual(rulesReview);
    });

    it('falls back to the rules check after AI_VERIFY_TIMEOUT_MS without an answer', async () => {
      vi.useFakeTimers();
      const { api, rpcCalls } = makeApi(rules, () => new Promise(() => undefined));
      const pending = api.ai.verify(8);
      // longer than the 50 s LLM stage of ai-verify, so a slow but valid answer is never preempted
      expect(AI_VERIFY_TIMEOUT_MS).toBeGreaterThanOrEqual(55_000);
      await vi.advanceTimersByTimeAsync(AI_VERIFY_TIMEOUT_MS - 1);
      expect(rpcCalls('ai_check_rules')).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual(rulesReview);
    });

    it('finds the review that moved the order on when ai-verify answers 409', async () => {
      const { api } = makeApi(
        (call) => {
          if (call.target === 'rpc:ai_check_rules') {
            return { error: { code: 'P0001', message: 'BAD_TRANSITION', details: null } };
          }
          if (call.target === 'orders') return { data: { ai_review_id: 44 } };
          if (call.target === 'ai_reviews') return { data: { id: 44, verdict: 'rework' } };
          return undefined;
        },
        failing({ name: 'FunctionsHttpError', context: { status: 409 } }),
      );
      expect(await api.ai.verify(8)).toEqual({ id: 44, verdict: 'rework' });
    });

    it('keeps 401 and 403 as FORBIDDEN and 400 as BAD_INPUT, without the rules check', async () => {
      for (const [status, code] of [
        [401, 'FORBIDDEN'],
        [403, 'FORBIDDEN'],
        [400, 'BAD_INPUT'],
      ] as const) {
        const { api, rpcCalls } = makeApi(
          rules,
          failing({ name: 'FunctionsHttpError', context: { status } }),
        );
        expect((await failure(api.ai.verify(8))).code).toBe(code);
        expect(rpcCalls('ai_check_rules')).toHaveLength(0);
      }
    });

    it('works with the real supabase-js functions client', async () => {
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      for (const [fnStatus, expected] of [
        [200, llmReview],
        [404, rulesReview],
        [503, rulesReview],
      ] as const) {
        const urls: string[] = [];
        const client = createClient('https://example.supabase.co', 'sb_publishable_test', {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          global: {
            fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
              const url = String(input);
              urls.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
              if (url.includes('/functions/v1/ai-verify')) {
                expect(JSON.parse(String(init?.body))).toEqual({ order_id: 8, source: 'app' });
                return fnStatus === 200
                  ? json({ review: llmReview })
                  : json({ error: 'X' }, fnStatus);
              }
              if (url.includes('/rest/v1/rpc/ai_check_rules')) return json(rulesReview);
              return json({}, 404);
            },
          },
        });
        const api = new SupabaseApi({
          mode: 'supabase',
          client,
          storage: memoryStorage(),
          uuid: () => '11111111-2222-4333-8444-555555555555',
          now: () => clock,
        });
        expect(await api.ai.verify(8)).toEqual(expected);
        expect(urls[0]).toBe('POST /functions/v1/ai-verify');
        expect(urls.includes('POST /rest/v1/rpc/ai_check_rules')).toBe(fnStatus !== 200);
      }
    });

    it('reads the status of a functions error', () => {
      expect(functionErrorStatus({ name: 'FunctionsHttpError', context: { status: 502 } })).toBe(
        502,
      );
      expect(functionErrorStatus({ name: 'FunctionsRelayError', context: { status: 500 } })).toBe(
        0,
      );
      expect(
        functionErrorStatus({ name: 'FunctionsFetchError', context: new TypeError('x') }),
      ).toBe(0);
      expect(functionErrorStatus(null)).toBe(0);
    });
  });

  it('counts the shift from the server clock and stopped units', async () => {
    const counts: Record<string, number> = { orders: 3, v_orders: 1, equipment: 2 };
    const { api, calls } = makeApi((call) => ({ count: counts[call.target] ?? 0 }));
    const c = await api.shift.counters(new Date('2026-10-08T03:00:00Z'));
    expect(c).toEqual({ issued: 3, done: 3, overdue: 1, stopped: 2 });
    const done = calls.find((x) => x.ops.some((o) => o[0] === 'in'));
    expect(done?.ops).toContainEqual(['in', 'status', ['done', 'ai_review', 'closed']]);
    expect(done?.ops).toContainEqual([
      'or',
      'done_at.gte."2026-10-08T03:00:00.000Z",closed_at.gte."2026-10-08T03:00:00.000Z"',
    ]);
    expect(calls.find((x) => x.target === 'v_orders')?.ops).toContainEqual([
      'eq',
      'is_overdue',
      true,
    ]);
  });

  it('sums equipment downtime over stopped orders', () => {
    const now = new Date('2026-10-08T10:00:00Z');
    const o = (
      created: string,
      done: string | null,
      stopped: boolean,
      cancelled: string | null = null,
    ) =>
      ({
        created_at: created,
        done_at: done,
        cancelled_at: cancelled,
        equipment_stopped: stopped,
      }) as never;
    expect(
      downtimeMinutes(
        [
          o('2026-10-08T08:00:00Z', '2026-10-08T09:00:00Z', true),
          o('2026-10-08T09:30:00Z', null, true),
          o('2026-10-08T07:00:00Z', null, true, '2026-10-08T07:10:00Z'),
          o('2026-10-08T00:00:00Z', null, false),
        ],
        now,
      ),
    ).toBe(60 + 30 + 10);
  });

  it('folds settings over the defaults and checks a patch before writing', async () => {
    expect(
      foldSettings([
        { key: 'demo_mode', value: false },
        { key: 'demo_time_scale', value: 10 },
        { key: 'unknown', value: 1 },
      ]),
    ).toMatchObject({
      demo_mode: false,
      demo_time_scale: 10,
      remind_before_min: 30,
    });
    const { api, rpcCalls } = makeApi((call) =>
      call.target === 'settings' ? { data: [{ key: 'demo_mode', value: true }] } : undefined,
    );
    await api.auth.signIn('1001', '1111');
    const err = await failure(api.demo.updateSettings({ demo_mode: true, remind_before_min: 5 }));
    expect(err.code).toBe('FORBIDDEN');
    expect(rpcCalls('set_setting')).toHaveLength(0);
    expect((await failure(api.demo.updateSettings({ demo_time_scale: 20 }))).code).toBe(
      'BAD_INPUT',
    );
    const s = await api.demo.updateSettings({ demo_mode: true, demo_time_scale: 10 });
    expect(rpcCalls('set_setting').map((c) => c.args)).toEqual([
      { p_key: 'demo_mode', p_value: true },
      { p_key: 'demo_time_scale', p_value: 10 },
    ]);
    expect(s.demo_mode).toBe(true);
  });

  it('unregisters the push token of this session on sign out', async () => {
    const { api, rpcCalls } = makeApi();
    await api.auth.signIn('2001', '1234');
    await api.notifications.registerPushToken({
      token: 'ExpoPushToken[abc]',
      platform: 'android',
      device_name: null,
    });
    expect(rpcCalls('register_push_token')[0]?.args).toEqual({
      p_token: 'ExpoPushToken[abc]',
      p_platform: 'android',
    });
    await api.auth.signOut();
    expect(rpcCalls('unregister_push_token')[0]?.args).toEqual({ p_token: 'ExpoPushToken[abc]' });
  });

  it('runs realtime.subscribe on its own channel and maps tables to topics', async () => {
    const { api, channels } = makeApi();
    await api.auth.signIn('2001', '1234');
    const events: RealtimeEvent[] = [];
    const offOrders = api.realtime.subscribe('orders', (e) => events.push(e));
    const offReviews = api.realtime.subscribe('reviews', (e) => events.push(e));
    expect(channels).toHaveLength(1);
    const ch = channels[0];
    expect(ch?.name).toBe(`rota-api-${WORKER_ID}`);
    expect(ch?.bindings.find((b) => b.filter.table === 'notifications')?.filter).toMatchObject({
      filter: `recipient_id=eq.${WORKER_ID}`,
    });
    ch?.statusCb?.('SUBSCRIBED');
    // the join is a refresh for every topic
    expect(events).toEqual([
      { topic: 'orders', type: 'UPDATE' },
      { topic: 'reviews', type: 'UPDATE' },
    ]);
    events.length = 0;
    for (const b of ch?.bindings ?? []) {
      if (b.filter.table === 'orders') b.cb({ eventType: 'INSERT', new: { id: 3 }, old: {} });
      if (b.filter.table === 'ai_reviews')
        b.cb({ eventType: 'INSERT', new: { id: 1, order_id: 3 }, old: {} });
    }
    expect(events).toEqual([
      { topic: 'orders', type: 'INSERT', row: { id: 3 } },
      { topic: 'reviews', type: 'INSERT', row: { id: 1, order_id: 3 } },
    ]);
    api.realtime.resync();
    expect(events).toHaveLength(4);
    offOrders();
    expect(channels).toHaveLength(1);
    offReviews();
    expect(channels).toHaveLength(0);
    api.dispose();
  });

  describe('ai.shiftSummary and ai.explainRating through the report Edge Functions', () => {
    const REPORT: ShiftReport = {
      period: { from: '2026-10-08T03:00:00Z', to: '2026-10-08T10:01:00Z' },
      counts: {
        issued: 4,
        accepted: 3,
        done: 2,
        closed: 5,
        overdue: 1,
        rejected: 0,
        rework: 0,
        cancelled: 0,
        active_now: 6,
      },
      rejected_reasons: [],
      workload: [],
      downtime: [],
      downtime_hours: 0,
      reaction_avg_min: 3.5,
      execution_avg_min: 80,
      on_time_share: 0.9,
      verdicts: { accepted: 2 },
      master_overrides: 0,
      top_issues: [],
      top_equipment: [],
    };
    const ROW: RatingRow = {
      kind: 'worker',
      id: WORKER_ID,
      name: 'Ахметов Е.',
      brigade_id: 1,
      closed: 12,
      q: 0.86,
      t: 0.92,
      f: 0.9,
      v: 0.7,
      d: 1,
      score: 88.1,
      rank: 2,
      note: null,
    };
    const numbers: Responder = (call) => {
      if (call.target === 'rpc:shift_report') return { data: REPORT };
      if (call.target === 'rpc:rating') return { data: [ROW] };
      return undefined;
    };
    const input = { from: '2026-10-08T03:00:00Z', to: '2026-10-08T10:01:00Z', filters: { area_id: 2 } };
    const LLM = {
      summary: 'За смену выдано 4 наряда, исполнено 2. Просрочен 1 наряд.',
      recommendations: ['Разобрать просрочку.', 'Проверить К-3.', 'Закрыть наряды.'],
      source: 'llm',
      model: 'claude-sonnet-5-5',
      cached: false,
      generated_at: '2026-10-08T10:00:30Z',
    };

    it('returns the summary of ai-shift-summary and passes the scope and refresh', async () => {
      const invocations: [string, unknown][] = [];
      const { api, rpcCalls } = makeApi(numbers, async (name, options) => {
        invocations.push([name, options]);
        return { data: LLM, error: null };
      });
      expect(await api.ai.shiftSummary(input)).toEqual(LLM);
      await api.ai.shiftSummary(input, { refresh: true });
      expect(invocations).toEqual([
        [
          'ai-shift-summary',
          { body: { from: input.from, to: input.to, filters: { area_id: 2 } }, timeout: AI_REPORT_TIMEOUT_MS },
        ],
        [
          'ai-shift-summary',
          {
            body: { from: input.from, to: input.to, filters: { area_id: 2 }, refresh: true },
            timeout: AI_REPORT_TIMEOUT_MS,
          },
        ],
      ]);
      // the function reads the report itself
      expect(rpcCalls('shift_report')).toHaveLength(0);
    });

    it.each([
      ['no functions client', undefined],
      ['an HTTP error', async () => ({ data: null, error: { name: 'FunctionsHttpError', context: { status: 500 } } })],
      ['a thrown error', async () => Promise.reject(new Error('offline'))],
      ['an answer without recommendations', async () => ({ data: { summary: 'x', recommendations: [] }, error: null })],
    ] as [string, FakeInvoke | undefined][])('falls back to the rules summary on %s', async (_, invoke) => {
      const { api, rpcCalls } = makeApi(numbers, invoke);
      const s = await api.ai.shiftSummary(input);
      expect(s).toEqual({
        ...mockShiftSummary(REPORT),
        source: 'rules',
        model: 'rules',
        generated_at: clock.toISOString(),
      });
      expect(rpcCalls('shift_report')[0]?.args).toEqual({
        p_from: input.from,
        p_to: input.to,
        p_filters: { area_id: 2 },
      });
    });

    it('falls back to the rules summary after AI_REPORT_TIMEOUT_MS', async () => {
      vi.useFakeTimers();
      const { api } = makeApi(numbers, () => new Promise(() => undefined));
      const pending = api.ai.shiftSummary(input);
      await vi.advanceTimersByTimeAsync(AI_REPORT_TIMEOUT_MS);
      expect((await pending).source).toBe('rules');
    });

    it('explains the rating through ai-explain-rating, else with the rules text', async () => {
      const invocations: [string, unknown][] = [];
      const period = { from: '2026-09-08T10:00:00Z', to: '2026-10-08T10:00:00Z' };
      const ok = makeApi(numbers, async (name, options) => {
        invocations.push([name, options]);
        return { data: JSON.stringify({ text: 'Три предложения от модели.', source: 'llm' }), error: null };
      });
      await ok.api.auth.signIn('2001', '1234');
      expect(await ok.api.ai.explainRating(WORKER_ID, period)).toBe('Три предложения от модели.');
      expect(invocations).toEqual([
        ['ai-explain-rating', { body: { employee_id: WORKER_ID, ...period }, timeout: AI_REPORT_TIMEOUT_MS }],
      ]);
      expect(ok.rpcCalls('rating')).toHaveLength(0);
      // a worker never asks about someone else, not even through the function
      expect((await failure(ok.api.ai.explainRating(MASTER_ID, period))).code).toBe('FORBIDDEN');
      expect(invocations).toHaveLength(1);

      const down = makeApi(numbers, async () => ({ data: null, error: { name: 'FunctionsFetchError' } }));
      await down.api.auth.signIn('2001', '1234');
      expect(await down.api.ai.explainRating(WORKER_ID, period)).toBe(mockExplainRating(ROW));
    });
  });
});
