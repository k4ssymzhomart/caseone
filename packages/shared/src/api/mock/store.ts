// The MockApi store: every table of the database that the apps touch, as plain JSON (persisted through the
// injected KeyValueStorage), plus MockDb, the read models and the write path on top of it:
//   view()     = public.v_orders (names, board_column, is_overdue, status_since, last_reason, AI verdict)
//   commit()   = what internal.apply_action and create_order write after the checks: the order rows, the events,
//                material lines, review master fields, on_shift, equipment.is_stopped, photo links, notifications
//   notify()   = internal.notify with templates.ts, unique (recipient_id, dedupe_key)
// Directories that never change at runtime come from the fixtures; employees (on_shift), equipment (is_stopped)
// and settings live in the state.

import type { NotificationKind } from '../../domain/enums';
import {
  STAFF_ROLES,
  notificationDedupeKey,
  equipmentIsStopped,
  type ActionResult,
} from '../../domain/transitions';
import {
  renderOrderNotification,
  type NotificationVars,
  type OrderNotificationKind,
  type TemplateOrder,
} from '../../domain/templates';
import { boardColumn, isOverdue } from '../../domain/status';
import type {
  AiReview,
  AppNotification,
  Area,
  Brigade,
  Directories,
  Employee,
  Equipment,
  Material,
  Order,
  OrderEvent,
  OrderMaterial,
  OrderMaterialView,
  OrderPhoto,
  OrderView,
  Session,
  Settings,
  Timestamp,
  Uuid,
} from '../../domain/types';
import { demoState, fixtureDirectories } from '../../fixtures';
import type { Change } from './events';

/** Bump when the state shape changes: an older persisted state is reseeded. */
export const MOCK_STATE_VERSION = 1;

export interface MockPushToken {
  employee_id: Uuid;
  expo_token: string;
  platform: string | null;
  device_name: string | null;
  created_at: Timestamp;
  last_seen_at: Timestamp;
}

export const SEQ_NAMES = [
  'order',
  'number',
  'event',
  'photo',
  'material',
  'review',
  'notification',
] as const;
export type SeqName = (typeof SEQ_NAMES)[number];

export interface MockState {
  version: number;
  seeded_at: Timestamp;
  /** Orders up to this id are the history; demo_reset rebuilds everything after it. */
  history_max_order_id: number;
  settings: Settings;
  employees: Employee[];
  equipment: Equipment[];
  orders: Order[];
  events: OrderEvent[];
  photos: OrderPhoto[];
  /** storage_path → local uri for previews and photos.url (data: URIs are kept in memory only). */
  photo_uris: Record<string, string>;
  materials: OrderMaterial[];
  reviews: AiReview[];
  notifications: AppNotification[];
  push_tokens: MockPushToken[];
  /** Last used value of every identity and order_number_seq. */
  seq: Record<SeqName, number>;
}

/** Directories that never change at runtime. */
export type StaticDirectories = Omit<Directories, 'employees' | 'equipment' | 'settings'>;

export function staticDirectories(): StaticDirectories {
  const d = fixtureDirectories();
  return {
    areas: d.areas,
    brigades: d.brigades,
    fault_codes: d.fault_codes,
    materials: d.materials,
    work_norms: d.work_norms,
    equipment_type_specialty: d.equipment_type_specialty,
    problem_templates: d.problem_templates,
  };
}

export interface SeedOptions {
  uuid: () => Uuid;
  /** Settings to keep (demo_reset keeps them, except demo_time_scale back to 1). */
  settings?: Settings;
  /** Push tokens survive a reset, like the table in the database. */
  push_tokens?: MockPushToken[];
  /** Photo previews to keep (none of the seeded orders have photos). */
  photo_uris?: Record<string, string>;
}

const maxOf = (rows: readonly { id: number }[]): number =>
  rows.reduce((m, r) => Math.max(m, r.id), 0);

/** A fresh state: fixtures plus demoState(now), the Demo Day start state. */
export function seedState(now: Date, options: SeedOptions): MockState {
  const dirs = fixtureDirectories();
  const demo = demoState(now, { uuid: options.uuid });
  const onShift = new Set(demo.on_shift);
  const settings: Settings = { ...(options.settings ?? dirs.settings), demo_time_scale: 1 };
  return {
    version: MOCK_STATE_VERSION,
    seeded_at: now.toISOString(),
    history_max_order_id: demo.history_max_order_id,
    settings,
    employees: dirs.employees.map((e) => ({ ...e, on_shift: onShift.has(e.tab_no) })),
    equipment: dirs.equipment.map((e) => ({
      ...e,
      is_stopped: equipmentIsStopped(e.id, demo.orders),
    })),
    orders: demo.orders,
    events: demo.events,
    photos: [],
    photo_uris: {},
    materials: demo.materials,
    reviews: demo.reviews,
    notifications: [],
    push_tokens: options.push_tokens ?? [],
    seq: {
      order: maxOf(demo.orders),
      number: demo.orders.reduce((m, o) => Math.max(m, o.number), 100),
      event: maxOf(demo.events),
      photo: 0,
      material: maxOf(demo.materials),
      review: maxOf(demo.reviews),
      notification: 0,
    },
  };
}

/** JSON for the storage; data: URIs stay out (they can be megabytes and the uri is only a preview). */
export function serializeState(state: MockState): string {
  const uris: Record<string, string> = {};
  for (const [path, uri] of Object.entries(state.photo_uris)) {
    if (!uri.startsWith('data:')) uris[path] = uri;
  }
  return JSON.stringify({ ...state, photo_uris: uris });
}

/** The persisted state, or null when it is missing, unreadable or of another version. */
export function parseState(raw: string | null): MockState | null {
  if (raw == null) return null;
  try {
    const s = JSON.parse(raw) as Partial<MockState> | null;
    if (!s || s.version !== MOCK_STATE_VERSION) return null;
    if (
      !Array.isArray(s.orders) ||
      !Array.isArray(s.events) ||
      !Array.isArray(s.employees) ||
      !s.seq
    )
      return null;
    return {
      ...(s as MockState),
      photo_uris: s.photo_uris ?? {},
      photos: s.photos ?? [],
      notifications: s.notifications ?? [],
      push_tokens: s.push_tokens ?? [],
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// MockDb
// ---------------------------------------------------------------------------

/** What a commit changed: realtime row changes and the orders whose AI check should start. */
export interface CommitOutcome {
  changes: Change[];
  ai_verify: number[];
}

export function isStaff(session: Pick<Session, 'role'> | null | undefined): boolean {
  return session != null && (STAFF_ROLES as readonly string[]).includes(session.role);
}

const ms = (ts: string): number => Date.parse(ts);

export class MockDb {
  readonly state: MockState;
  readonly dirs: StaticDirectories;

  constructor(state: MockState, dirs: StaticDirectories) {
    this.state = state;
    this.dirs = dirs;
  }

  /** The next value of an identity or of order_number_seq (consumed). */
  next(seq: SeqName): number {
    this.state.seq[seq] += 1;
    return this.state.seq[seq];
  }

  /** The value next() would return, without consuming it. */
  peek(seq: SeqName): number {
    return this.state.seq[seq] + 1;
  }

  directories(): Directories {
    const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
    return {
      ...copy(this.dirs),
      employees: copy(this.state.employees),
      equipment: copy(this.state.equipment),
      settings: { ...this.state.settings },
    };
  }

  // lookups -----------------------------------------------------------------

  order(id: number): Order | undefined {
    return this.state.orders.find((o) => o.id === id);
  }

  employee(id: Uuid | null | undefined): Employee | undefined {
    return id == null ? undefined : this.state.employees.find((e) => e.id === id);
  }

  equipmentRow(id: number): Equipment | undefined {
    return this.state.equipment.find((e) => e.id === id);
  }

  area(id: number): Area | undefined {
    return this.dirs.areas.find((a) => a.id === id);
  }

  brigade(id: number | null | undefined): Brigade | undefined {
    return id == null ? undefined : this.dirs.brigades.find((b) => b.id === id);
  }

  material(id: number): Material | undefined {
    return this.dirs.materials.find((m) => m.id === id);
  }

  reviewFor(orderId: number, attempt: number): AiReview | undefined {
    return this.state.reviews.find((r) => r.order_id === orderId && r.attempt === attempt);
  }

  // visibility (RLS) ----------------------------------------------------------

  /** orders_read: staff see every order, a worker only own ones. */
  canSee(order: Pick<Order, 'assignee_id'>, session: Session | null): boolean {
    if (!session) return false;
    return isStaff(session) || order.assignee_id === session.user_id;
  }

  visibleOrders(session: Session | null): Order[] {
    return this.state.orders.filter((o) => this.canSee(o, session));
  }

  // read models ---------------------------------------------------------------

  /** v_orders rows for these orders (one pass over the events). */
  views(orders: readonly Order[], now: Date): OrderView[] {
    const ids = new Set(orders.map((o) => o.id));
    const since = new Map<number, string>();
    const reason = new Map<number, { at: string; id: number; reason: string | null }>();
    for (const e of this.state.events) {
      if (!ids.has(e.order_id)) continue;
      if (e.to_status !== e.from_status) {
        const prev = since.get(e.order_id);
        if (prev == null || ms(e.created_at) > ms(prev)) since.set(e.order_id, e.created_at);
      }
      if (e.action === 'reject' || e.action === 'pause') {
        const prev = reason.get(e.order_id);
        if (
          !prev ||
          ms(e.created_at) > ms(prev.at) ||
          (ms(e.created_at) === ms(prev.at) && e.id > prev.id)
        ) {
          reason.set(e.order_id, { at: e.created_at, id: e.id, reason: e.reason });
        }
      }
    }
    return orders.map((o) => {
      const eq = this.equipmentRow(o.equipment_id);
      const review =
        o.ai_review_id == null
          ? undefined
          : this.state.reviews.find((r) => r.id === o.ai_review_id);
      return {
        ...o,
        equipment_name: eq?.name ?? '',
        equipment_type: eq?.type ?? '',
        equipment_criticality: eq?.criticality ?? 'C',
        area_name: this.area(o.area_id)?.name ?? '',
        assignee_short_name: this.employee(o.assignee_id)?.short_name ?? '',
        master_short_name: this.employee(o.master_id)?.short_name ?? '',
        brigade_name: this.brigade(o.brigade_id)?.name ?? null,
        is_overdue: isOverdue(o, now),
        board_column: boardColumn(o, now),
        status_since: since.get(o.id) ?? null,
        last_reason: reason.get(o.id)?.reason ?? null,
        ai_verdict: review?.verdict ?? null,
        ai_score: review?.score ?? null,
        ai_needs_master_review: review?.needs_master_review ?? null,
      };
    });
  }

  view(order: Order, now: Date): OrderView {
    const [v] = this.views([order], now);
    if (!v) throw new Error('MockDb.view');
    return v;
  }

  orderEvents(orderId: number): OrderEvent[] {
    return this.state.events
      .filter((e) => e.order_id === orderId)
      .sort((a, b) => ms(a.created_at) - ms(b.created_at) || a.id - b.id);
  }

  orderMaterials(orderId: number): OrderMaterialView[] {
    return this.state.materials
      .filter((m) => m.order_id === orderId)
      .sort((a, b) => a.id - b.id)
      .map((m) => {
        const mat = this.material(m.material_id);
        return { ...m, material_name: mat?.name ?? '', unit: mat?.unit ?? '' };
      });
  }

  orderPhotos(order: Pick<Order, 'id' | 'client_ref'>): OrderPhoto[] {
    return this.state.photos
      .filter(
        (p) => p.order_id === order.id || (p.order_id == null && p.client_ref === order.client_ref),
      )
      .sort((a, b) => a.id - b.id);
  }

  /** The names internal.notify joins to an order. */
  templateOrder(order: Order): TemplateOrder {
    const eq = this.equipmentRow(order.equipment_id);
    return {
      id: order.id,
      number: order.number,
      priority: order.priority,
      status: order.status,
      due_at: order.due_at,
      last_comment: order.last_comment,
      equipment_name: eq?.name ?? null,
      area_name: eq ? (this.area(eq.area_id)?.name ?? null) : null,
      assignee_short_name: this.employee(order.assignee_id)?.short_name ?? null,
    };
  }

  // writes --------------------------------------------------------------------

  /** internal.notify: render, then insert unless (recipient, dedupe_key) exists. Returns the new row or null. */
  notify(
    recipientId: Uuid | null | undefined,
    order: Order,
    kind: NotificationKind,
    dedupeKey: string,
    vars: NotificationVars,
    now: Date,
  ): AppNotification | null {
    if (recipientId == null || kind === 'weekly_digest') return null;
    if (
      this.state.notifications.some(
        (n) => n.recipient_id === recipientId && n.dedupe_key === dedupeKey,
      )
    ) {
      return null;
    }
    const r = renderOrderNotification(
      kind as OrderNotificationKind,
      this.templateOrder(order),
      vars,
    );
    const row: AppNotification = {
      id: this.next('notification'),
      recipient_id: recipientId,
      order_id: order.id,
      kind: r.kind,
      severity: r.severity,
      title: r.title,
      body: r.body,
      url: r.url,
      dedupe_key: dedupeKey,
      created_at: now.toISOString(),
      read_at: null,
      push_sent_at: null,
      tg_sent_at: null,
    };
    this.state.notifications.push(row);
    return row;
  }

  private upsertOrder(order: Order): 'INSERT' | 'UPDATE' {
    const i = this.state.orders.findIndex((o) => o.id === order.id);
    if (i < 0) {
      this.state.orders.push(order);
      return 'INSERT';
    }
    this.state.orders[i] = order;
    return 'UPDATE';
  }

  /** Writes an applyAction / applyCreate result: rows, events, side effects, then the notifications. */
  commit(result: ActionResult, now: Date): CommitOutcome {
    const out: CommitOutcome = { changes: [], ai_verify: [] };
    if (result.replayed) return out;

    const eventIds = result.events.map((e) => {
      const id = this.next('event');
      this.state.events.push({ ...e, id });
      return id;
    });
    const mainEventId = eventIds[result.main_event] ?? eventIds[eventIds.length - 1] ?? 0;

    const notes: Extract<ActionResult['sideEffects'][number], { type: 'notify' }>[] = [];
    for (const fx of result.sideEffects) {
      switch (fx.type) {
        case 'update_order':
          out.changes.push({ topic: 'orders', type: this.upsertOrder(fx.order), row: fx.order });
          break;
        case 'replace_materials':
          this.state.materials = this.state.materials.filter((m) => m.order_id !== fx.order_id);
          for (const line of fx.lines) {
            this.state.materials.push({
              id: this.next('material'),
              order_id: fx.order_id,
              ...line,
            });
          }
          break;
        case 'update_review': {
          const r = this.state.reviews.find((x) => x.id === fx.review_id);
          if (r) Object.assign(r, fx.patch);
          break;
        }
        case 'set_on_shift': {
          const e = this.employee(fx.employee_id);
          if (e && e.on_shift !== fx.on_shift) {
            e.on_shift = fx.on_shift;
            out.changes.push({ topic: 'workers', type: 'UPDATE', row: { ...e } });
          }
          break;
        }
        case 'equipment_stopped': {
          const eq = this.equipmentRow(fx.equipment_id);
          if (eq) eq.is_stopped = fx.is_stopped;
          break;
        }
        case 'attach_photos':
          for (const p of this.state.photos) {
            if (p.client_ref === fx.client_ref && p.order_id == null) p.order_id = fx.order_id;
          }
          break;
        case 'notify':
          notes.push(fx);
          break;
        case 'ai_verify':
          out.ai_verify.push(fx.order_id);
          break;
      }
    }
    out.changes.unshift({
      topic: 'orders',
      type: this.upsertOrder(result.order),
      row: result.order,
    });

    // internal.notify reads the order after the action (the SQL refetches it)
    for (const n of notes) {
      const order = this.order(n.order_id);
      if (!order) continue;
      const row = this.notify(
        n.recipient_id,
        order,
        n.kind,
        notificationDedupeKey(mainEventId, n.key),
        n.vars,
        now,
      );
      if (row) out.changes.push({ topic: 'notifications', type: 'INSERT', row });
    }
    return out;
  }

  /** internal.refresh_equipment for every unit (after a reset or a reload). */
  refreshEquipment(): void {
    for (const eq of this.state.equipment)
      eq.is_stopped = equipmentIsStopped(eq.id, this.state.orders);
  }
}
