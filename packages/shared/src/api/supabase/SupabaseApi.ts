// SupabaseApi: RotaApi over the real backend (PHASE_1 §5, PHASE_2 §2.2). The app creates the client with the
// publishable key and its own session storage (PHASE_1 §4) and passes it in; this class never sees a secret.
// Rows pass through in the database's snake_case shapes (domain/types.ts mirrors the columns), so MockApi and
// SupabaseApi return the same objects. Every failure is a RotaError (supabase/errors.ts).
//
// Reads: tables and the security_invoker views v_orders, v_worker_status, v_brigade_status (RLS applies: a worker
// sees own orders only). Writes: the security definer RPCs only (create_order, order_action, attach_photo,
// set_on_shift, set_setting, ...). Realtime: realtime.subscribe() runs a createLiveSync channel of its own
// (`rota-api-{uid}`) while it has subscribers; the apps' React Query layer uses createLiveSync directly.
//
// Known differences from MockApi: ai.verify calls the ai-verify Edge Function (rules + LLM, CLAUDE.md §11) and
// falls back to the rules only check (ai_check_rules, model 'rules', needs_master_review unless a rule fails)
// when the function is missing, fails or takes over 60 s; shiftSummary and explainRating build their text from the
// real report numbers with the deterministic writers of the mock until the Phase 5 Edge Functions exist.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ACTIVE_STATUSES, ROLES, type OrderAction, type Role } from '../../domain/enums';
import type {
  AiReview,
  AppNotification,
  AssigneeSuggestion,
  BrigadeStatusView,
  CreateOrderInput,
  Dashboard,
  Directories,
  Employee,
  Equipment,
  EquipmentHistory,
  Insight,
  InsightsInput,
  Order,
  OrderDetail,
  OrderEvent,
  OrderFilter,
  OrderMaterialView,
  OrderPhoto,
  OrderView,
  Period,
  PhotoUploadInput,
  RatingRow,
  RealtimeEvent,
  RealtimeTopic,
  ReportFilters,
  Session,
  SettingRow,
  Settings,
  ShiftCounters,
  ShiftReport,
  ShiftReportInput,
  Unsubscribe,
  WorkerStatusView,
} from '../../domain/types';
import { REALTIME_TOPICS } from '../../domain/types';
import { settings as DEFAULT_SETTINGS } from '../../fixtures/settings';
import { accountEmail, accountPassword } from '../../fixtures/ids';
import { startOfLocalDay } from '../../format/time';
import { createLiveSync, type LiveChange, type LiveSync } from '../../live/createLiveSync';
import { cancelLater, later, type TimerHandle } from '../../util/timers';
import type { Json } from '../database.types';
import type { RotaDatabase, RpcName } from '../database.extra';
import { RotaError } from '../errors';
import { mockExplainRating, mockShiftSummary } from '../mock/ai';
import { parseMockQuery } from '../mock/reports';
import type { CreateApiOptions, KeyValueStorage, RotaApi } from '../RotaApi';
import {
  fromAuth,
  fromPostgrest,
  fromStorage,
  fromThrown,
  isStorageNotFound,
  type AuthErrorLike,
  type PgErrorLike,
  type StorageErrorLike,
} from './errors';

type Db = SupabaseClient<RotaDatabase>;
type RpcArgs<F extends RpcName> = RotaDatabase['public']['Functions'][F]['Args'];

/** What every PostgREST builder resolves to. */
interface PgResponse {
  data: unknown;
  error: PgErrorLike | null;
  status?: number;
  count?: number | null;
}

const BUCKET = 'photos';
/** Signed URLs live an hour and are reused until 5 minutes before they expire. */
const SIGNED_URL_TTL_S = 3600;
const SIGNED_URL_MARGIN_MS = 5 * 60_000;
const SESSION_KEY = 'rota.supabase.session';
const BOARD_STATUSES = [...ACTIVE_STATUSES, 'rejected', 'done', 'ai_review'] as const;
const DONE_STATUSES = ['done', 'ai_review', 'closed'] as const;

/**
 * How long ai.verify waits for the ai-verify Edge Function before it falls back to the rules only check.
 * ai_submit keeps the first review of an attempt, so a fallback that comes too early throws away the model's
 * verdict: the wait covers the function's whole LLM stage (one 45 s call, fast retries, all inside 50 s,
 * ai-verify/retry.ts) plus the database and photo I/O. One Sonnet call takes about 10 s. Nobody blocks on it:
 * the close form does not await verify, and the review screen waits through realtime and polling.
 */
export const AI_VERIFY_TIMEOUT_MS = 60_000;

/** functions.invoke of supabase-js, duck typed: clients without Edge Functions (tests, old builds) use the rules. */
type FunctionsInvoke = (
  name: string,
  options: { body: unknown; timeout?: number },
) => Promise<{ data: unknown; error: unknown }>;

/**
 * The HTTP status of a functions.invoke error: the Response status for FunctionsHttpError, 0 when the request never
 * got an answer (FunctionsFetchError: network, abort, timeout) or the relay failed (FunctionsRelayError).
 */
export function functionErrorStatus(error: unknown): number {
  const e = error as { name?: unknown; context?: { status?: unknown } | null } | null;
  if (e?.name === 'FunctionsRelayError') return 0;
  const status = e?.context?.status;
  return typeof status === 'number' ? status : 0;
}

/** The review in an ai-verify answer ({review, already_reviewed?, rules_only?}), or null when the shape is off. */
function reviewOf(data: unknown): AiReview | null {
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      return null;
    }
  }
  const review = (body as { review?: Partial<AiReview> } | null)?.review;
  return review && typeof review.id === 'number' && typeof review.verdict === 'string'
    ? (review as AiReview)
    : null;
}

const TOPIC_OF: Readonly<Record<LiveChange['table'], RealtimeTopic>> = {
  orders: 'orders',
  notifications: 'notifications',
  ai_reviews: 'reviews',
  employees: 'workers',
};

/** Awaits a PostgREST builder and returns its data, or throws the mapped RotaError. */
async function unwrap<T>(query: PromiseLike<PgResponse>): Promise<T> {
  let res: PgResponse;
  try {
    res = await query;
  } catch (e) {
    throw fromThrown(e);
  }
  if (res.error) throw fromPostgrest(res.error, res.status);
  return res.data as T;
}

/** Awaits a head count query. */
async function countOf(query: PromiseLike<PgResponse>): Promise<number> {
  let res: PgResponse;
  try {
    res = await query;
  } catch (e) {
    throw fromThrown(e);
  }
  if (res.error) throw fromPostgrest(res.error, res.status);
  return res.count ?? 0;
}

const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

/** PostgREST `or` values with reserved characters (timestamps) go in double quotes. */
const quoted = (value: string): string => `"${value}"`;

function asJson(value: unknown): Json {
  return value as Json;
}

/** Plain copies, so callers never hold the cached arrays. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The compressed JPEG as an ArrayBuffer (React Native uploads bytes reliably only this way). */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

export function foldSettings(rows: readonly SettingRow[]): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  const record = out as unknown as Record<string, unknown>;
  for (const row of rows) {
    if (row.key in record && row.value != null) record[row.key] = row.value;
  }
  return out;
}

/** The checks MockApi and set_setting share: masters may change the two demo keys, admins every key. */
export function validateSettingsPatch(role: Role, patch: Partial<Settings>): void {
  for (const key of Object.keys(patch) as (keyof Settings)[]) {
    if (!(
      role === 'admin' ||
      (role === 'master' && (key === 'demo_mode' || key === 'demo_time_scale'))
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
}

/** Σ (coalesce(done_at, cancelled_at, now) − created_at) over orders with equipment_stopped, minutes. */
export function downtimeMinutes(orders: readonly Order[], now: Date): number {
  let ms = 0;
  for (const o of orders) {
    if (!o.equipment_stopped) continue;
    const end = Date.parse(o.done_at ?? o.cancelled_at ?? '') || now.getTime();
    ms += end - Date.parse(o.created_at);
  }
  return Math.round(ms / 60_000);
}

interface StaticDirectories {
  areas: Directories['areas'];
  brigades: Directories['brigades'];
  fault_codes: Directories['fault_codes'];
  materials: Directories['materials'];
  work_norms: Directories['work_norms'];
  equipment_type_specialty: Directories['equipment_type_specialty'];
  problem_templates: Directories['problem_templates'];
}

type MaterialJoinRow = Omit<OrderMaterialView, 'material_name' | 'unit'> & {
  materials: { name: string; unit: string } | null;
};

export class SupabaseApi implements RotaApi {
  private readonly client: SupabaseClient;
  private readonly db: Db;
  private readonly storage: KeyValueStorage;
  private readonly uuid: () => string;
  private readonly clock: () => Date;

  /** undefined until known; null when signed out. */
  private current: Session | null | undefined;
  private knownUid: string | null | undefined;
  private readonly sessionLoads = new Map<string, Promise<Session>>();
  private readonly authListeners = new Set<(s: Session | null) => void>();
  private authSub: { unsubscribe(): void } | null = null;

  private staticDirs: Promise<StaticDirectories> | null = null;
  private brigadeOf: Promise<Map<string, number | null>> | null = null;
  private readonly signed = new Map<string, { url: string; expiresAt: number }>();
  private pushToken: string | null = null;

  private readonly subscribers = new Map<RealtimeTopic, Set<(e: RealtimeEvent) => void>>();
  private live: LiveSync | null = null;
  private disposed = false;

  constructor(options: CreateApiOptions) {
    if (!options.client) {
      throw new RotaError('UNKNOWN', { message: 'SupabaseApi needs options.client' });
    }
    this.client = options.client;
    this.db = options.client as unknown as Db;
    this.storage = options.storage;
    this.uuid = options.uuid;
    this.clock = options.now ?? (() => new Date());
    const auth = this.client.auth as Partial<SupabaseClient['auth']> | undefined;
    if (auth?.onAuthStateChange) {
      const { data } = auth.onAuthStateChange((event) => {
        // supabase-js holds its auth lock while it calls listeners: never call it from in here, defer
        later(() => {
          this.applyAuthEvent(event).catch(() => undefined);
        }, 0);
      });
      this.authSub = data.subscription;
    }
  }

  /** Stops realtime and the auth listener (tests, hot reload). Not part of RotaApi. */
  dispose(): void {
    this.disposed = true;
    this.stopLive();
    this.subscribers.clear();
    this.authSub?.unsubscribe();
    this.authSub = null;
  }

  // -------------------------------------------------------------------------
  // session plumbing
  // -------------------------------------------------------------------------

  /**
   * Follows sign in and sign out made elsewhere (token refresh failure, another tab). Runs deferred, so the
   * event may be stale by now (a sign in followed by a sign out): it reconciles with the client's current
   * session instead of trusting the event's.
   */
  private async applyAuthEvent(event: string): Promise<void> {
    if (this.disposed || event === 'INITIAL_SESSION') return;
    let user: User | null;
    try {
      const { data } = await this.client.auth.getSession();
      user = data.session?.user ?? null;
    } catch {
      return;
    }
    if (!user) {
      if (this.knownUid !== null) {
        await this.forget();
        this.setCurrent(null, true);
      }
      return;
    }
    if (this.current?.user_id === user.id) return; // TOKEN_REFRESHED, USER_UPDATED
    try {
      const s = await this.sessionFor(user);
      this.setCurrent(s, true);
    } catch {
      // the employee row could not be read (offline): session() tries again
    }
  }

  /** Session from the auth user plus the employees row; one request per user at a time. */
  private sessionFor(user: User): Promise<Session> {
    const running = this.sessionLoads.get(user.id);
    if (running) return running;
    const load = (async () => {
      const row = await unwrap<Pick<
        Employee,
        'id' | 'tab_no' | 'full_name' | 'short_name' | 'pseudonym' | 'role'
      > | null>(
        this.db
          .from('employees')
          .select('id, tab_no, full_name, short_name, pseudonym, role')
          .eq('id', user.id)
          .maybeSingle(),
      );
      if (!row) throw new RotaError('FORBIDDEN', { details: 'no employee for this account' });
      const appRole = (user.app_metadata as Record<string, unknown> | undefined)?.app_role;
      const s: Session = {
        user_id: user.id,
        role: isRole(appRole) ? appRole : row.role,
        short_name: row.short_name,
        full_name: row.full_name,
        tab_no: row.tab_no,
        pseudonym: row.pseudonym,
      };
      await this.writeCached(s);
      return s;
    })();
    this.sessionLoads.set(user.id, load);
    load.then(
      () => this.sessionLoads.delete(user.id),
      () => this.sessionLoads.delete(user.id),
    );
    return load;
  }

  /** Records the signed-in user; notifies listeners (when asked) and moves realtime when the user changes. */
  private setCurrent(s: Session | null, notify: boolean): void {
    const uid = s?.user_id ?? null;
    const changed = uid !== this.knownUid;
    this.current = s;
    this.knownUid = uid;
    if (!changed) return;
    this.stopLive();
    this.ensureLive();
    if (!notify) return;
    for (const cb of [...this.authListeners]) {
      try {
        cb(s ? { ...s } : null);
      } catch {
        // a listener error must not fail sign in
      }
    }
  }

  private async readCached(): Promise<Session | null> {
    try {
      const raw = await this.storage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }

  private async writeCached(s: Session): Promise<void> {
    try {
      await this.storage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch {
      // the session still holds in memory
    }
  }

  /** Local cleanup on sign out. */
  private async forget(): Promise<void> {
    this.signed.clear();
    this.pushToken = null;
    try {
      await this.storage.removeItem(SESSION_KEY);
    } catch {
      // nothing stored
    }
  }

  private async requireSession(): Promise<Session> {
    const s = this.current === undefined ? await this.auth.session() : this.current;
    if (!s) throw new RotaError('FORBIDDEN', { details: 'sign in required' });
    return s;
  }

  // -------------------------------------------------------------------------
  // realtime plumbing
  // -------------------------------------------------------------------------

  private hasSubscribers(): boolean {
    for (const set of this.subscribers.values()) if (set.size > 0) return true;
    return false;
  }

  private ensureLive(): void {
    if (this.live || this.disposed || !this.hasSubscribers()) return;
    const uid = this.knownUid;
    if (uid === undefined) {
      // first subscriber before anyone asked for the session: find out, then start
      this.auth.session().then(
        () => this.ensureLive(),
        () => undefined,
      );
      return;
    }
    if (uid === null) return;
    this.live = createLiveSync({
      client: this.client,
      uid,
      channelName: `rota-api-${uid}`,
      onInvalidate: () => undefined,
      onChange: (c) => this.emitChange(c),
      // every SUBSCRIBED (first join, rejoin) tells subscribers to refetch what they may have missed
      onStatus: (s) => {
        if (s === 'live') this.emitRefresh();
      },
    });
  }

  private stopLive(): void {
    this.live?.stop();
    this.live = null;
  }

  private emit(event: RealtimeEvent): void {
    const set = this.subscribers.get(event.topic);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(event);
      } catch {
        // a failing subscriber must not break the others
      }
    }
  }

  private emitChange(c: LiveChange): void {
    this.emit({ topic: TOPIC_OF[c.table], type: c.type, row: c.row ?? c.old ?? undefined });
  }

  private emitRefresh(): void {
    for (const topic of REALTIME_TOPICS) this.emit({ topic, type: 'UPDATE' });
  }

  // -------------------------------------------------------------------------
  // small helpers
  // -------------------------------------------------------------------------

  /** An RPC by name with its arguments checked against the generated types; callers type the result. */
  private rpc<F extends RpcName>(fn: F, args?: RpcArgs<F>): Promise<unknown> {
    const call = this.client.rpc as unknown as (
      this: SupabaseClient,
      f: string,
      a?: unknown,
    ) => PromiseLike<PgResponse>;
    return unwrap<unknown>(call.call(this.client, fn, args));
  }

  private loadStatic(): Promise<StaticDirectories> {
    this.staticDirs ??= (async () => {
      const [areas, brigades, faultCodes, materials, workNorms, typeSpecialty, templates] =
        await Promise.all([
          unwrap<Directories['areas']>(this.db.from('areas').select('*').order('sort').order('id')),
          unwrap<Directories['brigades']>(this.db.from('brigades').select('*').order('id')),
          unwrap<Directories['fault_codes']>(this.db.from('fault_codes').select('*').order('code')),
          unwrap<Directories['materials']>(this.db.from('materials').select('*').order('id')),
          unwrap<Directories['work_norms']>(
            this.db.from('work_norms').select('*').order('fault_code'),
          ),
          unwrap<Directories['equipment_type_specialty']>(
            this.db.from('equipment_type_specialty').select('*').order('type'),
          ),
          unwrap<Directories['problem_templates']>(
            this.db.from('problem_templates').select('*').order('id'),
          ),
        ]);
      return {
        areas,
        brigades,
        fault_codes: faultCodes,
        materials,
        work_norms: workNorms,
        equipment_type_specialty: typeSpecialty,
        problem_templates: templates,
      };
    })();
    // a failed load (signed out, offline) is retried by the next call
    this.staticDirs.catch(() => {
      this.staticDirs = null;
    });
    return this.staticDirs;
  }

  /** employee id → brigade id, for the brigade filter (the order's brigade, else the assignee's). */
  private loadBrigades(): Promise<Map<string, number | null>> {
    this.brigadeOf ??= unwrap<{ id: string; brigade_id: number | null }[]>(
      this.db.from('employees').select('id, brigade_id'),
    ).then((rows) => new Map(rows.map((r) => [r.id, r.brigade_id])));
    this.brigadeOf.catch(() => {
      this.brigadeOf = null;
    });
    return this.brigadeOf;
  }

  private async filterByBrigade(
    rows: OrderView[],
    brigadeId: number | undefined,
  ): Promise<OrderView[]> {
    if (brigadeId == null) return rows;
    const of = await this.loadBrigades();
    return rows.filter((o) => (o.brigade_id ?? of.get(o.assignee_id) ?? null) === brigadeId);
  }

  private async signedUrls(paths: readonly string[]): Promise<Record<string, string>> {
    const now = this.clock().getTime();
    const out: Record<string, string> = {};
    const missing: string[] = [];
    for (const p of new Set(paths)) {
      const hit = this.signed.get(p);
      if (hit && hit.expiresAt - SIGNED_URL_MARGIN_MS > now) out[p] = hit.url;
      else if (p) missing.push(p);
    }
    if (missing.length === 0) return out;
    const bucket = this.client.storage.from(BUCKET);
    const expiresAt = now + SIGNED_URL_TTL_S * 1000;
    if (missing.length === 1) {
      const path = missing[0] as string;
      let res: { data: { signedUrl: string } | null; error: StorageErrorLike | null };
      try {
        res = await bucket.createSignedUrl(path, SIGNED_URL_TTL_S);
      } catch (e) {
        throw fromThrown(e);
      }
      if (res.error) {
        if (isStorageNotFound(res.error)) return out;
        throw fromStorage(res.error);
      }
      if (res.data?.signedUrl) {
        this.signed.set(path, { url: res.data.signedUrl, expiresAt });
        out[path] = res.data.signedUrl;
      }
      return out;
    }
    let res: {
      data: { path: string | null; signedUrl: string | null; error: string | null }[] | null;
      error: StorageErrorLike | null;
    };
    try {
      res = await bucket.createSignedUrls(missing, SIGNED_URL_TTL_S);
    } catch (e) {
      throw fromThrown(e);
    }
    if (res.error) throw fromStorage(res.error);
    for (const item of res.data ?? []) {
      if (!item.path || item.error || !item.signedUrl) continue;
      this.signed.set(item.path, { url: item.signedUrl, expiresAt });
      out[item.path] = item.signedUrl;
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // RotaApi
  // -------------------------------------------------------------------------

  auth: RotaApi['auth'] = {
    signIn: async (tabNo, pin) => {
      let res: Awaited<ReturnType<SupabaseClient['auth']['signInWithPassword']>>;
      try {
        res = await this.client.auth.signInWithPassword({
          email: accountEmail(tabNo.trim()),
          password: accountPassword(pin),
        });
      } catch (e) {
        throw fromThrown(e);
      }
      if (res.error) throw fromAuth(res.error as AuthErrorLike);
      const user = res.data.user;
      if (!user) throw new RotaError('WRONG_PIN');
      let s: Session;
      try {
        s = await this.sessionFor(user);
      } catch (e) {
        // an account without an employee row cannot use the apps
        await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
        throw e;
      }
      this.setCurrent(s, true);
      return { ...s };
    },
    signOut: async () => {
      const token = this.pushToken;
      if (token) {
        await (this.rpc('unregister_push_token', { p_token: token }) as Promise<null>).catch(
          () => undefined,
        );
      }
      this.stopLive();
      // scope local: the other devices of this account stay signed in. supabase-js removes the local session
      // even when the server call fails (offline), so a failure here is not reported.
      try {
        await this.client.auth.signOut({ scope: 'local' });
      } catch {
        // the local session is gone either way
      }
      await this.forget();
      this.setCurrent(null, true);
    },
    session: async () => {
      let res: Awaited<ReturnType<SupabaseClient['auth']['getSession']>>;
      try {
        res = await this.client.auth.getSession();
      } catch (e) {
        throw fromThrown(e);
      }
      const user = res.data.session?.user ?? null;
      if (!user) {
        if (res.error) {
          // the token could not be refreshed offline: keep the last known person until the network is back
          const mapped = fromAuth(res.error as AuthErrorLike);
          if (mapped.code === 'NETWORK') {
            const cached = this.current ?? (await this.readCached());
            if (cached) return { ...cached };
          }
        }
        this.setCurrent(null, false);
        return null;
      }
      if (this.current?.user_id === user.id) return { ...this.current };
      const cached = await this.readCached();
      if (cached?.user_id === user.id) {
        this.setCurrent(cached, false);
        return { ...cached };
      }
      const s = await this.sessionFor(user);
      this.setCurrent(s, false);
      return { ...s };
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
      const [stat, equipment, employees, settingRows] = await Promise.all([
        this.loadStatic(),
        unwrap<Equipment[]>(this.db.from('equipment').select('*').order('id')),
        unwrap<Employee[]>(this.db.from('employees').select('*').order('tab_no')),
        unwrap<SettingRow[]>(this.db.from('settings').select('key, value')),
      ]);
      return {
        ...clone(stat),
        equipment,
        employees,
        settings: foldSettings(settingRows),
      };
    },
  };

  orders: RotaApi['orders'] = {
    list: async (filter: OrderFilter = {}) => {
      let q = this.db.from('v_orders').select('*');
      if (filter.assignee_id != null) q = q.eq('assignee_id', filter.assignee_id);
      if (filter.master_id != null) q = q.eq('master_id', filter.master_id);
      if (filter.statuses != null) q = q.in('status', filter.statuses);
      if (filter.area_id != null) q = q.eq('area_id', filter.area_id);
      if (filter.equipment_id != null) q = q.eq('equipment_id', filter.equipment_id);
      if (filter.priority != null) q = q.eq('priority', filter.priority);
      if (filter.since != null) q = q.gte('created_at', filter.since);
      // priority_t sorts in declaration order: emergency first
      let sorted = q.order('priority').order('due_at').order('id');
      if (filter.limit != null) sorted = sorted.limit(Math.max(0, filter.limit));
      return unwrap<OrderView[]>(sorted);
    },
    forBoard: async (filters: ReportFilters = {}) => {
      const today = startOfLocalDay(this.clock()).toISOString();
      let q = this.db
        .from('v_orders')
        .select('*')
        .or(`status.in.(${BOARD_STATUSES.join(',')}),closed_at.gte.${quoted(today)}`);
      if (filters.area_id != null) q = q.eq('area_id', filters.area_id);
      if (filters.equipment_id != null) q = q.eq('equipment_id', filters.equipment_id);
      if (filters.assignee_id != null) q = q.eq('assignee_id', filters.assignee_id);
      const rows = await unwrap<OrderView[]>(q.order('priority').order('due_at').order('id'));
      return this.filterByBrigade(rows, filters.brigade_id);
    },
    get: async (id) => {
      const [rows, events, photos, materials, reviews] = await Promise.all([
        unwrap<OrderView[]>(this.db.from('v_orders').select('*').eq('id', id).limit(1)),
        unwrap<OrderEvent[]>(
          this.db
            .from('order_events')
            .select('*')
            .eq('order_id', id)
            .order('created_at')
            .order('id'),
        ),
        unwrap<OrderPhoto[]>(
          this.db
            .from('order_photos')
            .select('*')
            .eq('order_id', id)
            .order('uploaded_at')
            .order('id'),
        ),
        unwrap<MaterialJoinRow[]>(
          this.db
            .from('order_materials')
            .select('id, order_id, material_id, qty, materials(name, unit)')
            .eq('order_id', id)
            .order('id'),
        ),
        unwrap<AiReview[]>(
          this.db.from('ai_reviews').select('*').eq('order_id', id).order('attempt').order('id'),
        ),
      ]);
      const order = rows[0];
      if (!order) throw new RotaError('BAD_INPUT', { details: 'order not found' });
      const detail: OrderDetail = {
        order,
        events,
        photos,
        materials: materials.map(({ materials: m, ...line }) => ({
          ...line,
          material_name: m?.name ?? '',
          unit: m?.unit ?? '',
        })),
        reviews,
      };
      return detail;
    },
    create: async (input: CreateOrderInput, clientActionId: string) =>
      this.rpc('create_order', {
        p: asJson(input),
        p_client_action_id: clientActionId,
      }) as Promise<Order>,
    action: async (id: number, action: OrderAction, payload, clientActionId: string) =>
      this.rpc('order_action', {
        p_order_id: id,
        p_action: action,
        p_payload: asJson(payload ?? {}),
        p_client_action_id: clientActionId,
      }) as Promise<Order>,
    suggestAssignees: async (equipmentId, specialty, exclude) => {
      const args: RpcArgs<'suggest_assignees'> = { p_equipment_id: equipmentId };
      if (specialty) args.p_required_specialty = specialty;
      if (exclude) args.p_exclude = exclude;
      return this.rpc('suggest_assignees', args) as Promise<AssigneeSuggestion[]>;
    },
  };

  workers: RotaApi['workers'] = {
    statuses: async () =>
      unwrap<WorkerStatusView[]>(this.db.from('v_worker_status').select('*').order('tab_no')),
    brigades: async () =>
      unwrap<BrigadeStatusView[]>(this.db.from('v_brigade_status').select('*').order('id')),
    setOnShift: async (employeeId, onShift) => {
      await (this.rpc('set_on_shift', {
        p_employee_id: employeeId,
        p_on_shift: onShift,
      }) as Promise<null>);
    },
  };

  shift: RotaApi['shift'] = {
    counters: async (shiftStart: Date): Promise<ShiftCounters> => {
      const start = shiftStart.toISOString();
      const head = { count: 'exact', head: true } as const;
      const [issued, done, overdue, stopped] = await Promise.all([
        countOf(this.db.from('orders').select('id', head).gte('created_at', start)),
        countOf(
          this.db
            .from('orders')
            .select('id', head)
            .in('status', [...DONE_STATUSES])
            .or(`done_at.gte.${quoted(start)},closed_at.gte.${quoted(start)}`),
        ),
        // the view's is_overdue uses the server clock
        countOf(this.db.from('v_orders').select('id', head).eq('is_overdue', true)),
        countOf(this.db.from('equipment').select('id', head).eq('is_stopped', true)),
      ]);
      return { issued, done, overdue, stopped };
    },
  };

  equipment: RotaApi['equipment'] = {
    history: async (id): Promise<EquipmentHistory> => {
      const [eq, orders] = await Promise.all([
        unwrap<Equipment | null>(this.db.from('equipment').select('*').eq('id', id).maybeSingle()),
        unwrap<OrderView[]>(
          this.db
            .from('v_orders')
            .select('*')
            .eq('equipment_id', id)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false }),
        ),
      ]);
      if (!eq) throw new RotaError('BAD_INPUT', { details: 'equipment not found' });
      return { equipment: eq, orders, downtime_min: downtimeMinutes(orders, this.clock()) };
    },
  };

  photos: RotaApi['photos'] = {
    upload: async (input: PhotoUploadInput) => {
      if (!input.client_ref || (input.kind !== 'before' && input.kind !== 'after')) {
        throw new RotaError('BAD_INPUT', { details: 'client_ref, kind and storage_path required' });
      }
      const path = `orders/${input.client_ref}/${input.kind}/${this.uuid()}.jpg`;
      let up: { error: StorageErrorLike | null };
      try {
        up = await this.client.storage
          .from(BUCKET)
          .upload(path, toArrayBuffer(input.data), { contentType: 'image/jpeg', upsert: false });
      } catch (e) {
        throw fromThrown(e);
      }
      if (up.error) throw fromStorage(up.error);
      return this.rpc('attach_photo', {
        p: asJson({
          client_ref: input.client_ref,
          kind: input.kind,
          storage_path: path,
          source: input.source,
          captured_at: input.captured_at,
          dhash: input.dhash,
          sha256: input.sha256,
          width: input.width,
          height: input.height,
          bytes: input.bytes ?? input.data.byteLength,
          exif: input.exif,
        }),
      }) as Promise<OrderPhoto>;
    },
    url: async (path) => (await this.signedUrls([path]))[path] ?? '',
    urls: async (paths) => this.signedUrls(paths),
  };

  /**
   * The ai-verify Edge Function (CLAUDE.md §11): the review, or null when the caller should fall back to the rules
   * only check: no functions client, a network error or timeout (AI_VERIFY_TIMEOUT_MS), 404 (function not
   * deployed), 5xx, a relay error, 409 (the order left ai_review: the rules path finds the review that moved it)
   * or an answer without a review. 401 and 403 are FORBIDDEN and 400 is BAD_INPUT, as the rules path would say.
   */
  private async verifyByFunction(orderId: number): Promise<AiReview | null> {
    const functions = (this.client as { functions?: { invoke?: FunctionsInvoke } }).functions;
    const invoke = functions?.invoke;
    if (typeof invoke !== 'function') return null;
    let timer: TimerHandle | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = later(() => resolve('timeout'), AI_VERIFY_TIMEOUT_MS);
    });
    let res: { data: unknown; error: unknown } | 'timeout';
    try {
      res = await Promise.race([
        invoke.call(functions, 'ai-verify', {
          body: { order_id: orderId, source: 'app' },
          timeout: AI_VERIFY_TIMEOUT_MS,
        }),
        timedOut,
      ]);
    } catch {
      return null;
    } finally {
      if (timer !== undefined) cancelLater(timer);
    }
    if (res === 'timeout') return null;
    if (!res.error) return reviewOf(res.data);
    const status = functionErrorStatus(res.error);
    if (status === 401 || status === 403) {
      throw new RotaError('FORBIDDEN', { details: `ai-verify ${status}`, cause: res.error });
    }
    if (status === 400) {
      throw new RotaError('BAD_INPUT', { details: 'ai-verify 400', cause: res.error });
    }
    return null;
  }

  /** public.ai_check_rules: the rules only review a signed-in assignee or master may start. */
  private async verifyByRules(orderId: number): Promise<AiReview> {
    try {
      return await (this.rpc('ai_check_rules', { p_order_id: orderId }) as Promise<AiReview>);
    } catch (e) {
      if (!(e instanceof RotaError) || e.code !== 'BAD_TRANSITION') throw e;
      // the order moved on (rework, closed): the review that moved it
      const row = await unwrap<{ ai_review_id: number | null } | null>(
        this.db.from('orders').select('ai_review_id').eq('id', orderId).maybeSingle(),
      );
      const review =
        row?.ai_review_id != null
          ? await unwrap<AiReview | null>(
              this.db.from('ai_reviews').select('*').eq('id', row.ai_review_id).maybeSingle(),
            )
          : await this.ai.review(orderId);
      if (review) return review;
      throw e;
    }
  }

  ai: RotaApi['ai'] = {
    verify: async (orderId) =>
      (await this.verifyByFunction(orderId)) ?? (await this.verifyByRules(orderId)),
    review: async (orderId) =>
      unwrap<AiReview | null>(
        this.db
          .from('ai_reviews')
          .select('*')
          .eq('order_id', orderId)
          .order('attempt', { ascending: false })
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    insights: async (input: InsightsInput) => {
      // the ask box (Phase 6 parses it with Haiku): until then the mock's keyword parser, same answers
      let period: Period = { from: input.from, to: input.to };
      let filters: ReportFilters = { ...(input.filters ?? {}) };
      if (input.query) {
        const parsed = parseMockQuery(input.query, period);
        period = parsed.period;
        if (parsed.area_id != null) filters = { ...filters, area_id: parsed.area_id };
      }
      const cards = await (this.rpc('insight_cards', {
        p_from: period.from,
        p_to: period.to,
        p_filters: asJson(filters),
      }) as Promise<Insight[] | null>);
      return cards ?? [];
    },
    shiftSummary: async (input: ShiftReportInput) =>
      // Phase 5: the ai-shift-summary Edge Function; until then the deterministic summary of the real numbers
      mockShiftSummary(await this.reports.shift(input)),
    explainRating: async (employeeId, period) => {
      const s = await this.requireSession();
      if (s.role === 'worker' && employeeId !== s.user_id) {
        throw new RotaError('FORBIDDEN', { details: 'own rating only' });
      }
      const rows = await this.reports.rating(period, { assignee_id: employeeId });
      return mockExplainRating(rows.find((r) => r.kind === 'worker' && r.id === employeeId));
    },
  };

  reports: RotaApi['reports'] = {
    shift: async (input: ShiftReportInput) =>
      this.rpc('shift_report', {
        p_from: input.from,
        p_to: input.to,
        p_filters: asJson(input.filters ?? {}),
      }) as Promise<ShiftReport>,
    rating: async (period: Period, filters?: ReportFilters) =>
      this.rpc('rating', {
        p_from: period.from,
        p_to: period.to,
        p_filters: asJson(filters ?? {}),
      }) as Promise<RatingRow[]>,
    dashboard: async (period: Period, filters?: ReportFilters) =>
      this.rpc('dashboard', {
        p_from: period.from,
        p_to: period.to,
        p_filters: asJson(filters ?? {}),
      }) as Promise<Dashboard>,
  };

  notifications: RotaApi['notifications'] = {
    list: async () =>
      // RLS: own notifications only
      unwrap<AppNotification[]>(
        this.db
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(50),
      ),
    unreadCount: async () =>
      countOf(
        this.db
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .is('read_at', null),
      ),
    markRead: async (id) => {
      await unwrap<null>(
        this.db
          .from('notifications')
          .update({ read_at: this.clock().toISOString() })
          .eq('id', id)
          .is('read_at', null),
      );
    },
    registerPushToken: async (input) => {
      await (this.rpc('register_push_token', {
        p_token: input.token,
        p_platform: input.platform,
        p_device_name: input.device_name ?? undefined,
      }) as Promise<null>);
      this.pushToken = input.token;
    },
    unregisterPushToken: async (token) => {
      await (this.rpc('unregister_push_token', { p_token: token }) as Promise<null>);
      if (this.pushToken === token) this.pushToken = null;
    },
  };

  realtime: RotaApi['realtime'] = {
    subscribe: (topic, cb): Unsubscribe => {
      let set = this.subscribers.get(topic);
      if (!set) {
        set = new Set();
        this.subscribers.set(topic, set);
      }
      set.add(cb);
      this.ensureLive();
      return () => {
        set.delete(cb);
        if (!this.hasSubscribers()) this.stopLive();
      };
    },
    resync: () => {
      this.emitRefresh();
    },
  };

  demo: RotaApi['demo'] = {
    reset: async () => {
      await (this.rpc('demo_reset') as Promise<unknown>);
      this.realtime.resync();
    },
    settings: async () =>
      foldSettings(await unwrap<SettingRow[]>(this.db.from('settings').select('key, value'))),
    updateSettings: async (patch: Partial<Settings>) => {
      const s = await this.requireSession();
      // every key is checked before the first write, like MockApi; set_setting checks again
      validateSettingsPatch(s.role, patch);
      for (const key of Object.keys(patch) as (keyof Settings)[]) {
        await (this.rpc('set_setting', {
          p_key: key,
          p_value: asJson(patch[key]),
        }) as Promise<SettingRow>);
      }
      return this.demo.settings();
    },
  };
}
