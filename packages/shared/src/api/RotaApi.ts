// The one API both apps code against. MockApi (Phase 0) and SupabaseApi (Phase 1+) implement it with
// identical results; rows pass through in the database's snake_case shapes (domain/types.ts).
// Every mutation carries a client_action_id (uuid) for idempotency. Errors are RotaError (api/errors.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderAction } from '../domain/enums';
import type {
  ActionPayload,
  AiReview,
  AppNotification,
  AssigneeSuggestion,
  BrigadeStatusView,
  CreateOrderInput,
  Dashboard,
  Directories,
  EquipmentHistory,
  Insight,
  InsightsInput,
  InsightsResult,
  Order,
  OrderDetail,
  OrderFilter,
  OrderPhoto,
  OrderView,
  Period,
  PhotoUploadInput,
  PushTokenInput,
  RatingRow,
  RealtimeEvent,
  RealtimeTopic,
  ReportFilters,
  Session,
  Settings,
  ShiftCounters,
  ShiftReport,
  ShiftReportInput,
  ShiftSummary,
  Unsubscribe,
  WorkerStatusView,
} from '../domain/types';

export interface RotaApi {
  auth: {
    /** Табельный номер + ПИН. Wrong pair → RotaError WRONG_PIN. */
    signIn(tabNo: string, pin: string): Promise<Session>;
    signOut(): Promise<void>;
    session(): Promise<Session | null>;
    onChange(cb: (s: Session | null) => void): Unsubscribe;
  };
  directories: {
    /** Every directory plus settings; cache it, refetch on demand. */
    get(): Promise<Directories>;
  };
  orders: {
    /** v_orders rows, emergency first, then by due_at. A worker only ever sees own orders (RLS). */
    list(filter?: OrderFilter): Promise<OrderView[]>;
    /** Board rows: active, rejected, done, ai_review, closed today (local); group by board_column. */
    forBoard(filters?: ReportFilters): Promise<OrderView[]>;
    get(id: number): Promise<OrderDetail>;
    /** rpc create_order. Errors: BAD_INPUT, NOT_ON_SHIFT (retry with allow_off_shift), FORBIDDEN. */
    create(input: CreateOrderInput, clientActionId: string): Promise<Order>;
    /** rpc order_action. Errors: FORBIDDEN, BAD_TRANSITION, MISSING_REASON, ANOTHER_IN_PROGRESS
     *  (retry with pause_current), NOT_ON_SHIFT (retry with allow_off_shift), BAD_INPUT. */
    action(
      id: number,
      action: OrderAction,
      payload: ActionPayload,
      clientActionId: string,
    ): Promise<Order>;
    /** Top 3 candidates (CLAUDE.md §10). */
    suggestAssignees(
      equipmentId: number,
      specialty?: string,
      exclude?: string,
    ): Promise<AssigneeSuggestion[]>;
  };
  workers: {
    /** v_worker_status rows. */
    statuses(): Promise<WorkerStatusView[]>;
    /** v_brigade_status rows (the «Бригады» tab of the picker). */
    brigades(): Promise<BrigadeStatusView[]>;
    setOnShift(employeeId: string, onShift: boolean): Promise<void>;
  };
  shift: {
    /** Counters since the shift start (shiftStart(now) from format/time). */
    counters(shiftStart: Date): Promise<ShiftCounters>;
  };
  equipment: {
    history(id: number): Promise<EquipmentHistory>;
  };
  photos: {
    /** Uploads to orders/{client_ref}/{kind}/{uuid}.jpg, then attach_photo. */
    upload(input: PhotoUploadInput): Promise<OrderPhoto>;
    /** Signed URL for one storage path (cached). */
    url(path: string): Promise<string>;
    /** Signed URLs for many paths: path → url. */
    urls(paths: string[]): Promise<Record<string, string>>;
  };
  ai: {
    /** Runs the completion check for the order's current attempt and returns the review. */
    verify(orderId: number): Promise<AiReview>;
    /** Latest review of the order, or null. */
    review(orderId: number): Promise<AiReview | null>;
    /**
     * Insight cards and the scope they answer (CLAUDE.md §15): the ai-insights Edge Function (Haiku reads the
     * question, Sonnet writes the cards), else rpc insight_cards with the keyword reader. Staff only.
     */
    ask(input: InsightsInput): Promise<InsightsResult>;
    /** The cards of ask(). */
    insights(input: InsightsInput): Promise<Insight[]>;
    shiftSummary(input: ShiftReportInput): Promise<ShiftSummary>;
    /** Three sentences: what helped, what hurt, one action. */
    explainRating(employeeId: string, period: Period): Promise<string>;
  };
  reports: {
    shift(input: ShiftReportInput): Promise<ShiftReport>;
    rating(period: Period, filters?: ReportFilters): Promise<RatingRow[]>;
    /** Manager tiles. */
    dashboard(period: Period, filters?: ReportFilters): Promise<Dashboard>;
  };
  notifications: {
    /** Own notifications, newest first (50). */
    list(): Promise<AppNotification[]>;
    unreadCount(): Promise<number>;
    markRead(id: number): Promise<void>;
    registerPushToken(input: PushTokenInput): Promise<void>;
    unregisterPushToken(token: string): Promise<void>;
  };
  realtime: {
    subscribe(topic: RealtimeTopic, cb: (e: RealtimeEvent) => void): Unsubscribe;
    /** Tell every subscriber to refetch (after reconnect, foreground, demo reset). */
    resync(): void;
  };
  demo: {
    /** rpc demo_reset (master or admin): the Demo Day start state, no pushes. */
    reset(): Promise<void>;
    settings(): Promise<Settings>;
    /** Masters may change demo_mode and demo_time_scale; admins every key. */
    updateSettings(patch: Partial<Settings>): Promise<Settings>;
  };
}

/** Async key value storage: AsyncStorage on mobile, a localStorage wrapper on the web, memory in tests. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type ApiMode = 'mock' | 'supabase';

export interface CreateApiOptions {
  mode: ApiMode;
  storage: KeyValueStorage;
  /** expo-crypto randomUUID on mobile (Hermes has no crypto.randomUUID), crypto.randomUUID on the web. */
  uuid: () => string;
  /** Required for 'supabase': a client created by the app with the publishable key. */
  client?: SupabaseClient;
  /** Clock override for tests. */
  now?: () => Date;
  /** MockApi only: latency, AI delay, watchdog and error injection (ignored in 'supabase' mode). */
  mock?: MockOptions;
}

/** Knobs of MockApi. Defaults suit the apps; tests pass latencyMs 0, aiDelayMs 0 and watchdog false. */
export interface MockOptions {
  /** Delay of every call in ms: a fixed value or a [min, max] range. Default [150, 300]. */
  latencyMs?: number | readonly [number, number];
  /** Delay between complete and the AI verdict. Default 2500; 0 runs the check inside the complete call. */
  aiDelayMs?: number;
  /** Run the watchdog every watchdogIntervalMs once the API is used. Default true; tests call MockApi.tick(). */
  watchdog?: boolean;
  /** Default 5000. */
  watchdogIntervalMs?: number;
  /** Share of calls (0..1) that fail with NETWORK, for trying error states by hand. Default 0. */
  errorRate?: number;
  /** Storage key prefix. Default 'rota.mock'. */
  storageKey?: string;
}

/** In memory KeyValueStorage for tests and SSR. */
export function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
    removeItem: async (key) => {
      map.delete(key);
    },
  };
}
