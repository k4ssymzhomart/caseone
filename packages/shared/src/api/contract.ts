// The RotaApi contract (PHASE_1 §9): the same scenarios against every implementation. MockApi runs it in
// mock/MockApi.test.ts; SupabaseApi runs it when RUN_SUPABASE=1 against the real project (a reset demo state).
// Every scenario starts with «Сбросить демо» as master Жумабаев, so it needs nothing from the previous one, and
// never hard codes a person's id: people are found by табельный номер (the database ids differ from the mock's).
// Only the equipment and material ids are fixed: they are the same in the fixtures and the database.
//
//   runContract(() => new MockApi({ ... }), { name: 'MockApi', uuid: randomUUID });

import { describe, expect, it } from 'vitest';
import { ACTIVE_STATUSES, type Status } from '../domain/enums';
import type { CreateOrderInput, PhotoUploadInput, WorkerStatusView } from '../domain/types';
import type { RotaApi } from './RotaApi';
import { isRotaError, parseAnotherInProgress } from './errors';

export interface ContractOptions {
  /** describe() title. */
  name?: string;
  /** uuid generator for client_action_id and client_ref. */
  uuid: () => string;
  /** Per scenario timeout in ms (default 30 000: the real backend needs a few round trips). */
  timeoutMs?: number;
  /** How long realtime may take to deliver an event (default 5000, the case's limit). */
  realtimeMs?: number;
  /**
   * Up to how long to wait after realtime.subscribe() for the channel to join (its refresh event without a row)
   * before the change is made; default 0. postgres_changes are not replayed to a late joiner: the apps cover
   * that gap with the resync on SUBSCRIBED, the scenario waits instead.
   */
  realtimeWarmupMs?: number;
}

/** The demo pump of the script (step 2) and the К-2 conveyor of step 7. */
const PUMP = 20;
const K2 = 12;
/** Materials: Кольцо уплотнительное, Масло гидравлическое ВМГЗ, Ветошь, Подшипник 3626. */
const RING = 21;
const OIL = 17;
const RAGS = 39;
const BEARING_3626 = 2;

async function failure(
  p: Promise<unknown>,
): Promise<{ code: string; message: string; details: unknown }> {
  try {
    await p;
  } catch (e) {
    if (isRotaError(e)) return { code: e.code, message: e.message, details: e.details };
    throw e;
  }
  throw new Error('expected the call to fail');
}

async function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return true;
    await new Promise((r) => {
      setTimeoutCompat(r, 25);
    });
  }
  return check();
}

/** setTimeout without DOM or Node typings (packages/shared compiles with lib es2023 only). */
function setTimeoutCompat(cb: (v?: unknown) => void, ms: number): void {
  (globalThis as unknown as { setTimeout(cb: () => void, ms: number): unknown }).setTimeout(
    () => cb(),
    ms,
  );
}

function byTab(workers: readonly WorkerStatusView[], tab: string): WorkerStatusView {
  const w = workers.find((x) => x.tab_no === tab);
  if (!w) throw new Error(`no worker ${tab}`);
  return w;
}

const isActive = (s: Status): boolean => (ACTIVE_STATUSES as readonly Status[]).includes(s);

export function runContract(
  makeApi: () => RotaApi | Promise<RotaApi>,
  options: ContractOptions,
): void {
  const uuid = options.uuid;
  const timeout = options.timeoutMs ?? 30_000;
  const realtimeMs = options.realtimeMs ?? 5000;
  const realtimeWarmupMs = options.realtimeWarmupMs ?? 0;

  const signInMaster = (api: RotaApi) => api.auth.signIn('1001', '1111');
  /** As master Жумабаев: «Сбросить демо», then the workers by tab number. */
  async function start(api: RotaApi): Promise<WorkerStatusView[]> {
    await signInMaster(api);
    await api.demo.reset();
    return api.workers.statuses();
  }

  function afterPhoto(clientRef: string): PhotoUploadInput {
    return {
      client_ref: clientRef,
      kind: 'after',
      data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]),
      source: 'camera',
      captured_at: new Date().toISOString(),
      dhash: null,
      sha256: uuid().replace(/-/g, '').toLowerCase().padEnd(64, '0'),
      width: 1600,
      height: 1200,
      bytes: 8,
      exif: null,
    };
  }

  describe(options.name ?? 'RotaApi contract', () => {
    it(
      'signs in with табельный номер and ПИН, rejects a wrong pair',
      async () => {
        const api = await makeApi();
        expect((await failure(api.auth.signIn('1001', '0000'))).code).toBe('WRONG_PIN');
        expect((await failure(api.auth.signIn('0000', '1111'))).code).toBe('WRONG_PIN');
        const s = await signInMaster(api);
        expect(s).toMatchObject({ role: 'master', tab_no: '1001', short_name: 'Жумабаев Н.' });
        expect(await api.auth.session()).toMatchObject({ user_id: s.user_id, role: 'master' });
        await api.auth.signOut();
        expect(await api.auth.session()).toBeNull();
      },
      timeout,
    );

    it(
      'runs the emergency order on the pump from issue to close',
      async () => {
        const api = await makeApi();
        const workers = await start(api);
        const akhmetov = byTab(workers, '2001');
        expect(akhmetov.status).toBe('free');

        const dirs = await api.directories.get();
        const pump = dirs.equipment.find((e) => e.id === PUMP);
        expect(pump?.name).toBe('Насос НШ-32 маслостанции');
        expect(pump?.is_stopped).toBe(false);
        const area = dirs.areas.find((a) => a.id === pump?.area_id);

        // Ахметов is the only free слесарь: the suggestion is deterministic
        const suggestions = await api.orders.suggestAssignees(PUMP, 'слесарь');
        expect(suggestions[0]?.employee_id).toBe(akhmetov.id);
        expect(suggestions[0]?.reasons).toContain('Свободен');

        const createId = uuid();
        const input: CreateOrderInput = {
          type: 'unplanned',
          priority: 'emergency',
          description: 'Течь масла',
          equipment_id: PUMP,
          assignee_id: akhmetov.id,
          client_ref: uuid(),
          equipment_stopped: true,
          suggested_fault_code: 'Г-01',
        };
        const created = await api.orders.create(input, createId);
        expect(created).toMatchObject({
          status: 'issued',
          type: 'unplanned',
          priority: 'emergency',
          equipment_id: PUMP,
          area_id: pump?.area_id,
          assignee_id: akhmetov.id,
          norm_hours: 1.5,
          is_demo: dirs.settings.demo_mode,
        });
        // the same tap twice creates one order
        expect((await api.orders.create(input, createId)).id).toBe(created.id);
        expect((await api.directories.get()).equipment.find((e) => e.id === PUMP)?.is_stopped).toBe(
          true,
        );

        // the worker gets the emergency notification in the case's wording
        await api.auth.signIn('2001', '1234');
        const notes = await api.notifications.list();
        const emergency = notes.find((n) => n.order_id === created.id && n.kind === 'emergency');
        expect(emergency).toMatchObject({
          title: `Аварийный наряд №${created.number}`,
          body: `АВАРИЙНЫЙ наряд №${created.number}. Насос НШ-32 маслостанции, ${area?.name ?? ''}. Требует ответа.`,
          url: `/emergency/${created.id}`,
          severity: 'critical',
        });

        const acceptId = uuid();
        expect((await api.orders.action(created.id, 'accept', {}, acceptId)).status).toBe(
          'accepted',
        );
        // a retry of the same tap does not apply twice
        expect((await api.orders.action(created.id, 'accept', {}, acceptId)).status).toBe(
          'accepted',
        );
        expect((await api.orders.action(created.id, 'start', {}, uuid())).status).toBe(
          'in_progress',
        );

        const photo = await api.photos.upload(afterPhoto(created.client_ref));
        expect(photo).toMatchObject({ order_id: created.id, kind: 'after', source: 'camera' });
        expect(photo.storage_path.startsWith(`orders/${created.client_ref}/after/`)).toBe(true);

        const done = await api.orders.action(
          created.id,
          'complete',
          {
            works_done: 'Заменил уплотнительное кольцо, долил масло ВМГЗ, течи нет',
            fault_code: 'Г-01',
            materials: [
              { material_id: RING, qty: 2 },
              { material_id: OIL, qty: 2 },
              { material_id: RAGS, qty: 1 },
            ],
            comment: 'Течь устранена',
          },
          uuid(),
        );
        expect(done.status).toBe('ai_review');

        const review = await api.ai.verify(created.id);
        expect(['accepted', 'accepted_with_remarks']).toContain(review.verdict);
        expect(review.attempt).toBe(1);
        expect(review.checks.slice(0, 4).map((c) => c.id)).toEqual(['R1', 'R2', 'R3', 'R4']);
        expect(review.checks.find((c) => c.id === 'R1')?.status).toBe('pass');
        expect(review.checks.find((c) => c.id === 'R3')?.status).toBe('pass');
        expect(review.checks.some((c) => c.status === 'fail')).toBe(false);
        // verify is idempotent per attempt
        expect((await api.ai.verify(created.id)).id).toBe(review.id);
        expect((await api.ai.review(created.id))?.id).toBe(review.id);

        const checked = await api.orders.get(created.id);
        expect(checked.order).toMatchObject({
          status: 'ai_review',
          ai_verdict: review.verdict,
          ai_score: review.score,
        });
        expect(checked.materials.map((m) => [m.material_id, m.qty])).toEqual([
          [RING, 2],
          [OIL, 2],
          [RAGS, 1],
        ]);
        expect(checked.photos.some((p) => p.kind === 'after')).toBe(true);

        await signInMaster(api);
        const closed = await api.orders.action(created.id, 'close', {}, uuid());
        expect(closed).toMatchObject({
          status: 'closed',
          final_verdict: review.verdict,
          final_score: review.score,
        });
        const final = await api.orders.get(created.id);
        expect(final.events.map((e) => e.action)).toEqual([
          'create',
          'accept',
          'start',
          'complete',
          'review_started',
          'ai_result',
          'close',
        ]);
        expect(final.reviews[0]).toMatchObject({
          master_verdict: review.verdict,
          master_score: review.score,
        });
        expect((await api.directories.get()).equipment.find((e) => e.id === PUMP)?.is_stopped).toBe(
          false,
        );

        await api.auth.signIn('2001', '1234');
        expect(
          (await api.notifications.list()).some(
            (n) => n.order_id === created.id && n.kind === 'closed',
          ),
        ).toBe(true);
        expect(
          (await api.orders.list({ assignee_id: akhmetov.id, statuses: ['closed'] })).some(
            (o) => o.id === created.id,
          ),
        ).toBe(true);
      },
      timeout,
    );

    it(
      'sends the К-2 order without a photo and with 6 bearings to rework',
      async () => {
        const api = await makeApi();
        await start(api);
        const ivanov = await api.auth.signIn('2002', '1234');
        const mine = await api.orders.list({
          assignee_id: ivanov.user_id,
          statuses: ['in_progress'],
        });
        const k2 = mine.find((o) => o.equipment_id === K2);
        if (!k2) throw new Error('no К-2 order in progress');
        expect(k2.equipment_name).toBe('Конвейер К-2');

        await api.orders.action(
          k2.id,
          'complete',
          {
            works_done: 'Заменил подшипники приводного барабана, проверил шум',
            fault_code: 'М-02',
            materials: [{ material_id: BEARING_3626, qty: 6 }],
          },
          uuid(),
        );
        const review = await api.ai.verify(k2.id);
        expect(review.verdict).toBe('rework');
        expect(review.needs_master_review).toBe(false);
        const fails = review.checks.filter((c) => c.status === 'fail').map((c) => c.message_ru);
        expect(fails).toContain('нет фото после: обязательно для внеплановых работ');
        expect(fails.join('; ')).toContain('перерасход: подшипник 3626 6 шт при норме до 2');

        const after = await api.orders.get(k2.id);
        expect(after.order).toMatchObject({
          status: 'rework',
          rework_count: 1,
          ai_verdict: 'rework',
        });
        const note = (await api.notifications.list()).find(
          (n) => n.order_id === k2.id && n.kind === 'rework',
        );
        expect(note?.body).toBe(
          `Наряд №${k2.number} возвращён на доработку. Причина: нет фото после: обязательно для внеплановых работ.`,
        );
      },
      timeout,
    );

    it(
      'asks before issuing to a worker off shift (NOT_ON_SHIFT)',
      async () => {
        const api = await makeApi();
        const workers = await start(api);
        const litvinenko = byTab(workers, '2004');
        expect(litvinenko.status).toBe('off');
        const input: CreateOrderInput = {
          type: 'unplanned',
          priority: 'normal',
          description: 'Трещина корпуса',
          equipment_id: 18,
          assignee_id: litvinenko.id,
          client_ref: uuid(),
        };
        const err = await failure(api.orders.create(input, uuid()));
        expect(err.code).toBe('NOT_ON_SHIFT');
        expect(err.message).toBe('Литвиненко О. не на смене. Всё равно выдать?');
        const created = await api.orders.create({ ...input, allow_off_shift: true }, uuid());
        expect(created).toMatchObject({ status: 'issued', assignee_id: litvinenko.id });
      },
      timeout,
    );

    it(
      'keeps one order in progress per worker (ANOTHER_IN_PROGRESS, then pause_current)',
      async () => {
        const api = await makeApi();
        const workers = await start(api);
        const petrenko = byTab(workers, '2007');
        expect(petrenko.status).toBe('working');
        const k1Id = petrenko.current_order_id;
        if (k1Id == null) throw new Error('Петренко has no order in progress');
        const k1 = await api.orders.get(k1Id);

        const created = await api.orders.create(
          {
            type: 'unplanned',
            priority: 'high',
            description: 'Заклинило ролик',
            equipment_id: 23,
            assignee_id: petrenko.id,
            client_ref: uuid(),
            suggested_fault_code: 'М-07',
          },
          uuid(),
        );
        await api.auth.signIn('2007', '1234');
        await api.orders.action(created.id, 'accept', {}, uuid());
        const err = await failure(api.orders.action(created.id, 'start', {}, uuid()));
        expect(err.code).toBe('ANOTHER_IN_PROGRESS');
        expect(parseAnotherInProgress(err.details)).toEqual({
          order_id: k1Id,
          number: k1.order.number,
        });
        expect(err.message).toBe(`Приостановить наряд №${k1.order.number} и начать этот?`);

        const started = await api.orders.action(
          created.id,
          'start',
          { pause_current: true },
          uuid(),
        );
        expect(started.status).toBe('in_progress');
        const paused = await api.orders.get(k1Id);
        expect(paused.order).toMatchObject({
          status: 'paused',
          last_comment: `Переключился на наряд №${created.number}`,
          board_column: 'in_progress',
        });
        expect((await failure(api.orders.action(created.id, 'close', {}, uuid()))).code).toBe(
          'FORBIDDEN',
        );
      },
      timeout,
    );

    it(
      'delivers an order change to a realtime subscriber',
      async () => {
        const api = await makeApi();
        const workers = await start(api);
        const seen: number[] = [];
        let joined = false;
        const off = api.realtime.subscribe('orders', (e) => {
          const row = e.row as { id?: number } | undefined;
          if (row?.id != null) seen.push(row.id);
          // a refresh without a row: the channel (re)joined
          else joined = true;
        });
        try {
          if (realtimeWarmupMs > 0) await waitFor(() => joined, realtimeWarmupMs);
          const created = await api.orders.create(
            {
              type: 'planned',
              priority: 'planned',
              description: 'ППР: плановая смазка',
              equipment_id: 14,
              assignee_id: byTab(workers, '2005').id,
              client_ref: uuid(),
              suggested_fault_code: 'С-01',
            },
            uuid(),
          );
          expect(await waitFor(() => seen.includes(created.id), realtimeMs)).toBe(true);
        } finally {
          off();
        }
      },
      timeout,
    );

    it(
      'restores the Demo Day start state on demo.reset',
      async () => {
        const api = await makeApi();
        const before = await start(api);
        const extra = await api.orders.create(
          {
            type: 'unplanned',
            priority: 'normal',
            description: 'Шум подшипника',
            equipment_id: 13,
            assignee_id: byTab(before, '2001').id,
            client_ref: uuid(),
          },
          uuid(),
        );
        await api.workers.setOnShift(byTab(before, '2011').id, true);

        await api.demo.reset();
        const workers = await api.workers.statuses();
        expect(workers.filter((w) => w.on_shift)).toHaveLength(9);
        expect(byTab(workers, '2001').status).toBe('free');
        expect(byTab(workers, '2009').status).toBe('free');
        expect(byTab(workers, '2005').status).toBe('free');
        expect(byTab(workers, '2002')).toMatchObject({
          status: 'working',
          current_equipment_name: 'Конвейер К-2',
        });
        expect(byTab(workers, '2003').status).toBe('working');
        expect(byTab(workers, '2007').status).toBe('working');
        expect(byTab(workers, '2006')).toMatchObject({ status: 'queue', queue_count: 2 });
        expect(byTab(workers, '2008')).toMatchObject({ status: 'queue', queue_count: 1 });
        expect(byTab(workers, '2010')).toMatchObject({ status: 'queue', queue_count: 1 });
        for (const tab of ['2004', '2011', '2012', '2013', '2014', '2015'])
          expect(byTab(workers, tab).status).toBe('off');
        // Ахметов is the only free слесарь
        expect(
          workers
            .filter((w) => w.specialty === 'слесарь' && w.status === 'free')
            .map((w) => w.tab_no),
        ).toEqual(['2001']);

        const board = await api.orders.forBoard();
        expect(board.some((o) => o.id === extra.id)).toBe(false);
        const active = board.filter((o) => isActive(o.status));
        expect(active).toHaveLength(7);
        for (const o of active) {
          expect(o.is_demo).toBe(true);
          const left = Date.parse(o.due_at) - Date.now();
          expect(left).toBeGreaterThan(5.5 * 3_600_000);
          expect(left).toBeLessThan(6.5 * 3_600_000);
        }
        const paused = active.find((o) => o.status === 'paused');
        expect(paused).toMatchObject({
          last_reason: 'waiting_parts',
          last_comment: 'ждём подшипник со склада',
          board_column: 'in_progress',
        });

        // reset deletes every demo order and writes the 12 closed this shift again
        const closed = (await api.orders.list({ statuses: ['closed'] })).filter((o) => o.is_demo);
        expect(closed).toHaveLength(12);
        expect(closed.every((o) => o.final_score != null && o.ai_verdict != null)).toBe(true);

        const dirs = await api.directories.get();
        expect(dirs.equipment.find((e) => e.id === PUMP)?.is_stopped).toBe(false);
        expect(dirs.equipment.find((e) => e.id === K2)?.is_stopped).toBe(true);
        expect(dirs.settings.demo_time_scale).toBe(1);
      },
      timeout,
    );
  });
}
