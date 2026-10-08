// MockApi: the whole RotaApi on one device, no network (PHASE_0 §8). The store (store.ts) holds every table
// as JSON in the injected storage, seeded from the fixtures and demoState(now) on first use and on demo.reset().
// Writes go through the same pure state machine as the database mirror (applyCreate, applyAction), reads build
// the same view rows (v_orders, v_worker_status, v_brigade_status), and rows come back in the database's
// snake_case shapes, so SupabaseApi can replace it without touching a screen.
// What the database does on its own is simulated here: the AI check after complete (ai.ts, 2.5 s), the watchdog
// every 5 s (watchdog.ts) and realtime events after every mutation (events.ts, filtered like RLS).
// Limit: the mock lives on one device; two simulators do not share it.

import { RotaError, type ErrorCode } from '../errors';
import type { CreateApiOptions, KeyValueStorage, MockOptions, RotaApi } from '../RotaApi';
import {
  applyAction,
  applyCreate,
  isMasterRole,
  type ActionResult,
} from '../../domain/transitions';
import { compareOrders } from '../../domain/priority';
import { deriveBrigadeStatuses, deriveWorkerStatuses } from '../../domain/workerStatus';
import { suggestAssignees } from '../../domain/suggest';
import { PINS } from '../../fixtures';
import type {
  AiReview,
  Employee,
  OrderDetail,
  OrderPhoto,
  Session,
  Settings,
  Unsubscribe,
} from '../../domain/types';
import { mockExplainRating, mockShiftSummary, ratingRowFor, runMockReview } from './ai';
import { RealtimeBus, type Change } from './events';
import {
  boardOrders,
  dashboard,
  equipmentHistory,
  filterOrders,
  insightCards,
  rating,
  requireStaffRole,
  ruleInsightScope,
  shiftCounters,
  shiftReport,
} from './reports';
import {
  isStaff,
  MockDb,
  parseState,
  seedState,
  serializeState,
  staticDirectories,
  type StaticDirectories,
} from './store';
import { cancelEvery, cancelLater, every, later, sleep, type TimerHandle } from '../../util/timers';
import { watchdogTick } from './watchdog';

const DEFAULT_LATENCY: readonly [number, number] = [150, 300];
const DEFAULT_AI_DELAY_MS = 2500;
const DEFAULT_WATCHDOG_MS = 5000;

interface PendingCheck {
  timer: TimerHandle;
  waiters: { resolve: (r: AiReview) => void; reject: (e: unknown) => void }[];
}

interface InjectedError {
  code: ErrorCode;
  times: number;
  method: string | null;
  details: unknown;
}

export interface InjectErrorOptions {
  /** How many calls fail (default 1; Infinity until clearErrors()). */
  times?: number;
  /** Only this method ('orders.action') or group ('orders'); default every method. */
  method?: string;
  details?: unknown;
}

/** Plain copies out of the store, so callers never hold rows the store mutates later. */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** A data: URI for photo previews when the caller passes no file uri (kept in memory only). */
function jpegDataUri(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out +=
      B64.charAt((n >> 18) & 63) +
      B64.charAt((n >> 12) & 63) +
      (b === undefined ? '=' : B64.charAt((n >> 6) & 63)) +
      (c === undefined ? '=' : B64.charAt(n & 63));
  }
  return `data:image/jpeg;base64,${out}`;
}

function sessionOf(e: Employee): Session {
  return {
    user_id: e.id,
    role: e.role,
    short_name: e.short_name,
    full_name: e.full_name,
    tab_no: e.tab_no,
    pseudonym: e.pseudonym,
  };
}

const EXPO_TOKEN = /^Expo(nent)?PushToken\[.+\]$/;
const HEX16 = /^[0-9a-f]{16}$/;
const HEX64_OR_EMPTY = /^([0-9a-f]{64})?$/;

export class MockApi implements RotaApi {
  private readonly storage: KeyValueStorage;
  private readonly uuid: () => string;
  private readonly clock: () => Date;
  private readonly latencyMs: number | readonly [number, number];
  private readonly aiDelayMs: number;
  private readonly watchdogEnabled: boolean;
  private readonly watchdogMs: number;
  private readonly errorRate: number;
  private readonly stateKey: string;
  private readonly sessionKey: string;
  private readonly dirs: StaticDirectories;
  private readonly bus = new RealtimeBus();
  private readonly authListeners = new Set<(s: Session | null) => void>();
  private readonly pending = new Map<number, PendingCheck>();
  private injected: InjectedError[] = [];
  private db: MockDb | null = null;
  private loading: Promise<MockDb> | null = null;
  private current: Session | null | undefined;
  private watchdogTimer: TimerHandle | null = null;
  private stopped = false;

  constructor(options: CreateApiOptions) {
    const mock: MockOptions = options.mock ?? {};
    this.storage = options.storage;
    this.uuid = options.uuid;
    this.clock = options.now ?? (() => new Date());
    this.latencyMs = mock.latencyMs ?? DEFAULT_LATENCY;
    this.aiDelayMs = mock.aiDelayMs ?? DEFAULT_AI_DELAY_MS;
    this.watchdogEnabled = mock.watchdog ?? true;
    this.watchdogMs = mock.watchdogIntervalMs ?? DEFAULT_WATCHDOG_MS;
    this.errorRate = mock.errorRate ?? 0;
    const prefix = mock.storageKey ?? 'rota.mock';
    this.stateKey = `${prefix}.state`;
    this.sessionKey = `${prefix}.session`;
    this.dirs = staticDirectories();
  }

  // -------------------------------------------------------------------------
  // test and dev controls (not part of RotaApi)
  // -------------------------------------------------------------------------

  /** Make the next calls fail with this code (tests, or trying error states by hand). */
  injectError(code: ErrorCode, options: InjectErrorOptions = {}): void {
    this.injected.push({
      code,
      times: options.times ?? 1,
      method: options.method ?? null,
      details: options.details,
    });
  }

  clearErrors(): void {
    this.injected = [];
  }

  /** One watchdog pass now (the interval calls this every 5 s). */
  async tick(): Promise<void> {
    const db = await this.ensure();
    const now = this.clock();
    const res = watchdogTick(db, now);
    const changes: Change[] = [...res.changes];
    for (const id of res.stuck) {
      if (this.pending.has(id)) continue;
      try {
        changes.push(...runMockReview(db, id, now, this.aiDelayMs).changes);
      } catch {
        // the order moved on meanwhile
      }
    }
    if (changes.length > 0) {
      await this.persist();
      this.publish(changes);
    }
  }

  /** Finish every AI check that is waiting for its delay now. */
  async flushChecks(): Promise<void> {
    const ids = [...this.pending.keys()];
    for (const id of ids) {
      const p = this.pending.get(id);
      if (p) cancelLater(p.timer);
      await this.finishCheck(id);
    }
  }

  /** Stop the watchdog and the pending AI checks (tests, teardown). */
  stop(): void {
    this.stopped = true;
    if (this.watchdogTimer != null) cancelEvery(this.watchdogTimer);
    this.watchdogTimer = null;
    for (const [id, p] of this.pending) {
      cancelLater(p.timer);
      for (const w of p.waiters) w.reject(new RotaError('UNKNOWN', { message: 'MockApi stopped' }));
      this.pending.delete(id);
    }
  }

  // -------------------------------------------------------------------------
  // plumbing
  // -------------------------------------------------------------------------

  private ensure(): Promise<MockDb> {
    if (this.db) return Promise.resolve(this.db);
    this.loading ??= (async () => {
      const [raw, rawSession] = await Promise.all([
        this.read(this.stateKey),
        this.read(this.sessionKey),
      ]);
      let state = parseState(raw);
      const fresh = state == null;
      state ??= seedState(this.clock(), { uuid: this.uuid });
      const db = new MockDb(state, this.dirs);
      if (this.current === undefined) {
        let s: Session | null = null;
        try {
          s = rawSession ? (JSON.parse(rawSession) as Session) : null;
        } catch {
          s = null;
        }
        this.current = s && db.employee(s.user_id) ? s : null;
      }
      this.db = db;
      if (fresh) await this.persist();
      return db;
    })();
    return this.loading;
  }

  private async read(key: string): Promise<string | null> {
    try {
      return await this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  private async persist(): Promise<void> {
    if (!this.db) return;
    try {
      await this.storage.setItem(this.stateKey, serializeState(this.db.state));
    } catch {
      // storage full or unavailable: the state still lives in memory
    }
  }

  private latency(): number {
    const l = this.latencyMs;
    if (typeof l === 'number') return l;
    const [min, max] = l;
    return min + Math.random() * Math.max(0, max - min);
  }

  private maybeFail(method: string): void {
    const i = this.injected.findIndex(
      (x) => x.method == null || x.method === method || method.startsWith(`${x.method}.`),
    );
    const hit = i >= 0 ? this.injected[i] : undefined;
    if (hit) {
      hit.times -= 1;
      if (hit.times <= 0) this.injected.splice(i, 1);
      throw new RotaError(hit.code, hit.details === undefined ? {} : { details: hit.details });
    }
    if (this.errorRate > 0 && Math.random() < this.errorRate) throw new RotaError('NETWORK');
  }

  /** Every RotaApi call: latency, the loaded store, the watchdog, injected errors. */
  private async enter(method: string): Promise<MockDb> {
    await sleep(this.latency());
    const db = await this.ensure();
    this.startWatchdog();
    this.maybeFail(method);
    return db;
  }

  private startWatchdog(): void {
    if (!this.watchdogEnabled || this.stopped || this.watchdogTimer != null) return;
    this.watchdogTimer = every(() => {
      this.tick().catch(() => undefined);
    }, this.watchdogMs);
  }

  private requireSession(): Session {
    if (!this.current) throw new RotaError('FORBIDDEN', { details: 'sign in required' });
    return this.current;
  }

  private setSession(s: Session | null): void {
    this.current = s;
    for (const cb of [...this.authListeners]) {
      try {
        cb(s ? { ...s } : null);
      } catch {
        // a listener error must not fail sign in
      }
    }
  }

  /** Realtime for the signed-in user: what RLS would let postgres_changes deliver. */
  private publish(changes: readonly Change[]): void {
    const s = this.current ?? null;
    const db = this.db;
    if (!s || !db) return;
    for (const c of changes) {
      if (c.topic === 'orders' && !db.canSee(c.row, s)) continue;
      if (c.topic === 'notifications' && c.row.recipient_id !== s.user_id) continue;
      if (c.topic === 'reviews') {
        const o = db.order(c.row.order_id);
        if (!o || !db.canSee(o, s)) continue;
      }
      this.bus.emit({ topic: c.topic, type: c.type, row: clone(c.row) });
    }
  }

  /** Writes a state machine result, runs or schedules the AI check after complete, persists, publishes. */
  private async apply(db: MockDb, result: ActionResult, now: Date): Promise<void> {
    if (result.replayed) return;
    const out = db.commit(result, now);
    const changes = [...out.changes];
    for (const orderId of out.ai_verify) {
      if (this.aiDelayMs <= 0) {
        try {
          changes.push(...runMockReview(db, orderId, now, 0).changes);
        } catch {
          // ai.verify reports it
        }
      } else {
        this.scheduleCheck(orderId);
      }
    }
    await this.persist();
    this.publish(changes);
  }

  private scheduleCheck(orderId: number): void {
    if (this.pending.has(orderId) || this.stopped) return;
    const timer = later(() => {
      this.finishCheck(orderId).catch(() => undefined);
    }, this.aiDelayMs);
    this.pending.set(orderId, { timer, waiters: [] });
  }

  private async finishCheck(orderId: number): Promise<void> {
    const pending = this.pending.get(orderId);
    this.pending.delete(orderId);
    let review: AiReview | null = null;
    let error: unknown = null;
    try {
      const db = await this.ensure();
      const run = runMockReview(db, orderId, this.clock(), this.aiDelayMs);
      review = run.review;
      if (run.created) {
        await this.persist();
        this.publish(run.changes);
      }
    } catch (e) {
      error = e;
    }
    for (const w of pending?.waiters ?? []) {
      if (review) w.resolve(clone(review));
      else w.reject(error ?? new RotaError('UNKNOWN'));
    }
  }

  private cancelPending(): void {
    for (const [id, p] of this.pending) {
      cancelLater(p.timer);
      for (const w of p.waiters)
        w.reject(new RotaError('BAD_TRANSITION', { details: 'demo reset' }));
      this.pending.delete(id);
    }
  }

  private actorOf(s: Session): { user_id: string; role: Session['role'] } {
    return { user_id: s.user_id, role: s.role };
  }

  // -------------------------------------------------------------------------
  // RotaApi
  // -------------------------------------------------------------------------

  auth: RotaApi['auth'] = {
    signIn: async (tabNo, pin) => {
      const db = await this.enter('auth.signIn');
      const e = db.state.employees.find((x) => x.tab_no === tabNo.trim());
      if (!e || PINS[e.tab_no] !== pin) throw new RotaError('WRONG_PIN');
      const s = sessionOf(e);
      try {
        await this.storage.setItem(this.sessionKey, JSON.stringify(s));
      } catch {
        // the session still holds in memory
      }
      this.setSession(s);
      return { ...s };
    },
    signOut: async () => {
      await this.ensure();
      try {
        await this.storage.removeItem(this.sessionKey);
      } catch {
        // nothing to clean up
      }
      this.setSession(null);
    },
    session: async () => {
      await this.ensure();
      return this.current ? { ...this.current } : null;
    },
    onChange: (cb): Unsubscribe => {
      this.authListeners.add(cb);
      return () => {
        this.authListeners.delete(cb);
      };
    },
  };

  directories: RotaApi['directories'] = {
    get: async () => {
      const db = await this.enter('directories.get');
      this.requireSession();
      return db.directories();
    },
  };

  orders: RotaApi['orders'] = {
    list: async (filter = {}) => {
      const db = await this.enter('orders.list');
      const s = this.requireSession();
      const since = filter.since == null ? null : Date.parse(filter.since);
      const rows = db
        .visibleOrders(s)
        .filter(
          (o) =>
            (filter.assignee_id == null || o.assignee_id === filter.assignee_id) &&
            (filter.master_id == null || o.master_id === filter.master_id) &&
            (filter.statuses == null || filter.statuses.includes(o.status)) &&
            (filter.area_id == null || o.area_id === filter.area_id) &&
            (filter.equipment_id == null || o.equipment_id === filter.equipment_id) &&
            (filter.priority == null || o.priority === filter.priority) &&
            (since == null || Date.parse(o.created_at) >= since),
        )
        .sort((a, b) => compareOrders(a, b) || a.id - b.id);
      const limited = filter.limit != null ? rows.slice(0, Math.max(0, filter.limit)) : rows;
      return clone(db.views(limited, this.clock()));
    },
    forBoard: async (filters = {}) => {
      const db = await this.enter('orders.forBoard');
      const s = this.requireSession();
      const now = this.clock();
      const rows = filterOrders(db, boardOrders(db.visibleOrders(s), now), filters).sort(
        (a, b) => compareOrders(a, b) || a.id - b.id,
      );
      return clone(db.views(rows, now));
    },
    get: async (id) => {
      const db = await this.enter('orders.get');
      const s = this.requireSession();
      const o = db.order(id);
      if (!o || !db.canSee(o, s)) throw new RotaError('BAD_INPUT', { details: 'order not found' });
      const detail: OrderDetail = {
        order: db.view(o, this.clock()),
        events: db.orderEvents(o.id),
        photos: db.orderPhotos(o),
        materials: db.orderMaterials(o.id),
        reviews: db.state.reviews
          .filter((r) => r.order_id === o.id)
          .sort((a, b) => a.attempt - b.attempt || a.id - b.id),
      };
      return clone(detail);
    },
    create: async (input, clientActionId) => {
      const db = await this.enter('orders.create');
      const s = this.requireSession();
      const now = this.clock();
      const { state } = db;
      const result = applyCreate(input, {
        actor: this.actorOf(s),
        now,
        clientActionId,
        nextId: db.peek('order'),
        nextNumber: db.peek('number'),
        orders: state.orders,
        events: state.events,
        employees: state.employees,
        brigades: db.dirs.brigades,
        equipment: state.equipment,
        work_norms: db.dirs.work_norms,
        settings: state.settings,
        uuid: this.uuid,
      });
      if (!result.replayed) {
        db.next('order');
        db.next('number');
      }
      await this.apply(db, result, now);
      return clone(result.order);
    },
    action: async (id, action, payload, clientActionId) => {
      const db = await this.enter('orders.action');
      const s = this.requireSession();
      const now = this.clock();
      const { state } = db;
      const order = db.order(id);
      if (!order) throw new RotaError('BAD_INPUT', { details: 'order not found' });
      const result = applyAction(order, action, payload ?? {}, {
        actor: this.actorOf(s),
        now,
        clientActionId,
        orders: state.orders,
        events: state.events,
        employees: state.employees,
        brigades: db.dirs.brigades,
        reviews: state.reviews,
      });
      await this.apply(db, result, now);
      return clone(result.order);
    },
    suggestAssignees: async (equipmentId, specialty, exclude) => {
      const db = await this.enter('orders.suggestAssignees');
      requireStaffRole(this.requireSession());
      const { state } = db;
      const now = this.clock();
      return clone(
        suggestAssignees({
          equipment_id: equipmentId,
          required_specialty: specialty ?? null,
          exclude: exclude ?? null,
          directories: {
            equipment: state.equipment,
            equipment_type_specialty: db.dirs.equipment_type_specialty,
          },
          workers: deriveWorkerStatuses(state.employees, state.orders, state.equipment),
          orders: state.orders,
          now,
        }),
      );
    },
  };

  workers: RotaApi['workers'] = {
    statuses: async () => {
      const db = await this.enter('workers.statuses');
      const s = this.requireSession();
      // security_invoker: a worker's view only counts their own orders, like RLS does in the database
      return clone(
        deriveWorkerStatuses(db.state.employees, db.visibleOrders(s), db.state.equipment),
      );
    },
    brigades: async () => {
      const db = await this.enter('workers.brigades');
      const s = this.requireSession();
      const statuses = deriveWorkerStatuses(
        db.state.employees,
        db.visibleOrders(s),
        db.state.equipment,
      );
      return clone(deriveBrigadeStatuses(db.dirs.brigades, db.state.employees, statuses));
    },
    setOnShift: async (employeeId, onShift) => {
      const db = await this.enter('workers.setOnShift');
      const s = this.requireSession();
      if (employeeId !== s.user_id && !isMasterRole(s.role)) {
        throw new RotaError('FORBIDDEN', { details: 'only yourself or a master' });
      }
      const e = db.employee(employeeId);
      if (!e || e.on_shift === onShift) return;
      e.on_shift = onShift;
      await this.persist();
      this.publish([{ topic: 'workers', type: 'UPDATE', row: e }]);
    },
  };

  shift: RotaApi['shift'] = {
    counters: async (start) => {
      const db = await this.enter('shift.counters');
      const s = this.requireSession();
      return shiftCounters(db, db.visibleOrders(s), this.clock(), start);
    },
  };

  equipment: RotaApi['equipment'] = {
    history: async (id) => {
      const db = await this.enter('equipment.history');
      const s = this.requireSession();
      return clone(equipmentHistory(db, db.visibleOrders(s), this.clock(), id));
    },
  };

  photos: RotaApi['photos'] = {
    upload: async (input) => {
      const db = await this.enter('photos.upload');
      const s = this.requireSession();
      const now = this.clock();
      if (!input.client_ref || (input.kind !== 'before' && input.kind !== 'after')) {
        throw new RotaError('BAD_INPUT', { details: 'client_ref, kind and storage_path required' });
      }
      if (
        (input.dhash != null && input.dhash !== '' && !HEX16.test(input.dhash)) ||
        !HEX64_OR_EMPTY.test(input.sha256 ?? '')
      ) {
        throw new RotaError('BAD_INPUT', { details: 'dhash: 16 hex, sha256: 64 hex' });
      }
      const order = db.state.orders.find((o) => o.client_ref === input.client_ref);
      if (input.kind === 'after') {
        if (!order || order.assignee_id !== s.user_id) {
          throw new RotaError('FORBIDDEN', { details: 'after photos belong to the assignee' });
        }
      } else if (!(isMasterRole(s.role) || (order != null && order.assignee_id === s.user_id))) {
        throw new RotaError('FORBIDDEN', { details: 'before photos: master or assignee' });
      }
      const path = `orders/${input.client_ref}/${input.kind}/${this.uuid()}.jpg`;
      const row: OrderPhoto = {
        id: db.next('photo'),
        order_id: order?.id ?? null,
        client_ref: input.client_ref,
        kind: input.kind,
        storage_path: path,
        author_id: s.user_id,
        source: input.source ?? 'camera',
        captured_at: input.captured_at ?? null,
        uploaded_at: now.toISOString(),
        dhash: input.dhash || null,
        sha256: input.sha256 || null,
        width: input.width ?? null,
        height: input.height ?? null,
        bytes: input.bytes ?? input.data?.length ?? null,
        exif: input.exif ?? null,
      };
      db.state.photos.push(row);
      db.state.photo_uris[path] = input.uri ?? jpegDataUri(input.data ?? new Uint8Array(0));
      await this.persist();
      return clone(row);
    },
    url: async (path) => {
      const db = await this.enter('photos.url');
      this.requireSession();
      return db.state.photo_uris[path] ?? '';
    },
    urls: async (paths) => {
      const db = await this.enter('photos.urls');
      this.requireSession();
      const out: Record<string, string> = {};
      for (const p of paths) {
        const uri = db.state.photo_uris[p];
        if (uri) out[p] = uri;
      }
      return out;
    },
  };

  ai: RotaApi['ai'] = {
    verify: async (orderId) => {
      const db = await this.enter('ai.verify');
      const s = this.requireSession();
      const o = db.order(orderId);
      if (!o || !(o.assignee_id === s.user_id || isStaff(s))) {
        throw new RotaError('FORBIDDEN', { details: 'assignee or staff only' });
      }
      // the review of the current attempt, or (when that review already moved the order on, e.g. to rework)
      // the review the order points at, so a late or repeated verify never fails
      const existing =
        db.reviewFor(o.id, o.rework_count + 1) ??
        (o.status !== 'ai_review' && o.ai_review_id != null
          ? db.state.reviews.find((r) => r.id === o.ai_review_id)
          : undefined);
      if (existing) return clone(existing);
      const p = this.pending.get(orderId);
      if (p) {
        return new Promise<AiReview>((resolve, reject) => {
          p.waiters.push({ resolve, reject });
        });
      }
      const run = runMockReview(db, orderId, this.clock(), 0);
      if (run.created) {
        await this.persist();
        this.publish(run.changes);
      }
      return clone(run.review);
    },
    review: async (orderId) => {
      const db = await this.enter('ai.review');
      const s = this.requireSession();
      const o = db.order(orderId);
      if (!o || !db.canSee(o, s)) return null;
      const latest = db.state.reviews
        .filter((r) => r.order_id === orderId)
        .sort((a, b) => b.attempt - a.attempt || b.id - a.id)[0];
      return latest ? clone(latest) : null;
    },
    ask: async (input) => {
      const db = await this.enter('ai.ask');
      this.requireSession();
      const scope = ruleInsightScope(
        input,
        (id) => db.dirs.areas.find((a) => a.id === id)?.name ?? null,
      );
      return clone({ cards: insightCards(db, input), scope });
    },
    insights: async (input) => {
      const db = await this.enter('ai.insights');
      this.requireSession();
      return clone(insightCards(db, input));
    },
    shiftSummary: async (input) => {
      const db = await this.enter('ai.shiftSummary');
      requireStaffRole(this.requireSession());
      return mockShiftSummary(shiftReport(db, this.clock(), input));
    },
    explainRating: async (employeeId, period) => {
      const db = await this.enter('ai.explainRating');
      const s = this.requireSession();
      if (s.role === 'worker' && employeeId !== s.user_id) {
        throw new RotaError('FORBIDDEN', { details: 'own rating only' });
      }
      return mockExplainRating(ratingRowFor(db, employeeId, period, s));
    },
  };

  reports: RotaApi['reports'] = {
    shift: async (input) => {
      const db = await this.enter('reports.shift');
      requireStaffRole(this.requireSession());
      return clone(shiftReport(db, this.clock(), input));
    },
    rating: async (period, filters) => {
      const db = await this.enter('reports.rating');
      const s = this.requireSession();
      return clone(rating(db, period, filters, s));
    },
    dashboard: async (period, filters) => {
      const db = await this.enter('reports.dashboard');
      requireStaffRole(this.requireSession());
      return clone(dashboard(db, this.clock(), period, filters));
    },
  };

  notifications: RotaApi['notifications'] = {
    list: async () => {
      const db = await this.enter('notifications.list');
      const s = this.requireSession();
      const own = db.state.notifications
        .filter((n) => n.recipient_id === s.user_id)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)
        .slice(0, 50);
      return clone(own);
    },
    unreadCount: async () => {
      const db = await this.enter('notifications.unreadCount');
      const s = this.requireSession();
      return db.state.notifications.filter((n) => n.recipient_id === s.user_id && n.read_at == null)
        .length;
    },
    markRead: async (id) => {
      const db = await this.enter('notifications.markRead');
      const s = this.requireSession();
      const n = db.state.notifications.find((x) => x.id === id && x.recipient_id === s.user_id);
      if (!n || n.read_at != null) return;
      n.read_at = this.clock().toISOString();
      await this.persist();
    },
    registerPushToken: async (input) => {
      const db = await this.enter('notifications.registerPushToken');
      const s = this.requireSession();
      if (!EXPO_TOKEN.test(input.token ?? ''))
        throw new RotaError('BAD_INPUT', { details: 'not an Expo push token' });
      const now = this.clock().toISOString();
      const tokens = db.state.push_tokens.filter((t) => t.expo_token !== input.token);
      const prev = db.state.push_tokens.find((t) => t.expo_token === input.token);
      tokens.push({
        employee_id: s.user_id,
        expo_token: input.token,
        platform: input.platform ?? null,
        device_name: input.device_name ?? null,
        created_at: prev?.created_at ?? now,
        last_seen_at: now,
      });
      db.state.push_tokens = tokens;
      await this.persist();
    },
    unregisterPushToken: async (token) => {
      const db = await this.enter('notifications.unregisterPushToken');
      const s = this.requireSession();
      const before = db.state.push_tokens.length;
      db.state.push_tokens = db.state.push_tokens.filter(
        (t) => !(t.expo_token === token && t.employee_id === s.user_id),
      );
      if (db.state.push_tokens.length !== before) await this.persist();
    },
  };

  realtime: RotaApi['realtime'] = {
    subscribe: (topic, cb) => this.bus.subscribe(topic, cb),
    resync: () => this.bus.resync(),
  };

  demo: RotaApi['demo'] = {
    reset: async () => {
      const db = await this.enter('demo.reset');
      const s = this.requireSession();
      if (!isMasterRole(s.role))
        throw new RotaError('FORBIDDEN', { details: 'only a master or admin' });
      this.cancelPending();
      const fresh = seedState(this.clock(), {
        uuid: this.uuid,
        settings: db.state.settings,
        push_tokens: db.state.push_tokens,
      });
      // in place, so a call that already holds this db sees the new state
      Object.assign(db.state, fresh);
      await this.persist();
      this.bus.resync();
    },
    settings: async () => {
      const db = await this.enter('demo.settings');
      this.requireSession();
      return { ...db.state.settings };
    },
    updateSettings: async (patch: Partial<Settings>) => {
      const db = await this.enter('demo.updateSettings');
      const s = this.requireSession();
      const keys = Object.keys(patch) as (keyof Settings)[];
      for (const key of keys) {
        if (!(
          s.role === 'admin' ||
          (s.role === 'master' && (key === 'demo_mode' || key === 'demo_time_scale'))
        )) {
          throw new RotaError('FORBIDDEN', { details: `setting ${key}` });
        }
        const v = patch[key];
        if (key === 'demo_mode' && typeof v !== 'boolean') {
          throw new RotaError('BAD_INPUT', { details: `invalid value for ${key}` });
        }
        if (key === 'demo_time_scale' && (typeof v !== 'number' || v < 1 || v > 10)) {
          throw new RotaError('BAD_INPUT', { details: `invalid value for ${key}` });
        }
      }
      db.state.settings = { ...db.state.settings, ...patch };
      await this.persist();
      return { ...db.state.settings };
    },
  };
}
