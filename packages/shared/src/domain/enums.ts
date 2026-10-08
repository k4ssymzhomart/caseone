// Domain enums. Names and values are identical to the Postgres enums of CLAUDE.md §5
// (supabase/migrations/20261008100002_rota_schema.sql). Each one is a readonly array plus its union type.

export const ROLES = ['master', 'worker', 'manager', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_TYPES = ['planned', 'unplanned'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const PRIORITIES = ['emergency', 'high', 'normal', 'planned'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = [
  'issued',
  'accepted',
  'queued',
  'rejected',
  'in_progress',
  'paused',
  'done',
  'ai_review',
  'rework',
  'closed',
  'cancelled',
] as const;
export type Status = (typeof STATUSES)[number];

export const PHOTO_KINDS = ['before', 'after'] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export const VERDICTS = ['accepted', 'accepted_with_remarks', 'rework'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const REJECT_REASON_VALUES = [
  'no_materials',
  'no_permit',
  'busy_emergency',
  'equipment_running',
  'other',
] as const;
export type RejectReason = (typeof REJECT_REASON_VALUES)[number];

export const PAUSE_REASON_VALUES = [
  'waiting_parts',
  'waiting_stop',
  'waiting_permit',
  'other',
] as const;
export type PauseReason = (typeof PAUSE_REASON_VALUES)[number];

/** Aliases with the SQL type names, for code that mirrors the database. */
export type role_t = Role;
export type order_type_t = OrderType;
export type priority_t = Priority;
export type status_t = Status;
export type photo_kind_t = PhotoKind;
export type verdict_t = Verdict;
export type reject_t = RejectReason;
export type pause_t = PauseReason;

/** Every action name that can appear in order_events.action (CLAUDE.md §6). */
export const ORDER_EVENT_ACTIONS = [
  'create',
  'accept',
  'queue',
  'reject',
  'start',
  'pause',
  'resume',
  'complete',
  'review_started',
  'ai_result',
  'close',
  'return',
  'resume_rework',
  'reassign',
  'cancel',
  'set_priority',
  'mark_reject_justified',
] as const;
export type OrderEventAction = (typeof ORDER_EVENT_ACTIONS)[number];

/** Actions the assignee performs through order_action. */
export const WORKER_ACTIONS = [
  'accept',
  'queue',
  'reject',
  'start',
  'pause',
  'resume',
  'complete',
  'resume_rework',
] as const;
export type WorkerAction = (typeof WORKER_ACTIONS)[number];

/** Actions a master (or admin) performs through order_action. */
export const MASTER_ACTIONS = [
  'close',
  'return',
  'reassign',
  'cancel',
  'set_priority',
  'mark_reject_justified',
] as const;
export type MasterAction = (typeof MASTER_ACTIONS)[number];

/** The subset callable by clients through rpc('order_action'). create goes through create_order;
 *  review_started and ai_result are system only. */
export const ORDER_ACTIONS = [...WORKER_ACTIONS, ...MASTER_ACTIONS] as const;
export type OrderAction = WorkerAction | MasterAction;

/** Statuses the watchdog tracks; overdue is derived from these plus due_at. */
export const ACTIVE_STATUSES = [
  'issued',
  'accepted',
  'queued',
  'in_progress',
  'paused',
  'rework',
] as const satisfies readonly Status[];
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

/** Worker state of v_worker_status.status. */
export const WORKER_STATES = ['free', 'working', 'queue', 'off'] as const;
export type WorkerState = (typeof WORKER_STATES)[number];

export const SHIFTS = ['day', 'night'] as const;
export type Shift = (typeof SHIFTS)[number];

export const SPECIALTIES = ['слесарь', 'электромонтёр', 'сварщик', 'смазчик'] as const;
export type Specialty = (typeof SPECIALTIES)[number];

export const FAULT_GROUPS = ['М', 'Э', 'Г', 'П', 'С'] as const;
export type FaultGroup = (typeof FAULT_GROUPS)[number];

export const CRITICALITIES = ['A', 'B', 'C'] as const;
export type Criticality = (typeof CRITICALITIES)[number];

export const PHOTO_SOURCES = ['camera', 'gallery'] as const;
export type PhotoSource = (typeof PHOTO_SOURCES)[number];

export const SEVERITIES = ['info', 'warning', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const NOTIFICATION_KINDS = [
  'new_order',
  'emergency',
  'reminder',
  'overdue',
  'escalation',
  'manager_overdue',
  'rework',
  'review_ready',
  'review_rework',
  'report',
  'rejected',
  'reassigned',
  'closed',
  'cancelled',
  'weekly_digest',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Columns of v_orders.board_column (CLAUDE.md §6 board map). */
export const BOARD_COLUMNS = [
  'issued',
  'accepted',
  'queued',
  'in_progress',
  'done',
  'overdue',
] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

/** Status of one AI check row (R1 to R4, L1, L2). */
export const CHECK_STATUSES = ['pass', 'warn', 'fail', 'skipped'] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];
