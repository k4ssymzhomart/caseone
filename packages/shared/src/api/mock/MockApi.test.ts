import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runContract } from '../contract';
import {
  memoryStorage,
  type CreateApiOptions,
  type KeyValueStorage,
  type MockOptions,
} from '../RotaApi';
import { createApi } from '../index';
import { isRotaError } from '../errors';
import type { AppNotification, RealtimeEvent } from '../../domain/types';
import { shiftStart } from '../../format/time';
import { formatScore } from '../../format/number';
import { MockApi } from './MockApi';

const apis: MockApi[] = [];

function makeMock(options: Partial<CreateApiOptions> = {}, mock: MockOptions = {}): MockApi {
  const api = new MockApi({
    mode: 'mock',
    storage: options.storage ?? memoryStorage(),
    uuid: randomUUID,
    ...options,
    mock: { latencyMs: 0, aiDelayMs: 0, watchdog: false, ...mock },
  });
  apis.push(api);
  return api;
}

afterEach(() => {
  for (const api of apis.splice(0)) api.stop();
  vi.useRealTimers();
});

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (isRotaError(e)) return e.code;
    throw e;
  }
  return 'OK';
}

async function idOf(api: MockApi, tab: string): Promise<string> {
  const w = (await api.workers.statuses()).find((x) => x.tab_no === tab);
  if (!w) throw new Error(tab);
  return w.id;
}

async function notesOf(api: MockApi, tab: string, pin: string): Promise<AppNotification[]> {
  await api.auth.signIn(tab, pin);
  return api.notifications.list();
}

runContract(() => makeMock(), { name: 'MockApi contract', uuid: randomUUID, timeoutMs: 10_000 });

describe('MockApi store', () => {
  it('seeds the demo start state with a week of history', async () => {
    const api = makeMock();
    await api.auth.signIn('1001', '1111');
    const all = await api.orders.list();
    const history = all.filter((o) => !o.is_demo);
    expect(history.length).toBeGreaterThanOrEqual(30);
    expect(history.length).toBeLessThanOrEqual(50);
    expect(
      history.every((o) => o.status === 'closed' && o.ai_verdict != null && o.final_score != null),
    ).toBe(true);
    const demo = all.filter((o) => o.is_demo);
    expect(demo).toHaveLength(19);
    // demo numbers come right after the history
    const maxHistory = Math.max(...history.map((o) => o.number));
    expect(Math.min(...demo.map((o) => o.number))).toBe(maxHistory + 1);
    // the 12 closed demo orders carry reviews with a full breakdown
    const closed = demo.filter((o) => o.status === 'closed');
    expect(closed).toHaveLength(12);
    const detail = await api.orders.get(closed[0]?.id ?? 0);
    expect(detail.reviews[0]?.checks.map((c) => c.id)).toEqual([
      'R1',
      'R2',
      'R3',
      'R4',
      'L1',
      'L2',
    ]);
    expect(detail.reviews[0]?.checks.reduce((s, c) => s + c.points, 0)).toBe(
      detail.reviews[0]?.score,
    );
    expect(detail.events.map((e) => e.action)).toEqual([
      'create',
      'accept',
      'start',
      'complete',
      'review_started',
      'ai_result',
      'close',
    ]);
  });

  it('continues order numbers after the demo orders', async () => {
    const api = makeMock();
    await api.auth.signIn('1001', '1111');
    const max = Math.max(...(await api.orders.list()).map((o) => o.number));
    const o = await api.orders.create(
      {
        type: 'planned',
        priority: 'planned',
        description: 'ППР: замена роликов',
        equipment_id: 11,
        assignee_id: await idOf(api, '2001'),
        client_ref: randomUUID(),
      },
      randomUUID(),
    );
    expect(o.number).toBe(max + 1);
  });

  it('persists through the storage, so a reload keeps orders and the session', async () => {
    const storage = memoryStorage();
    const a = makeMock({ storage });
    await a.auth.signIn('1001', '1111');
    const created = await a.orders.create(
      {
        type: 'unplanned',
        priority: 'high',
        description: 'Сход ленты',
        equipment_id: 13,
        assignee_id: await idOf(a, '2001'),
        client_ref: randomUUID(),
      },
      randomUUID(),
    );
    const b = makeMock({ storage });
    expect((await b.auth.session())?.tab_no).toBe('1001');
    expect((await b.orders.get(created.id)).order.description).toBe('Сход ленты');
    await b.demo.reset();
    const c = makeMock({ storage });
    await c.auth.signIn('1001', '1111');
    expect(await code(c.orders.get(created.id))).toBe('BAD_INPUT');
  });

  it('reseeds when the stored state is unreadable', async () => {
    const storage = memoryStorage();
    await storage.setItem('rota.mock.state', '{"version": 0}');
    const api = makeMock({ storage });
    await api.auth.signIn('1001', '1111');
    expect((await api.orders.list()).length).toBeGreaterThan(19);
  });

  it('keeps file uris of photos across a reload but not data: uris', async () => {
    const storage = memoryStorage();
    const a = makeMock({ storage });
    await a.auth.signIn('1001', '1111');
    const ref = randomUUID();
    const base = {
      client_ref: ref,
      kind: 'before' as const,
      data: new Uint8Array([1, 2, 3]),
      source: 'gallery' as const,
      captured_at: null,
      dhash: null,
      sha256: '',
      width: 10,
      height: 10,
      bytes: 3,
      exif: null,
    };
    const file = await a.photos.upload({ ...base, uri: 'file:///tmp/pump.jpg' });
    const inline = await a.photos.upload(base);
    expect(await a.photos.url(file.storage_path)).toBe('file:///tmp/pump.jpg');
    expect(await a.photos.url(inline.storage_path)).toBe('data:image/jpeg;base64,AQID');
    const b = makeMock({ storage });
    expect(await b.photos.urls([file.storage_path, inline.storage_path])).toEqual({
      [file.storage_path]: 'file:///tmp/pump.jpg',
    });
    // the before photos join the order created with their client_ref
    const o = await b.orders.create(
      {
        type: 'unplanned',
        priority: 'normal',
        description: 'Течь масла',
        equipment_id: 20,
        assignee_id: await idOf(b, '2001'),
        client_ref: ref,
      },
      randomUUID(),
    );
    expect((await b.orders.get(o.id)).photos.map((p) => p.kind)).toEqual(['before', 'before']);
  });

  it('works through createApi with mode mock', async () => {
    const api = createApi({
      mode: 'mock',
      storage: memoryStorage(),
      uuid: randomUUID,
      mock: { latencyMs: 0, watchdog: false },
    });
    expect(api).toBeInstanceOf(MockApi);
    expect((await api.auth.signIn('2001', '1234')).role).toBe('worker');
    (api as MockApi).stop();
  });

  it('survives a storage that throws', async () => {
    const broken: KeyValueStorage = {
      getItem: () => Promise.reject(new Error('no storage')),
      setItem: () => Promise.reject(new Error('no storage')),
      removeItem: () => Promise.reject(new Error('no storage')),
    };
    const api = makeMock({ storage: broken });
    await api.auth.signIn('1001', '1111');
    expect((await api.workers.statuses()).length).toBe(15);
  });
});

describe('MockApi calls', () => {
  it('takes 150 to 300 ms per call by default', async () => {
    const api = new MockApi({
      mode: 'mock',
      storage: memoryStorage(),
      uuid: randomUUID,
      mock: { watchdog: false },
    });
    apis.push(api);
    const t0 = Date.now();
    await api.auth.signIn('1001', '1111');
    const t1 = Date.now();
    expect(t1 - t0).toBeGreaterThanOrEqual(140);
    expect(t1 - t0).toBeLessThan(1000);
  });

  it('injects errors for tests', async () => {
    const api = makeMock();
    await api.auth.signIn('1001', '1111');
    api.injectError('NETWORK', { method: 'orders' });
    expect(await code(api.orders.list())).toBe('NETWORK');
    expect(await code(api.orders.list())).toBe('OK');
    api.injectError('BAD_TRANSITION', { method: 'orders.action', times: 2 });
    expect(await code(api.workers.statuses())).toBe('OK');
    expect(await code(api.orders.action(1, 'accept', {}, randomUUID()))).toBe('BAD_TRANSITION');
    expect(await code(api.orders.action(1, 'accept', {}, randomUUID()))).toBe('BAD_TRANSITION');
    api.injectError('UNKNOWN', { times: Infinity });
    expect(await code(api.directories.get())).toBe('UNKNOWN');
    api.clearErrors();
    expect(await code(api.directories.get())).toBe('OK');
  });

  it('refuses data calls without a session and staff calls from workers', async () => {
    const api = makeMock();
    expect(await code(api.orders.list())).toBe('FORBIDDEN');
    expect(await code(api.directories.get())).toBe('FORBIDDEN');
    await api.auth.signIn('2001', '1234');
    expect(await code(api.demo.reset())).toBe('FORBIDDEN');
    expect(await code(api.orders.suggestAssignees(20))).toBe('FORBIDDEN');
    expect(
      await code(
        api.reports.shift({ from: new Date(0).toISOString(), to: new Date().toISOString() }),
      ),
    ).toBe('FORBIDDEN');
    expect(await code(api.demo.updateSettings({ demo_mode: false }))).toBe('FORBIDDEN');
    // a worker sees only own orders, and other workers' orders are not found
    const own = await api.orders.list();
    expect(own.every((o) => o.assignee_short_name === 'Ахметов Е.')).toBe(true);
    const other = (
      await (async () => {
        await api.auth.signIn('1001', '1111');
        return api.orders.list({ statuses: ['in_progress'] });
      })()
    )[0];
    await api.auth.signIn('2001', '1234');
    expect(await code(api.orders.get(other?.id ?? 0))).toBe('BAD_INPUT');
  });

  it('lets a master change only the demo settings', async () => {
    const api = makeMock();
    await api.auth.signIn('1001', '1111');
    expect(
      (await api.demo.updateSettings({ demo_mode: false, demo_time_scale: 10 })).demo_time_scale,
    ).toBe(10);
    expect(await code(api.demo.updateSettings({ remind_before_min: 5 }))).toBe('FORBIDDEN');
    expect(await code(api.demo.updateSettings({ demo_time_scale: 20 }))).toBe('BAD_INPUT');
    await api.auth.signIn('9001', '9999');
    expect((await api.demo.updateSettings({ remind_before_min: 5 })).remind_before_min).toBe(5);
  });

  it('marks notifications read and counts unread', async () => {
    const api = makeMock();
    await api.auth.signIn('1001', '1111');
    await api.orders.create(
      {
        type: 'unplanned',
        priority: 'normal',
        description: 'Шум подшипника',
        equipment_id: 13,
        assignee_id: await idOf(api, '2001'),
        client_ref: randomUUID(),
      },
      randomUUID(),
    );
    await api.auth.signIn('2001', '1234');
    expect(await api.notifications.unreadCount()).toBe(1);
    const [n] = await api.notifications.list();
    expect(n?.kind).toBe('new_order');
    await api.notifications.markRead(n?.id ?? 0);
    expect(await api.notifications.unreadCount()).toBe(0);
    expect(
      await code(
        api.notifications.registerPushToken({ token: 'nope', platform: 'ios', device_name: null }),
      ),
    ).toBe('BAD_INPUT');
    await api.notifications.registerPushToken({
      token: 'ExponentPushToken[abc]',
      platform: 'ios',
      device_name: 'iPhone',
    });
    await api.notifications.unregisterPushToken('ExponentPushToken[abc]');
  });

  it('switches shifts: self or a master', async () => {
    const api = makeMock();
    await api.auth.signIn('2001', '1234');
    const me = (await api.auth.session())?.user_id ?? '';
    await api.workers.setOnShift(me, false);
    expect((await api.workers.statuses()).find((w) => w.id === me)?.status).toBe('off');
    await api.auth.signIn('1001', '1111');
    const kim = await idOf(api, '2009');
    await api.auth.signIn('2001', '1234');
    expect(await code(api.workers.setOnShift(kim, false))).toBe('FORBIDDEN');
  });
});

describe('MockApi AI check', () => {
  async function completeK2(api: MockApi, withPhoto: boolean): Promise<number> {
    const ivanov = await api.auth.signIn('2002', '1234');
    const k2 = (
      await api.orders.list({ assignee_id: ivanov.user_id, statuses: ['in_progress'] })
    ).find((o) => o.equipment_id === 12);
    if (!k2) throw new Error('К-2');
    if (withPhoto) {
      await api.photos.upload({
        client_ref: k2.client_ref,
        kind: 'after',
        data: new Uint8Array([1]),
        source: 'camera',
        captured_at: new Date().toISOString(),
        dhash: 'aaaaaaaaaaaaaaaa',
        sha256: 'a'.repeat(64),
        width: 1,
        height: 1,
        bytes: 1,
        exif: null,
      });
    }
    await api.orders.action(
      k2.id,
      'complete',
      {
        works_done: 'Заменил подшипник 3626, заложил смазку, проверил шум',
        fault_code: 'М-02',
        materials: [{ material_id: 2, qty: 1 }],
      },
      randomUUID(),
    );
    return k2.id;
  }

  it('gives the verdict 2.5 s after complete, and ai.verify waits for it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const api = makeMock({}, { aiDelayMs: 2500 });
    const id = await completeK2(api, true);
    expect(await api.ai.review(id)).toBeNull();
    const events: RealtimeEvent[] = [];
    api.realtime.subscribe('reviews', (e) => events.push(e));
    const verify = api.ai.verify(id);
    await vi.advanceTimersByTimeAsync(2400);
    expect(events).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    const review = await verify;
    expect(review).toMatchObject({
      verdict: 'accepted',
      model: 'mock',
      needs_master_review: false,
      attempt: 1,
    });
    expect(review.checks.map((c) => c.id)).toEqual(['R1', 'R2', 'R3', 'R4', 'L1', 'L2']);
    expect(events).toHaveLength(1);
    // the worker gets the report, the master the review_ready notification
    const worker = await api.notifications.list();
    expect(worker.find((n) => n.kind === 'report')?.body).toBe(
      `Наряд №${(await api.orders.get(id)).order.number} проверен ИИ: Принято, ${formatScore(review.score)}. Ждёт подтверждения мастера.`,
    );
    const master = await notesOf(api, '1001', '1111');
    expect(master.some((n) => n.kind === 'review_ready' && n.url === `/order/${id}/review`)).toBe(
      true,
    );
  });

  it('master return sends the order back, resume_rework counts the gap as a pause, second attempt is reviewed', async () => {
    const api = makeMock();
    const id = await completeK2(api, true);
    await api.auth.signIn('1001', '1111');
    expect(await code(api.orders.action(id, 'return', {}, randomUUID()))).toBe('MISSING_REASON');
    const back = await api.orders.action(
      id,
      'return',
      { comment: 'Нет фото смазки' },
      randomUUID(),
    );
    expect(back).toMatchObject({ status: 'rework', rework_count: 1 });
    await api.auth.signIn('2002', '1234');
    expect((await api.orders.action(id, 'resume_rework', {}, randomUUID())).status).toBe(
      'in_progress',
    );
    await api.orders.action(
      id,
      'complete',
      {
        works_done: 'Заменил подшипник, заложил смазку Литол, проверил',
        fault_code: 'М-02',
        materials: [{ material_id: 2, qty: 1 }],
      },
      randomUUID(),
    );
    const second = await api.ai.verify(id);
    expect(second.attempt).toBe(2);
    expect((await api.orders.get(id)).reviews.map((r) => r.attempt)).toEqual([1, 2]);
  });

  it('flags a reused photo from another order', async () => {
    const api = makeMock();
    const k2 = await completeK2(api, true);
    // Петренко closes К-1 with the very same picture
    const petrenko = await api.auth.signIn('2007', '1234');
    const k1 = (
      await api.orders.list({ assignee_id: petrenko.user_id, statuses: ['in_progress'] })
    )[0];
    if (!k1) throw new Error('К-1');
    await api.photos.upload({
      client_ref: k1.client_ref,
      kind: 'after',
      data: new Uint8Array([1]),
      source: 'camera',
      captured_at: new Date().toISOString(),
      dhash: 'aaaaaaaaaaaaaaab',
      sha256: 'b'.repeat(64),
      width: 1,
      height: 1,
      bytes: 1,
      exif: null,
    });
    await api.orders.action(
      k1.id,
      'complete',
      {
        works_done: 'Отцентровал привод, заменил муфту',
        fault_code: 'М-04',
        materials: [{ material_id: 10, qty: 1 }],
      },
      randomUUID(),
    );
    const review = await api.ai.verify(k1.id);
    expect(review.verdict).toBe('rework');
    const k2Number = (
      await (async () => {
        await api.auth.signIn('1001', '1111');
        return api.orders.get(k2);
      })()
    ).order.number;
    expect(review.checks.find((c) => c.id === 'R2')?.message_ru).toContain(
      `фото совпадает с фото наряда №${k2Number}`,
    );
  });
});

describe('MockApi watchdog', () => {
  it('sends reminder, overdue (worker and master), escalation and manager overdue with dedupe', async () => {
    let t = Date.parse('2026-10-08T05:00:00Z'); // 10:00 local
    const api = makeMock({ now: () => new Date(t) });
    await api.auth.signIn('1001', '1111');
    const akhmetov = await idOf(api, '2001');
    const o = await api.orders.create(
      {
        type: 'unplanned',
        priority: 'normal',
        description: 'Шум подшипника',
        equipment_id: 13,
        assignee_id: akhmetov,
        client_ref: randomUUID(),
        due_in_min: 1,
      },
      randomUUID(),
    );
    const kinds = async (tab: string, pin: string): Promise<string[]> =>
      (await notesOf(api, tab, pin))
        .filter((n) => n.order_id === o.id)
        .map((n) => n.kind)
        .sort();

    t += 29_000; // 31 s left: no reminder yet
    await api.tick();
    expect(await kinds('2001', '1234')).toEqual(['new_order']);

    t += 2_000; // 29 s left
    await api.tick();
    await api.tick();
    const reminder = (await notesOf(api, '2001', '1234')).find((n) => n.kind === 'reminder');
    expect(reminder?.body).toBe(
      `Через 1 мин истекает срок наряда №${o.number}. Конвейер К-3, Участок дробления.`,
    );
    expect(reminder?.dedupe_key).toBe(`rem:${o.id}:${Math.floor(Date.parse(o.due_at) / 1000)}`);

    t += 30_000; // 1 s past the deadline
    await api.tick();
    await api.tick();
    const overdue = (await notesOf(api, '2001', '1234')).filter((n) => n.kind === 'overdue');
    expect(overdue).toHaveLength(1);
    expect(overdue[0]?.body).toBe(
      `Наряд №${o.number} просрочен на 1 мин. Конвейер К-3, Участок дробления. Исполнитель: Ахметов Е. Статус: Выдан с 10:00.`,
    );
    const masterOverdue = (await notesOf(api, '1001', '1111')).filter(
      (n) => n.kind === 'overdue' && n.order_id === o.id,
    );
    expect(masterOverdue.map((n) => n.dedupe_key)).toEqual(overdue.map((n) => n.dedupe_key));

    t += 15 * 60_000; // the repeat interval, and past the 10 minute accept timeout
    await api.tick();
    expect((await kinds('2001', '1234')).filter((k) => k === 'overdue')).toHaveLength(2);
    const escalation = (await notesOf(api, '1001', '1111')).find(
      (n) => n.kind === 'escalation' && n.order_id === o.id,
    );
    expect(escalation?.body).toMatch(
      new RegExp(
        `^Наряд №${o.number} не принят за 16 мин\\. Конвейер К-3, Участок дробления\\. Исполнитель: Ахметов Е\\. Предлагаем: .+, .+\\.$`,
      ),
    );
    expect(escalation?.url).toMatch(new RegExp(`^/order/${o.id}\\?reassign=`));
    expect(escalation?.url).not.toContain(akhmetov);
    expect(await kinds('3001', '3333')).toEqual([]);

    t += 50 * 60_000; // over an hour overdue
    await api.tick();
    await api.tick();
    const manager = (await notesOf(api, '3001', '3333')).filter((n) => n.order_id === o.id);
    expect(manager.map((n) => n.kind)).toEqual(['manager_overdue']);
    expect(manager[0]?.body).toBe(
      `Длительная просрочка: наряд №${o.number} просрочен на 65 мин. Конвейер К-3, Участок дробления. Исполнитель: Ахметов Е.`,
    );
  });

  it('divides the thresholds by the demo time scale', async () => {
    let t = Date.parse('2026-10-08T05:00:00Z');
    const api = makeMock({ now: () => new Date(t) });
    await api.auth.signIn('1001', '1111');
    await api.demo.updateSettings({ demo_time_scale: 10 });
    const o = await api.orders.create(
      {
        type: 'unplanned',
        priority: 'emergency',
        description: 'Течь масла',
        equipment_id: 20,
        assignee_id: await idOf(api, '2001'),
        client_ref: randomUUID(),
      },
      randomUUID(),
    );
    t += 19_000; // emergency accept timeout 3 min / 10 = 18 s
    await api.tick();
    const esc = (await api.notifications.list()).find(
      (n) => n.kind === 'escalation' && n.order_id === o.id,
    );
    expect(esc?.body).toContain(`Наряд №${o.number} не принят за 0 мин.`);
  });

  it('reruns a stuck AI check after 60 s', async () => {
    let t = Date.parse('2026-10-08T05:00:00Z');
    const storage = memoryStorage();
    const a = makeMock({ storage, now: () => new Date(t) }, { aiDelayMs: 60_000 });
    const ivanov = await a.auth.signIn('2002', '1234');
    const k2 = (
      await a.orders.list({ assignee_id: ivanov.user_id, statuses: ['in_progress'] })
    ).find((o) => o.equipment_id === 12);
    await a.orders.action(
      k2?.id ?? 0,
      'complete',
      { works_done: 'Заменил подшипник', fault_code: 'М-02', materials: [] },
      randomUUID(),
    );
    a.stop(); // the app was killed before the verdict
    const b = makeMock({ storage, now: () => new Date(t) });
    t += 61_000;
    await b.tick();
    expect((await b.ai.review(k2?.id ?? 0))?.verdict).toBe('rework');
  });
});

describe('MockApi realtime', () => {
  it('emits what the signed-in user may see', async () => {
    const api = makeMock();
    const events: RealtimeEvent[] = [];
    for (const topic of ['orders', 'notifications', 'workers', 'reviews'] as const) {
      api.realtime.subscribe(topic, (e) => events.push(e));
    }
    await api.auth.signIn('1001', '1111');
    const o = await api.orders.create(
      {
        type: 'unplanned',
        priority: 'emergency',
        description: 'Течь масла',
        equipment_id: 20,
        assignee_id: await idOf(api, '2001'),
        client_ref: randomUUID(),
      },
      randomUUID(),
    );
    // the master sees the order, not the worker's emergency notification
    expect(events.map((e) => `${e.topic}:${e.type}`)).toEqual(['orders:INSERT']);
    events.length = 0;

    await api.auth.signIn('2001', '1234');
    await api.workers.setOnShift((await api.auth.session())?.user_id ?? '', false);
    await api.orders.action(o.id, 'accept', {}, randomUUID());
    expect(events.map((e) => `${e.topic}:${e.type}`)).toEqual([
      'workers:UPDATE',
      'orders:UPDATE',
      'workers:UPDATE',
    ]);
    events.length = 0;

    api.realtime.resync();
    expect(events.map((e) => e.topic).sort()).toEqual([
      'notifications',
      'orders',
      'reviews',
      'workers',
    ]);
    expect(events.every((e) => e.row === undefined)).toBe(true);
  });

  it('a worker hears own notifications only', async () => {
    const api = makeMock();
    const seen: AppNotification[] = [];
    api.realtime.subscribe('notifications', (e) => {
      if (e.type === 'INSERT') seen.push(e.row as AppNotification);
    });
    await api.auth.signIn('2001', '1234');
    const me = (await api.auth.session())?.user_id;
    await api.auth.signIn('1001', '1111');
    await api.orders.create(
      {
        type: 'unplanned',
        priority: 'normal',
        description: 'Шум',
        equipment_id: 13,
        assignee_id: me ?? '',
        client_ref: randomUUID(),
      },
      randomUUID(),
    );
    expect(seen).toHaveLength(0);
  });
});

describe('MockApi reports', () => {
  it('fills the shift report, counters, rating, dashboard and analytics from the store', async () => {
    const now = new Date('2026-10-08T10:00:00Z'); // 15:00 local, the day shift started at 08:00
    const api = makeMock({ now: () => now });
    await api.auth.signIn('1001', '1111');
    const shift = shiftStart(now);
    const twelveHours = { from: shift.toISOString(), to: now.toISOString() };

    const report = await api.reports.shift(twelveHours);
    expect(report.counts.closed).toBe(12);
    expect(report.counts.active_now).toBeGreaterThanOrEqual(7);
    expect(report.downtime_hours).toBeGreaterThan(0);
    expect(report.workload.length).toBeGreaterThan(0);
    expect(report.verdicts.accepted).toBeGreaterThan(0);

    const summary = await api.ai.shiftSummary(twelveHours);
    expect(summary.summary.split('. ').length).toBeGreaterThanOrEqual(5);
    expect(summary.recommendations).toHaveLength(3);
    expect(summary.summary + summary.recommendations.join(' ')).not.toMatch(/[—–]| - /);

    const month = {
      from: new Date(now.getTime() - 30 * 86_400_000).toISOString(),
      to: now.toISOString(),
    };
    const rating = await api.reports.rating(month);
    const workers = rating.filter((r) => r.kind === 'worker' && r.score != null);
    expect(workers.length).toBeGreaterThan(8);
    expect(rating.some((r) => r.kind === 'brigade')).toBe(true);
    const serikov = workers.find((r) => r.name === 'Сериков Д.');
    expect(serikov?.rank).toBeGreaterThan(workers.length / 2);

    const dash = await api.reports.dashboard(month);
    expect(dash.in_progress_now).toBeGreaterThanOrEqual(7);
    expect(dash.top_equipment[0]?.name).toBe('Конвейер К-3');
    expect(dash.best_workers.length).toBeGreaterThan(0);

    const counters = await api.shift.counters(shift);
    expect(counters).toMatchObject({ done: 12, overdue: 0 });
    expect(counters.stopped).toBeGreaterThanOrEqual(2);

    const history = await api.equipment.history(13);
    expect(history.equipment.name).toBe('Конвейер К-3');
    expect(history.orders.length).toBeGreaterThanOrEqual(4);
    expect(history.downtime_min).toBeGreaterThan(0);

    const cards = await api.ai.insights(month);
    expect(cards[0]).toMatchObject({
      kind: 'top_equipment',
      severity: 'critical',
      title: 'Конвейер К-3 ломается чаще всех',
    });
    expect(cards[0]?.body).toContain('шифр М-02 (подшипник)');
    expect(cards.map((c) => c.kind)).toContain('materials');
    expect(cards.find((c) => c.kind === 'worker_repeats')?.title).toBe(
      'Повторные отказы после ремонтов: Сериков Д.',
    );
    const asked = await api.ai.insights({
      ...month,
      query: 'покажи проблемы участка дробления за месяц',
    });
    expect(asked.every((c) => c.evidence.order_ids.length > 0)).toBe(true);
    const answer = await api.ai.ask({
      ...month,
      query: 'покажи проблемы участка дробления за месяц',
    });
    expect(answer.cards).toEqual(asked);
    expect(answer.scope).toMatchObject({
      label: '30 дней',
      area_name: 'Участок дробления',
      filters: { area_id: 2 },
      parsed_by: 'rules',
      source: 'rules',
      query: 'покажи проблемы участка дробления за месяц',
    });
    expect((await api.ai.ask(month)).scope).toMatchObject({ query: null, parsed_by: null });

    expect(await api.ai.explainRating(serikov?.id ?? '', month)).toMatch(
      /^Сильнее всего рейтинг поднимает .+\. Ниже всего .+\. .+\.$/,
    );

    // a worker sees only own rating row
    await api.auth.signIn('2006', '1234');
    const own = await api.reports.rating(month);
    expect(own.map((r) => r.name)).toEqual(['Сериков Д.']);
  });
});
