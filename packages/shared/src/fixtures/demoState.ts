// The Demo Day start state (CLAUDE.md §20) relative to `now`, plus a short history for lists, ratings and the
// analytics cards. The active and closed demo orders mirror internal.demo_reset() and internal.demo_order() of
// supabase/migrations/20261008100007_rota_seed_tools.sql row for row; the history is a 7 day stand in for the
// 92 day internal.generate_history() (closed orders only, deterministic, ending yesterday like the SQL) with small
// versions of the planted patterns: Конвейер К-3 bearing failures, Сериков's repeat failures, Бригада 1 Литол-24.
// Pure data: ids start at 1, numbers at 101; MockApi continues both after the last demo order.

import type {
  OrderType,
  PauseReason,
  Priority,
  RejectReason,
  Status,
  Verdict,
} from '../domain/enums';
import type {
  AiCheck,
  AiReview,
  MaterialLine,
  Order,
  OrderEvent,
  OrderMaterial,
  Uuid,
} from '../domain/types';
import { repeatOfOrderId } from '../domain/transitions';
import { employees } from './employees';
import { equipment } from './equipment';
import { faultCodes } from './faultCodes';
import { problemTemplates } from './problemTemplates';
import { workNorms } from './workNorms';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const OFFSET_MS = 5 * HOUR; // Asia/Qostanay, UTC+5 all year

/** Who is on shift after the reset: master Жумабаев and 9 workers (Литвиненко and бригада 3 are off). */
export const DEMO_ON_SHIFT: readonly string[] = [
  '1001',
  '2001',
  '2002',
  '2003',
  '2005',
  '2006',
  '2007',
  '2008',
  '2009',
  '2010',
];

/** The demo pump of the script (step 2): «Насос НШ-32 маслостанции». */
export const DEMO_PUMP_EQUIPMENT_ID = 20;
/** The К-2 bearing order of Иванов closed in step 7. */
export const DEMO_K2_EQUIPMENT_ID = 12;

export interface DemoState {
  orders: Order[];
  events: OrderEvent[];
  materials: OrderMaterial[];
  reviews: AiReview[];
  /** Tab numbers on shift. */
  on_shift: string[];
  /** Highest order id of the history part; demo orders and everything created later come after it. */
  history_max_order_id: number;
}

export interface DemoStateOptions {
  /** client_ref generator (the store passes the injected uuid); default: deterministic from the seed. */
  uuid?: () => Uuid;
  /** Days of history before today, ending yesterday (default 7). */
  historyDays?: number;
  /** PRNG seed of the history (default 2026). */
  seed?: number;
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

/** mulberry32: a tiny deterministic PRNG, 0 ≤ x < 1. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomUuid(rnd: () => number): string {
  const hex = (n: number): string => {
    let s = '';
    for (let i = 0; i < n; i += 1) s += Math.floor(rnd() * 16).toString(16);
    return s;
  };
  const variant = (8 + Math.floor(rnd() * 4)).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** UTC ms of local midnight of the day that contains `ms`. */
function localMidnight(ms: number): number {
  return Math.floor((ms + OFFSET_MS) / DAY) * DAY - OFFSET_MS;
}

function employeeId(tab: string): Uuid {
  const e = employees.find((x) => x.tab_no === tab);
  if (!e) throw new Error(`demoState: no employee ${tab}`);
  return e.id;
}

function normOf(code: string): number | null {
  return workNorms.find((n) => n.fault_code === code)?.norm_hours ?? null;
}

function equipmentRow(id: number): (typeof equipment)[number] {
  const eq = equipment.find((e) => e.id === id);
  if (!eq) throw new Error(`demoState: no equipment ${id}`);
  return eq;
}

/** The first two typical material lines of a code at their usual quantity (like the SQL seed). */
function typicalLines(
  code: string,
  factor = 1,
  materialFactor?: Readonly<Record<number, number>>,
): MaterialLine[] {
  const typical = workNorms.find((n) => n.fault_code === code)?.typical ?? [];
  return typical.slice(0, 2).map((t) => ({
    material_id: t.material_id,
    qty: Math.round(t.qty * factor * (materialFactor?.[t.material_id] ?? 1) * 100) / 100,
  }));
}

/** internal.works_text: the works description the seed writes for a code. */
export function worksText(code: string): string {
  const texts: Readonly<Record<string, string>> = {
    'М-01': 'Заменил футеровку, затянул крепёж, проверил на холостом ходу',
    'М-02': 'Заменил подшипник, заложил смазку, проверил нагрев и шум',
    'М-03': 'Вырезал повреждённый участок ленты, сделал стыковку, отрегулировал натяжение',
    'М-04': 'Отцентровал привод, заменил упругие элементы муфты, вибрация в норме',
    'М-05': 'Вскрыл редуктор, заменил шестерню и манжеты, залил масло',
    'М-06': 'Заварил трещину, подтянул крепёж, проверил соединения',
    'М-07': 'Заменил изношенные ролики, проверил ход ленты',
    'Э-01': 'Заменил электродвигатель, проверил изоляцию и ток',
    'Э-02': 'Заменил повреждённый участок кабеля, проверил изоляцию',
    'Э-03': 'Заменил пускатель и автомат, проверил пуск',
    'Э-04': 'Заменил датчик, отрегулировал срабатывание',
    'Э-05': 'Нашёл причину срабатывания защиты, заменил предохранители, проверил нагрузку',
    'Э-06': 'Заменил лампы и автомат в щите освещения',
    'Г-01': 'Заменил уплотнительное кольцо и РВД, долил масло, течи нет',
    'Г-02': 'Заменил гидронасос, фильтр и уплотнения, давление в норме',
    'Г-03': 'Заменил манжеты гидроцилиндра, проверил ход штока',
    'П-01': 'Заменил фитинги и участок шланга, утечки нет',
    'П-02': 'Заменил пневмораспределитель, проверил срабатывание',
    'С-01': 'Смазал узлы по карте смазки',
    'С-02': 'Слил масло, заменил фильтр, залил свежее масло',
  };
  return texts[code] ?? 'Работы выполнены';
}

/** internal.planned_label: the description of a planned (ППР) order. */
export function plannedLabel(code: string): string {
  const labels: Readonly<Record<string, string>> = {
    'М-01': 'замена футеровки',
    'М-04': 'центровка привода',
    'М-05': 'ревизия редуктора',
    'М-06': 'осмотр и подтяжка крепежа',
    'М-07': 'замена роликов',
    'С-01': 'плановая смазка',
    'С-02': 'замена масла',
    'Г-01': 'замена РВД и уплотнений',
    'Э-04': 'проверка датчиков и концевиков',
    'Э-06': 'проверка освещения и щита',
    'П-01': 'проверка пневмосистемы',
    'П-02': 'ревизия пневмоклапанов',
  };
  return `ППР: ${labels[code] ?? 'плановое обслуживание'}`;
}

/** internal.problem_label: the problem chip of the type for the code, else the fault code name. */
export function problemLabel(type: string, code: string): string {
  const chip = problemTemplates
    .filter((t) => t.equipment_type === type && t.suggested_fault_code === code)
    .sort((a, b) => a.sort - b.sort)[0];
  return chip?.label ?? faultCodes.find((f) => f.code === code)?.name ?? code;
}

/** internal.seed_checks: an R1..L2 breakdown whose points add up to the score (seeded reviews). */
export function seedChecks(score: number): AiCheck[] {
  let d = Math.max(0, Math.min(100, 100 - Math.round(score)));
  let l2 = 15 - Math.min(d, 10);
  d -= 15 - l2;
  const l1 = 20 - Math.min(d, 10);
  d -= 20 - l1;
  const r3 = 15 - Math.min(d, 5);
  d -= 15 - r3;
  const r1 = 20 - Math.min(d, 5);
  d -= 20 - r1;
  l2 = Math.max(0, l2 - d);
  let r4 = 20;
  const sum = r1 + 10 + r3 + r4 + l1 + l2;
  if (sum > score) r4 = Math.max(0, r4 - (sum - score));
  return [
    {
      id: 'R1',
      title: 'Полнота отчёта',
      status: r1 === 20 ? 'pass' : 'warn',
      points: r1,
      max: 20,
      message_ru:
        r1 === 20 ? 'отчёт заполнен, шифр и материалы указаны' : 'описание работ короткое',
    },
    {
      id: 'R2',
      title: 'Подлинность фото',
      status: 'pass',
      points: 10,
      max: 10,
      message_ru: 'фото сделано камерой во время работ',
    },
    {
      id: 'R3',
      title: 'Материалы',
      status: r3 === 15 ? 'pass' : 'warn',
      points: r3,
      max: 15,
      message_ru: r3 === 15 ? 'материалы в пределах нормы' : 'расход выше обычного',
    },
    {
      id: 'R4',
      title: 'Время и срок',
      status: r4 === 20 ? 'pass' : 'warn',
      points: r4,
      max: 20,
      message_ru: r4 === 20 ? 'время в пределах норматива' : 'работа заняла больше норматива',
    },
    {
      id: 'L1',
      title: 'Работы и шифр',
      status: l1 === 20 ? 'pass' : 'warn',
      points: l1,
      max: 20,
      message_ru: l1 === 20 ? 'работы соответствуют неисправности' : 'описание работ неполное',
    },
    {
      id: 'L2',
      title: 'Фото после',
      status: l2 >= 12 ? 'pass' : 'warn',
      points: l2,
      max: 15,
      message_ru:
        l2 >= 12
          ? 'неисправность устранена, рабочее место убрано'
          : 'на фото после видны замечания',
    },
  ];
}

/** The failing breakdown of a first attempt sent to rework (history). */
function reworkChecks(score: number): AiCheck[] {
  return [
    {
      id: 'R1',
      title: 'Полнота отчёта',
      status: 'pass',
      points: 20,
      max: 20,
      message_ru: 'отчёт заполнен',
    },
    {
      id: 'R2',
      title: 'Подлинность фото',
      status: 'pass',
      points: 10,
      max: 10,
      message_ru: 'фото сделаны во время работ',
    },
    {
      id: 'R3',
      title: 'Материалы',
      status: 'warn',
      points: Math.max(0, Math.min(15, score - 50)),
      max: 15,
      message_ru: 'расход материалов выше обычного',
    },
    {
      id: 'R4',
      title: 'Время и срок',
      status: 'pass',
      points: 20,
      max: 20,
      message_ru: 'время в пределах норматива',
    },
    {
      id: 'L1',
      title: 'Работы и шифр',
      status: 'fail',
      points: 0,
      max: 20,
      message_ru: 'работы не устраняют заявленную неисправность',
    },
    {
      id: 'L2',
      title: 'Фото после',
      status: 'fail',
      points: 0,
      max: 15,
      message_ru: 'на фото после неисправность видна',
    },
  ];
}

const verdictOf = (score: number): Verdict => (score >= 80 ? 'accepted' : 'accepted_with_remarks');
const score5Of = (score: number): number => Math.max(1, Math.min(5, Math.round(score / 20)));

// ---------------------------------------------------------------------------
// the row builder
// ---------------------------------------------------------------------------

class Rows {
  readonly orders: Order[] = [];
  readonly events: OrderEvent[] = [];
  readonly materials: OrderMaterial[] = [];
  readonly reviews: AiReview[] = [];
  private nextNumber = 101;
  private readonly uuid: () => Uuid;

  constructor(uuid: () => Uuid) {
    this.uuid = uuid;
  }

  order(
    fields: Partial<Order> &
      Pick<
        Order,
        | 'type'
        | 'priority'
        | 'description'
        | 'equipment_id'
        | 'assignee_id'
        | 'master_id'
        | 'status'
        | 'due_at'
        | 'created_at'
      >,
  ): Order {
    const eq = equipmentRow(fields.equipment_id);
    const o: Order = {
      id: this.orders.length + 1,
      number: this.nextNumber,
      client_ref: this.uuid(),
      comment: null,
      area_id: eq.area_id,
      brigade_id: null,
      norm_hours: null,
      equipment_stopped: false,
      suggested_fault_code: null,
      queue_position: null,
      works_done: null,
      fault_code: null,
      closing_comment: null,
      issued_at: fields.created_at,
      accepted_at: null,
      queued_at: null,
      rejected_at: null,
      started_at: null,
      done_at: null,
      closed_at: null,
      cancelled_at: null,
      paused_since: null,
      paused_total_sec: 0,
      last_comment: null,
      rework_count: 0,
      ai_review_id: null,
      final_verdict: null,
      final_score: null,
      repeat_of_order_id: null,
      is_demo: false,
      ...fields,
    };
    this.nextNumber += 1;
    this.orders.push(o);
    return o;
  }

  event(
    order: Order,
    actorId: Uuid | null,
    action: OrderEvent['action'],
    from: Status | null,
    to: Status | null,
    at: number | string,
    extra: Partial<Pick<OrderEvent, 'reason' | 'comment' | 'payload'>> = {},
  ): OrderEvent {
    const e: OrderEvent = {
      id: this.events.length + 1,
      order_id: order.id,
      actor_id: actorId,
      action,
      from_status: from,
      to_status: to,
      reason: extra.reason ?? null,
      comment: extra.comment ?? null,
      payload: extra.payload ?? {},
      client_action_id: null,
      created_at: typeof at === 'string' ? at : iso(at),
    };
    this.events.push(e);
    return e;
  }

  lines(order: Order, lines: readonly MaterialLine[]): void {
    for (const l of lines) {
      if (l.qty <= 0) continue;
      this.materials.push({
        id: this.materials.length + 1,
        order_id: order.id,
        material_id: l.material_id,
        qty: l.qty,
      });
    }
  }

  review(fields: Omit<AiReview, 'id'>): AiReview {
    const r: AiReview = { id: this.reviews.length + 1, ...fields };
    this.reviews.push(r);
    return r;
  }

  replace(order: Order): Order {
    const i = this.orders.findIndex((o) => o.id === order.id);
    this.orders[i] = order;
    return order;
  }
}

// ---------------------------------------------------------------------------
// history: closed orders of the last days (a small generate_history)
// ---------------------------------------------------------------------------

interface ClosedSpec {
  created: number;
  type: OrderType;
  priority: Priority;
  equipment_id: number;
  code: string;
  description: string;
  tab: string;
  master_tab: string;
  stopped: boolean;
  reaction_min: number;
  start_gap_min: number;
  work_min: number;
  late: boolean;
  slack_min: number;
  score: number;
  override: number | null;
  close_gap_min: number;
  materials: MaterialLine[];
  pause: { after_min: number; minutes: number; reason: PauseReason; comment: string } | null;
  rework: { score1: number; gap_min: number; fix_min: number } | null;
  reject: { tab: string; reason: RejectReason; comment: string | null; after_min: number } | null;
  brigade_id?: number | null;
}

/** Planned codes per equipment type for the history (ППР, inspections, lubrication). */
const PLANNED_CODES: Readonly<Record<string, readonly string[]>> = {
  конвейер: ['М-07', 'М-04', 'С-01'],
  дробилка: ['М-01', 'М-04', 'С-02'],
  грохот: ['М-06', 'М-04', 'С-01'],
  экскаватор: ['С-02', 'Г-01', 'Э-06'],
  'буровой станок': ['С-01', 'П-01', 'Г-01'],
  насос: ['С-02', 'М-04', 'Г-01'],
  компрессор: ['С-02', 'П-01'],
  'сушильный барабан': ['М-01', 'С-01', 'М-04'],
  вентилятор: ['М-04', 'С-01'],
  циклон: ['М-06'],
  фильтр: ['П-01', 'П-02'],
  'упаковочная машина': ['Э-04', 'П-02'],
  кран: ['С-01', 'Э-04'],
  погрузчик: ['С-02', 'Г-01'],
};

/** Mean final score per worker (the quality profile of generate_history); Сериков is the weak one. */
const QUALITY: Readonly<Record<string, number>> = {
  '2007': 90,
  '2001': 88,
  '2003': 87,
  '2011': 86,
  '2009': 86,
  '2004': 85,
  '2002': 83,
  '2012': 82,
  '2008': 82,
  '2013': 81,
  '2014': 80,
  '2005': 79,
  '2015': 78,
  '2010': 77,
  '2006': 69,
};

/** Смазка Литол-24. */
const LITOL = 18;

const GRADE_SPEED: Readonly<Record<number, number>> = { 6: 0.85, 5: 0.92, 4: 1, 3: 1.1 };

function pick<T>(rnd: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rnd() * items.length)] ?? items[0];
  if (item === undefined) throw new Error('demoState: empty pick');
  return item;
}

/** Box–Muller standard normal. */
function normal(rnd: () => number): number {
  const u = Math.max(rnd(), 1e-9);
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const exponential = (rnd: () => number, mean: number): number =>
  -Math.log(Math.max(1 - rnd(), 1e-9)) * mean;

function workersFor(specialty: string): string[] {
  return employees
    .filter((e) => e.role === 'worker' && e.specialty === specialty)
    .map((e) => e.tab_no);
}

function specFor(
  rnd: () => number,
  created: number,
  fields: Pick<ClosedSpec, 'type' | 'priority' | 'equipment_id' | 'code' | 'description' | 'tab'> &
    Partial<ClosedSpec>,
): ClosedSpec {
  const norm = normOf(fields.code) ?? 1;
  const grade = employees.find((e) => e.tab_no === fields.tab)?.grade ?? 4;
  const slow = fields.tab === '2006' ? 1.4 : 1;
  const quality = QUALITY[fields.tab] ?? 80;
  const night = (() => {
    const h = ((created + OFFSET_MS) % DAY) / HOUR;
    return h < 8 || h >= 20;
  })();
  const work = norm * 60 * Math.exp(0.35 * normal(rnd)) * (GRADE_SPEED[grade] ?? 1) * slow;
  const pauseP = rnd();
  const reworkP = rnd();
  const lateP = rnd();
  const overrideP = rnd();
  const rejectP = rnd();
  const score = Math.round(Math.max(55, Math.min(98, quality + 5 * normal(rnd))));
  // P5: Бригада 1 lays on Литол-24 at about 2.4 times the С-01 norm
  const lubricationOveruse =
    fields.code === 'С-01' && employees.find((e) => e.tab_no === fields.tab)?.brigade_id === 1;
  // a first refusal (about 6%): another worker of the specialty rejects, the master reassigns
  let reject: ClosedSpec['reject'] = null;
  if (rejectP < 0.06) {
    const specialty = faultCodes.find((f) => f.code === fields.code)?.specialty ?? 'слесарь';
    const others = workersFor(specialty).filter((t) => t !== fields.tab);
    if (others.length > 0) {
      const reason = pick<RejectReason>(rnd, [
        'no_permit',
        'busy_emergency',
        'no_materials',
        'other',
      ]);
      reject = {
        tab: pick(rnd, others),
        reason,
        comment: reason === 'other' ? 'Нет ключа от щитовой' : null,
        after_min: 2 + rnd() * 6,
      };
    }
  }
  const spec: ClosedSpec = {
    created,
    master_tab: night ? '1002' : '1001',
    stopped:
      fields.type === 'unplanned' &&
      (fields.priority === 'emergency' || fields.priority === 'high'),
    reaction_min: Math.max(1, exponential(rnd, fields.priority === 'emergency' ? 2 : 6)),
    start_gap_min: 2 + rnd() * 8,
    work_min: Math.max(10, work),
    late: lateP < 0.11,
    slack_min: 10 + rnd() * 50,
    score,
    override: overrideP < 0.08 ? Math.max(40, Math.min(100, score + (rnd() < 0.5 ? -8 : 6))) : null,
    close_gap_min: 10 + rnd() * 80,
    materials: lubricationOveruse
      ? [{ material_id: LITOL, qty: 1.9 }]
      : typicalLines(fields.code, rnd() < 0.15 ? 1.5 : 1),
    pause:
      pauseP < 0.13
        ? {
            after_min: 10 + rnd() * 30,
            minutes: 30 + rnd() * 210,
            reason: rnd() < 0.6 ? 'waiting_parts' : 'waiting_stop',
            comment: rnd() < 0.6 ? 'ждём запчасти со склада' : 'ждём остановки линии',
          }
        : null,
    rework:
      reworkP < (fields.tab === '2006' ? 0.3 : 0.065)
        ? {
            score1: 40 + Math.floor(rnd() * 15),
            gap_min: 20 + rnd() * 60,
            fix_min: 20 + rnd() * 40,
          }
        : null,
    reject,
    ...fields,
  };
  return spec;
}

function buildClosed(rows: Rows, s: ClosedSpec, isDemo = false): Order {
  const master = employeeId(s.master_tab);
  const worker = employeeId(s.tab);
  const norm = normOf(s.code);
  let issued = s.created;
  const firstAssignee = s.reject ? employeeId(s.reject.tab) : worker;
  const brigade = s.brigade_id ?? null;

  // the deadline is set at creation; the late ones are moved before done below
  let order = rows.order({
    type: s.type,
    priority: s.priority,
    description: s.description,
    equipment_id: s.equipment_id,
    assignee_id: worker,
    brigade_id: brigade,
    master_id: master,
    status: 'closed',
    due_at: iso(s.created),
    norm_hours: norm,
    equipment_stopped: s.stopped,
    suggested_fault_code: s.code,
    created_at: iso(s.created),
    is_demo: isDemo,
  });

  const createEvent = rows.event(order, master, 'create', null, 'issued', s.created, {
    payload: {
      assignee_id: firstAssignee,
      brigade_id: brigade,
      priority: s.priority,
      type: s.type,
      due_at: null,
      equipment_stopped: s.stopped,
    },
  });
  let lastComment: string | null = null;
  if (s.reject) {
    const rejectAt = s.created + s.reject.after_min * MIN;
    rows.event(order, firstAssignee, 'reject', 'issued', 'rejected', rejectAt, {
      reason: s.reject.reason,
      comment: s.reject.comment,
    });
    issued = rejectAt + 2 * MIN;
    rows.event(order, master, 'reassign', 'rejected', 'issued', issued, {
      payload: { from_assignee_id: firstAssignee, to_assignee_id: worker, brigade_id: brigade },
    });
    if (s.reject.comment) lastComment = s.reject.comment;
  }
  const accepted = issued + s.reaction_min * MIN;
  const started = accepted + s.start_gap_min * MIN;
  rows.event(order, worker, 'accept', 'issued', 'accepted', accepted);
  rows.event(order, worker, 'start', 'accepted', 'in_progress', started);

  let t = started;
  let pausedSec = 0;
  if (s.pause) {
    const pauseAt = started + s.pause.after_min * MIN;
    const resumeAt = pauseAt + s.pause.minutes * MIN;
    rows.event(order, worker, 'pause', 'in_progress', 'paused', pauseAt, {
      reason: s.pause.reason,
      comment: s.pause.comment,
    });
    rows.event(order, worker, 'resume', 'paused', 'in_progress', resumeAt);
    pausedSec += Math.round(s.pause.minutes * 60);
    lastComment = s.pause.comment;
  }
  t = started + s.work_min * MIN + pausedSec * 1000;

  if (s.rework) {
    const done1 = t;
    const review1At = done1 + 20_000;
    rows.event(order, worker, 'complete', 'in_progress', 'done', done1, {
      payload: { fault_code: s.code },
    });
    rows.event(order, null, 'review_started', 'done', 'ai_review', done1, {
      payload: { attempt: 1 },
    });
    const r1 = rows.review({
      order_id: order.id,
      attempt: 1,
      verdict: 'rework',
      score: s.rework.score1,
      score5: score5Of(s.rework.score1),
      confidence: 0.84,
      needs_master_review: false,
      checks: reworkChecks(s.rework.score1),
      photo: null,
      feedback_worker: {
        good: ['Отчёт заполнен'],
        improve: ['Устраните причину, а не только следствие'],
      },
      report_master: {
        summary: 'Работы не устраняют неисправность, наряд возвращён на доработку',
        suggested_code: null,
        materials_logic: null,
        work_match: null,
      },
      model: 'seed',
      latency_ms: 9000,
      created_at: iso(review1At),
      master_verdict: null,
      master_score: null,
      master_comment: null,
      master_id: null,
      master_decided_at: null,
    });
    rows.event(order, null, 'ai_result', 'ai_review', 'rework', review1At, {
      payload: {
        review_id: r1.id,
        verdict: 'rework',
        score: s.rework.score1,
        needs_master_review: false,
      },
    });
    const restart = done1 + s.rework.gap_min * MIN;
    rows.event(order, worker, 'resume_rework', 'rework', 'in_progress', restart);
    pausedSec += Math.round((restart - done1) / 1000);
    t = restart + s.rework.fix_min * MIN;
  }

  const done = t;
  const window = s.type === 'planned' ? 24 * HOUR : Math.max((norm ?? 1) * 1.6 * HOUR, 2 * HOUR);
  const due = s.late
    ? done - s.slack_min * MIN
    : Math.max(s.created + window, done + s.slack_min * MIN);
  const reviewAt = done + 20_000;
  const closed = done + s.close_gap_min * MIN;
  const attempt = s.rework ? 2 : 1;
  const aiScore = s.late ? Math.max(40, s.score - 5) : s.score;
  const finalScore = s.override ?? aiScore;
  const aiVerdict = verdictOf(aiScore);
  const finalVerdict: Verdict =
    finalScore >= 80 ? 'accepted' : finalScore >= 60 ? 'accepted_with_remarks' : 'rework';
  const checks = seedChecks(aiScore);
  if (s.late) {
    const r4 = checks.find((c) => c.id === 'R4');
    if (r4) r4.message_ru = `срок нарушен на ${Math.ceil((done - due) / MIN)} мин`;
  }

  rows.event(order, worker, 'complete', 'in_progress', 'done', done, {
    payload: {
      works_done: worksText(s.code),
      fault_code: s.code,
      materials: s.materials,
      no_materials: false,
    },
  });
  rows.event(order, null, 'review_started', 'done', 'ai_review', done, { payload: { attempt } });
  const review = rows.review({
    order_id: order.id,
    attempt,
    verdict: aiVerdict,
    score: aiScore,
    score5: score5Of(aiScore),
    confidence: 0.86,
    needs_master_review: false,
    checks,
    photo: null,
    feedback_worker: {
      good: ['Работа выполнена', 'Отчёт заполнен полностью'],
      improve: aiScore >= 85 ? [] : ['Подробнее описывайте выполненные работы'],
    },
    report_master: {
      summary:
        aiVerdict === 'accepted'
          ? 'Неисправность устранена, замечаний нет'
          : 'Работа выполнена с замечаниями',
      suggested_code: null,
      materials_logic: null,
      work_match: null,
    },
    model: 'seed',
    latency_ms: 9000,
    created_at: iso(reviewAt),
    master_verdict: finalVerdict,
    master_score: finalScore,
    master_comment: s.override != null ? 'Оценка скорректирована мастером' : null,
    master_id: master,
    master_decided_at: iso(closed),
  });
  rows.event(order, null, 'ai_result', 'ai_review', 'ai_review', reviewAt, {
    payload: {
      review_id: review.id,
      verdict: aiVerdict,
      score: aiScore,
      needs_master_review: false,
    },
  });
  rows.event(order, master, 'close', 'ai_review', 'closed', closed, {
    payload: {
      final_verdict: finalVerdict,
      final_score: finalScore,
      ai_verdict: aiVerdict,
      ai_score: aiScore,
      changed: s.override != null,
    },
  });
  if (s.reject && s.reject.reason !== 'other') {
    const rejectEvent = rows.events.find((e) => e.order_id === order.id && e.action === 'reject');
    if (rejectEvent) {
      rows.event(order, master, 'mark_reject_justified', 'closed', 'closed', closed + MIN, {
        payload: { justified: true, reject_event_id: rejectEvent.id },
      });
    }
  }
  createEvent.payload = { ...createEvent.payload, due_at: iso(due) };
  rows.lines(order, s.materials);

  order = rows.replace({
    ...order,
    issued_at: iso(issued),
    due_at: iso(due),
    accepted_at: iso(accepted),
    started_at: iso(started),
    done_at: iso(done),
    closed_at: iso(closed),
    paused_total_sec: pausedSec,
    works_done: worksText(s.code),
    fault_code: s.code,
    last_comment: lastComment,
    rework_count: s.rework ? 1 : 0,
    ai_review_id: review.id,
    final_verdict: finalVerdict,
    final_score: finalScore,
  });
  return order;
}

/** orders_before_insert on every unplanned order: the repeat failure link (repeatOfOrderId of the state machine). */
function linkRepeats(orders: Order[]): void {
  for (const o of orders) {
    o.repeat_of_order_id = repeatOfOrderId(
      o,
      orders.filter((x) => x.id !== o.id),
    );
  }
}

function historySpecs(rnd: () => number, today0: number, days: number): ClosedSpec[] {
  const specs: ClosedSpec[] = [];
  const at = (daysAgo: number, hour: number): number => today0 - daysAgo * DAY + hour * HOUR;

  // random fill: four or five orders a day, about 60% planned (plus the planted rows below: about 40 in all)
  for (let d = days; d >= 1; d -= 1) {
    const count = 4 + (rnd() < 0.35 ? 1 : 0);
    for (let i = 0; i < count; i += 1) {
      const night = rnd() < 0.3;
      const hour = night
        ? rnd() < 0.5
          ? 20 + rnd() * 3.8
          : 0.2 + rnd() * 7.5
        : 8.2 + rnd() * 11.5;
      const eq = pick(rnd, equipment);
      const planned = rnd() < 0.6;
      let code: string;
      let description: string;
      let priority: Priority;
      if (planned) {
        code = pick(rnd, PLANNED_CODES[eq.type] ?? ['С-01']);
        description = plannedLabel(code);
        priority = 'planned';
      } else {
        const chips = problemTemplates.filter(
          (t) => t.equipment_type === eq.type && t.suggested_fault_code != null,
        );
        const chip = pick(rnd, chips);
        code = chip.suggested_fault_code ?? 'М-04';
        description = chip.label;
        const p = rnd();
        priority = p < 0.1 ? 'emergency' : p < 0.4 ? 'high' : 'normal';
      }
      const specialty = faultCodes.find((f) => f.code === code)?.specialty ?? 'слесарь';
      const tab = pick(rnd, workersFor(specialty));
      specs.push(
        specFor(rnd, at(d, hour), {
          type: planned ? 'planned' : 'unplanned',
          priority,
          equipment_id: eq.id,
          code,
          description,
          tab,
        }),
      );
    }
  }

  // P1: Конвейер К-3 keeps losing its bearing (М-02)
  for (const [daysAgo, hour, tab] of [
    [6, 9.5, '2007'],
    [5, 14.2, '2002'],
    [3, 10.8, '2011'],
    [1, 15.4, '2001'],
  ] as const) {
    if (daysAgo > days) continue;
    specs.push(
      specFor(rnd, at(daysAgo, hour), {
        type: 'unplanned',
        priority: 'high',
        equipment_id: 13,
        code: 'М-02',
        description: 'Шум подшипника',
        tab,
        rework: null,
        reject: null,
      }),
    );
  }

  // P2: Сериков's repairs fail again on the same unit within days
  for (const [daysAgo, hour, eq, code, desc, tab, extra] of [
    [7, 13.0, 10, 'М-04', 'Сильная вибрация', '2006', { score: 67 }],
    [5, 9.8, 10, 'М-04', 'Сильная вибрация', '2012', {}],
    [6, 10.1, 17, 'М-04', 'Сильная вибрация', '2006', { score: 64 }],
    [4, 11.3, 17, 'М-04', 'Сильная вибрация', '2002', {}],
    [
      5,
      13.6,
      14,
      'М-02',
      'Шум подшипника',
      '2006',
      { score: 66, rework: { score1: 48, gap_min: 35, fix_min: 30 } },
    ],
    [2, 9.2, 14, 'М-02', 'Шум подшипника', '2007', {}],
  ] as const) {
    if (daysAgo > days) continue;
    specs.push(
      specFor(rnd, at(daysAgo, hour), {
        type: 'unplanned',
        priority: 'normal',
        equipment_id: eq,
        code,
        description: desc,
        tab,
        rework: null,
        reject: null,
        ...extra,
      }),
    );
  }

  // P5: Бригада 1 lubrication rounds (С-01); specFor gives them about 2.4 times the Литол-24 norm
  for (const [daysAgo, hour, eq, tab] of [
    [6, 8.6, 11, '2005'],
    [4, 8.9, 14, '2005'],
    [3, 9.1, 10, '2001'],
    [2, 8.4, 13, '2005'],
  ] as const) {
    if (daysAgo > days) continue;
    specs.push(
      specFor(rnd, at(daysAgo, hour), {
        type: 'planned',
        priority: 'planned',
        equipment_id: eq,
        code: 'С-01',
        description: plannedLabel('С-01'),
        tab,
        rework: null,
        reject: null,
      }),
    );
  }

  return specs.sort((a, b) => a.created - b.created);
}

// ---------------------------------------------------------------------------
// the demo start state (internal.demo_reset)
// ---------------------------------------------------------------------------

interface ActiveSpec {
  tab: string;
  equipment_id: number;
  code: string;
  description: string;
  status: Status;
  priority: Priority;
  since_min: number;
  stopped?: boolean;
  queue_position?: number;
  comment?: string;
  type?: OrderType;
}

/** internal.demo_order: an order created `since` ago with the events up to its status, due in 6 hours. */
function demoOrder(rows: Rows, now: number, s: ActiveSpec): Order {
  const master = employeeId('1001');
  const worker = employeeId(s.tab);
  const t0 = now - s.since_min * MIN;
  const st = s.status;
  const order = rows.order({
    type: s.type ?? 'unplanned',
    priority: s.priority,
    description: s.description,
    equipment_id: s.equipment_id,
    assignee_id: worker,
    master_id: master,
    status: st,
    due_at: iso(now + 6 * HOUR),
    norm_hours: normOf(s.code),
    equipment_stopped: s.stopped ?? false,
    suggested_fault_code: s.code,
    created_at: iso(t0),
    issued_at: iso(t0),
    accepted_at:
      st === 'accepted' || st === 'in_progress' || st === 'paused' ? iso(t0 + 4 * MIN) : null,
    queued_at: st === 'queued' ? iso(t0 + 3 * MIN) : null,
    started_at: st === 'in_progress' || st === 'paused' ? iso(t0 + 9 * MIN) : null,
    paused_since: st === 'paused' ? iso(now - 35 * MIN) : null,
    last_comment: s.comment ?? null,
    queue_position: s.queue_position ?? null,
    is_demo: true,
  });
  // the SQL writes these events without a payload
  rows.event(order, master, 'create', null, 'issued', t0);
  if (st === 'queued') rows.event(order, worker, 'queue', 'issued', 'queued', t0 + 3 * MIN);
  if (st === 'accepted' || st === 'in_progress' || st === 'paused') {
    rows.event(order, worker, 'accept', 'issued', 'accepted', t0 + 4 * MIN);
  }
  if (st === 'in_progress' || st === 'paused') {
    rows.event(order, worker, 'start', 'accepted', 'in_progress', t0 + 9 * MIN);
  }
  if (st === 'paused') {
    rows.event(order, worker, 'pause', 'in_progress', 'paused', now - 35 * MIN, {
      reason: 'waiting_parts',
      comment: s.comment ?? null,
    });
  }
  return order;
}

const ACTIVE: readonly ActiveSpec[] = [
  {
    tab: '2002',
    equipment_id: 12,
    code: 'М-02',
    description: 'Шум подшипника',
    status: 'in_progress',
    priority: 'high',
    since_min: 150,
    stopped: true,
  },
  {
    tab: '2003',
    equipment_id: 21,
    code: 'Э-03',
    description: 'Не запускается',
    status: 'in_progress',
    priority: 'normal',
    since_min: 50,
  },
  {
    tab: '2007',
    equipment_id: 11,
    code: 'М-04',
    description: 'Сход ленты',
    status: 'in_progress',
    priority: 'high',
    since_min: 70,
    stopped: true,
  },
  {
    tab: '2006',
    equipment_id: 10,
    code: 'М-02',
    description: 'Шум подшипника',
    status: 'queued',
    priority: 'normal',
    since_min: 40,
    queue_position: 1,
  },
  {
    tab: '2006',
    equipment_id: 8,
    code: 'М-04',
    description: 'Сильная вибрация',
    status: 'queued',
    priority: 'normal',
    since_min: 25,
    queue_position: 2,
  },
  {
    tab: '2008',
    equipment_id: 24,
    code: 'Э-04',
    description: 'Не работает концевик',
    status: 'accepted',
    priority: 'normal',
    since_min: 20,
  },
  {
    tab: '2010',
    equipment_id: 4,
    code: 'М-02',
    description: 'Перегрев подшипника',
    status: 'paused',
    priority: 'high',
    since_min: 110,
    comment: 'ждём подшипник со склада',
  },
];

const CLOSED_TODAY: readonly (readonly [string, number, string, string, Priority, number])[] = [
  ['2001', 14, 'С-01', 'ППР: плановая смазка', 'planned', 92],
  ['2009', 22, 'Э-04', 'Не срабатывает датчик', 'normal', 88],
  ['2005', 11, 'С-01', 'ППР: плановая смазка', 'planned', 84],
  ['2007', 15, 'М-02', 'Шум подшипника', 'high', 90],
  ['2002', 15, 'М-06', 'Ослабло крепление', 'normal', 81],
  ['2006', 16, 'М-04', 'Сильная вибрация', 'high', 64],
  ['2003', 17, 'Э-05', 'Срабатывает защита', 'normal', 87],
  ['2008', 19, 'П-02', 'Отказ импульсной продувки', 'normal', 79],
  ['2010', 7, 'М-01', 'Износ брони', 'high', 76],
  ['2001', 20, 'М-04', 'Шум и вибрация', 'normal', 91],
  ['2009', 6, 'П-01', 'Утечка воздуха', 'normal', 85],
  ['2007', 23, 'М-07', 'Заклинило ролик', 'emergency', 89],
];

/** The 12 orders closed earlier this shift, exactly as internal.demo_reset() writes them. */
function closedToday(rows: Rows, now: number): void {
  const today0 = localMidnight(now);
  const eight = today0 + 8 * HOUR;
  const from = Math.min(now >= eight ? eight : now - 10 * HOUR, now - 3 * HOUR);
  const span = Math.max(now - 20 * MIN - from, 30 * MIN);
  const master = employeeId('1001');
  CLOSED_TODAY.forEach(([tab, eq, code, description, priority, score], i) => {
    const t = from + (span * i) / 12;
    const order = demoOrder(rows, now, {
      tab,
      equipment_id: eq,
      code,
      description,
      status: 'issued',
      priority,
      since_min: (now - t) / MIN,
      type: priority === 'planned' ? 'planned' : 'unplanned',
      stopped: priority === 'high' || priority === 'emergency',
    });
    const norm = order.norm_hours ?? 1;
    const verdict = verdictOf(score);
    const accepted = t + 3 * MIN;
    const started = t + 8 * MIN;
    const doneRaw = started + norm * 0.9 * HOUR;
    const closed = Math.min(doneRaw + 12 * MIN, now - 2 * MIN);
    const done = Math.max(Math.min(doneRaw, now - 15 * MIN), started + MIN);
    const reviewAt = done + 20_000;
    rows.lines(order, typicalLines(code));
    const review = rows.review({
      order_id: order.id,
      attempt: 1,
      verdict,
      score,
      score5: score5Of(score),
      confidence: 0.86,
      needs_master_review: false,
      checks: seedChecks(score),
      photo: null,
      feedback_worker: { good: ['Работа выполнена'], improve: [] },
      report_master: {
        summary: 'Неисправность устранена',
        suggested_code: null,
        materials_logic: null,
        work_match: null,
      },
      model: 'seed',
      latency_ms: null,
      created_at: iso(reviewAt),
      master_verdict: verdict,
      master_score: score,
      master_comment: null,
      master_id: master,
      master_decided_at: iso(closed),
    });
    rows.replace({
      ...order,
      status: 'closed',
      due_at: iso(t + norm * 3600 * 1.6 * 1000),
      accepted_at: iso(accepted),
      started_at: iso(started),
      done_at: iso(done),
      closed_at: iso(closed),
      works_done: worksText(code),
      fault_code: code,
      final_verdict: verdict,
      final_score: score,
      ai_review_id: review.id,
    });
    rows.event(order, order.assignee_id, 'accept', 'issued', 'accepted', accepted);
    rows.event(order, order.assignee_id, 'start', 'accepted', 'in_progress', started);
    rows.event(order, order.assignee_id, 'complete', 'in_progress', 'done', done);
    rows.event(order, null, 'review_started', 'done', 'ai_review', done, {
      payload: { attempt: 1 },
    });
    rows.event(order, null, 'ai_result', 'ai_review', 'ai_review', reviewAt, {
      payload: { review_id: review.id, verdict, score },
    });
    rows.event(order, master, 'close', 'ai_review', 'closed', closed, {
      payload: {
        final_verdict: verdict,
        final_score: score,
        ai_verdict: verdict,
        ai_score: score,
        changed: false,
      },
    });
  });
}

/**
 * The Demo Day start state at `now`: a short closed history (ending yesterday), then the 7 active demo orders
 * (all due in 6 hours) and the 12 orders closed earlier this shift, with events, materials and reviews.
 */
export function demoState(now: Date, options: DemoStateOptions = {}): DemoState {
  const nowMs = now.getTime();
  const rnd = seededRandom(options.seed ?? 2026);
  const uuid = options.uuid ?? ((): string => randomUuid(rnd));
  const rows = new Rows(uuid);

  const days = Math.max(0, options.historyDays ?? 7);
  for (const spec of historySpecs(rnd, localMidnight(nowMs), days)) {
    if (spec.created + 30 * MIN > nowMs) continue;
    buildClosed(rows, spec);
  }
  const historyMax = rows.orders.length;

  for (const s of ACTIVE) demoOrder(rows, nowMs, s);
  closedToday(rows, nowMs);
  linkRepeats(rows.orders);

  return {
    orders: rows.orders,
    events: rows.events.sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id,
    ),
    materials: rows.materials,
    reviews: rows.reviews,
    on_shift: [...DEMO_ON_SHIFT],
    history_max_order_id: historyMax,
  };
}
