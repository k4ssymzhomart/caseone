// Entity, view and RPC types. They mirror the database EXACTLY in snake_case (tables of
// 20261008100002_rota_schema.sql, views of 20261008100005_rota_views.sql, jsonb built by the report and
// AI functions), so SupabaseApi passes rows through without mapping and MockApi produces identical shapes.
// Conventions: timestamptz → ISO string; bigint, int, smallint and numeric → number; uuid → string.

import type {
  BoardColumn,
  CheckStatus,
  Criticality,
  FaultGroup,
  NotificationKind,
  OrderEventAction,
  OrderType,
  PhotoKind,
  PhotoSource,
  Priority,
  Role,
  Severity,
  Shift,
  Status,
  Verdict,
  WorkerState,
} from './enums';

/** ISO 8601 timestamp as returned by PostgREST (timestamptz). */
export type Timestamp = string;
/** uuid as a string. */
export type Uuid = string;

// ---------------------------------------------------------------------------
// directories
// ---------------------------------------------------------------------------

export interface Area {
  id: number;
  code: string;
  name: string;
  sort: number;
}

export interface Equipment {
  id: number;
  area_id: number;
  name: string;
  inventory_no: string | null;
  type: string;
  criticality: Criticality;
  qr_token: string | null;
  is_stopped: boolean;
}

export interface Brigade {
  id: number;
  name: string;
  leader_id: Uuid | null;
}

export interface Employee {
  id: Uuid;
  tab_no: string;
  full_name: string;
  short_name: string;
  pseudonym: string;
  role: Role;
  specialty: string | null;
  grade: number | null;
  brigade_id: number | null;
  shift: Shift | null;
  on_shift: boolean;
  telegram_chat_id: number | null;
  created_at: Timestamp;
}

export interface FaultCode {
  code: string;
  grp: FaultGroup;
  name: string;
  specialty: string;
}

export interface Material {
  id: number;
  sku: string;
  name: string;
  unit: string;
  unit_cost_kzt: number;
}

/** One typical material line of a work norm: usual qty and the hard maximum. */
export interface WorkNormMaterial {
  material_id: number;
  qty: number;
  qty_max: number;
}

export interface WorkNorm {
  fault_code: string;
  norm_hours: number;
  typical: WorkNormMaterial[];
}

export interface EquipmentTypeSpecialty {
  type: string;
  specialty: string;
  /** Dative plural for reasons like «12 нарядов по насосам». */
  label_plural_dat: string | null;
}

export interface ProblemTemplate {
  id: number;
  equipment_type: string;
  label: string;
  suggested_fault_code: string | null;
  sort: number;
}

/** A raw settings row (key, jsonb value). */
export interface SettingRow {
  key: string;
  value: unknown;
}

/** settings table folded into one object with the known keys typed. */
export interface Settings {
  remind_before_min: number;
  accept_timeout_min: number;
  accept_timeout_emergency_min: number;
  overdue_repeat_min: number;
  manager_overdue_min: number;
  demo_time_scale: number;
  demo_mode: boolean;
  ai_confidence_threshold: number;
  duplicate_hamming_max: number;
}
export type SettingKey = keyof Settings;

/** Every directory in one object; keys are the table names. */
export interface Directories {
  areas: Area[];
  equipment: Equipment[];
  brigades: Brigade[];
  employees: Employee[];
  fault_codes: FaultCode[];
  materials: Material[];
  work_norms: WorkNorm[];
  equipment_type_specialty: EquipmentTypeSpecialty[];
  problem_templates: ProblemTemplate[];
  settings: Settings;
}

// ---------------------------------------------------------------------------
// orders
// ---------------------------------------------------------------------------

/** A row of public.orders. */
export interface Order {
  id: number;
  number: number;
  client_ref: Uuid;
  type: OrderType;
  priority: Priority;
  description: string;
  comment: string | null;
  area_id: number;
  equipment_id: number;
  assignee_id: Uuid;
  brigade_id: number | null;
  master_id: Uuid;
  status: Status;
  due_at: Timestamp;
  norm_hours: number | null;
  equipment_stopped: boolean;
  suggested_fault_code: string | null;
  queue_position: number | null;
  works_done: string | null;
  fault_code: string | null;
  closing_comment: string | null;
  created_at: Timestamp;
  issued_at: Timestamp;
  accepted_at: Timestamp | null;
  queued_at: Timestamp | null;
  rejected_at: Timestamp | null;
  started_at: Timestamp | null;
  done_at: Timestamp | null;
  closed_at: Timestamp | null;
  cancelled_at: Timestamp | null;
  paused_since: Timestamp | null;
  paused_total_sec: number;
  last_comment: string | null;
  rework_count: number;
  ai_review_id: number | null;
  final_verdict: Verdict | null;
  final_score: number | null;
  repeat_of_order_id: number | null;
  is_demo: boolean;
}

/** A row of public.v_orders: the order plus names, board column, overdue flag and the current AI verdict. */
export interface OrderView extends Order {
  equipment_name: string;
  equipment_type: string;
  equipment_criticality: Criticality;
  area_name: string;
  assignee_short_name: string;
  master_short_name: string;
  brigade_name: string | null;
  is_overdue: boolean;
  /** null only for cancelled orders. */
  board_column: BoardColumn | null;
  /** Time of the last event that changed the status. */
  status_since: Timestamp | null;
  /** Reason code of the last reject or pause event (reject_t or pause_t value). */
  last_reason: string | null;
  ai_verdict: Verdict | null;
  ai_score: number | null;
  ai_needs_master_review: boolean | null;
}

export interface OrderEvent {
  id: number;
  order_id: number;
  /** null = system or AI. */
  actor_id: Uuid | null;
  action: OrderEventAction;
  from_status: Status | null;
  to_status: Status | null;
  reason: string | null;
  comment: string | null;
  payload: Record<string, unknown>;
  client_action_id: Uuid | null;
  created_at: Timestamp;
}

export interface OrderPhoto {
  id: number;
  order_id: number | null;
  client_ref: Uuid;
  kind: PhotoKind;
  storage_path: string;
  author_id: Uuid | null;
  source: PhotoSource;
  captured_at: Timestamp | null;
  uploaded_at: Timestamp;
  dhash: string | null;
  sha256: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  exif: Record<string, unknown> | null;
}

export interface OrderMaterial {
  id: number;
  order_id: number;
  material_id: number;
  qty: number;
}

/** An order material line joined with its material. */
export interface OrderMaterialView extends OrderMaterial {
  material_name: string;
  unit: string;
}

/** A material line as submitted with `complete`. */
export interface MaterialLine {
  material_id: number;
  qty: number;
}

// ---------------------------------------------------------------------------
// AI review
// ---------------------------------------------------------------------------

/** One check of an AI review: R1 to R4 (rules) and L1, L2 (LLM). */
export interface AiCheck {
  id: string;
  title: string;
  status: CheckStatus;
  points: number;
  max: number;
  message_ru: string;
}

/** ai_reviews.photo: the LLM's photo judgement (null for a rules only review). */
export interface AiPhotoJudgement {
  after_present: boolean;
  same_equipment: 'yes' | 'no' | 'unsure';
  problem_resolved: 'yes' | 'no' | 'unsure' | 'not_applicable';
  quality_issues: string[];
  score_1_5: number;
  explanation: string;
}

export interface AiFeedback {
  good: string[];
  improve: string[];
}

export interface AiWorkMatch {
  verdict: 'full' | 'partial' | 'none';
  explanation: string;
}

export interface AiMaterialsLogic {
  verdict: 'ok' | 'suspicious';
  explanation: string;
}

/** ai_reviews.report_master as ai_submit builds it. */
export interface AiReportMaster {
  summary: string;
  suggested_code: string | null;
  materials_logic: AiMaterialsLogic | null;
  work_match: AiWorkMatch | null;
}

/** The LLM's JSON answer of CLAUDE.md §11 step 3 (input of ai_submit p_llm). */
export interface AiLlmAnswer {
  work_match: AiWorkMatch;
  code_consistent: boolean;
  suggested_code: string;
  materials_logic: AiMaterialsLogic;
  photo: AiPhotoJudgement;
  confidence: number;
  feedback_worker: AiFeedback;
  summary_master: string;
}

/** A row of public.ai_reviews. */
export interface AiReview {
  id: number;
  order_id: number;
  attempt: number;
  verdict: Verdict;
  score: number;
  score5: number;
  confidence: number | null;
  needs_master_review: boolean;
  checks: AiCheck[];
  photo: AiPhotoJudgement | null;
  feedback_worker: AiFeedback | null;
  report_master: AiReportMaster | null;
  model: string | null;
  latency_ms: number | null;
  created_at: Timestamp;
  master_verdict: Verdict | null;
  master_score: number | null;
  master_comment: string | null;
  master_id: Uuid | null;
  master_decided_at: Timestamp | null;
}

// ---------------------------------------------------------------------------
// notifications, workers
// ---------------------------------------------------------------------------

/** A row of public.notifications. */
export interface AppNotification {
  id: number;
  recipient_id: Uuid;
  order_id: number | null;
  kind: NotificationKind;
  severity: Severity;
  title: string;
  body: string;
  url: string | null;
  dedupe_key: string;
  created_at: Timestamp;
  read_at: Timestamp | null;
  push_sent_at: Timestamp | null;
  tg_sent_at: Timestamp | null;
}

/** A row of public.v_worker_status. */
export interface WorkerStatusView {
  id: Uuid;
  tab_no: string;
  short_name: string;
  specialty: string | null;
  grade: number | null;
  brigade_id: number | null;
  shift: Shift | null;
  on_shift: boolean;
  current_order_id: number | null;
  current_order_number: number | null;
  current_equipment_name: string | null;
  queue_count: number;
  status: WorkerState;
}

/** A row of public.v_brigade_status. */
export interface BrigadeStatusView {
  id: number;
  name: string;
  leader_id: Uuid | null;
  leader_short_name: string | null;
  on_shift_count: number;
  free_count: number;
  busy_count: number;
}

/** A row of public.suggest_assignees(). */
export interface AssigneeSuggestion {
  employee_id: Uuid;
  short_name: string;
  status: WorkerState;
  score: number;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// shift, equipment, reports
// ---------------------------------------------------------------------------

/** Counters row of the shift panel and the board. */
export interface ShiftCounters {
  /** Orders issued since the shift start. */
  issued: number;
  /** Orders done or closed since the shift start. */
  done: number;
  /** Active orders overdue now. */
  overdue: number;
  /** Units stopped now (equipment.is_stopped). */
  stopped: number;
}

export interface EquipmentHistory {
  equipment: Equipment;
  /** v_orders rows for the unit, newest first. */
  orders: OrderView[];
  /** Σ (coalesce(done_at, cancelled_at, now) − created_at) over orders with equipment_stopped, minutes. */
  downtime_min: number;
}

/** A row of public.rating(). Worker rows carry the uuid as id, brigade rows the brigade id as text. */
export interface RatingRow {
  kind: 'worker' | 'brigade';
  id: string;
  name: string;
  brigade_id: number | null;
  closed: number;
  q: number | null;
  t: number | null;
  f: number | null;
  v: number | null;
  d: number | null;
  /** null when the worker has no closed orders («нет закрытых нарядов»). */
  score: number | null;
  rank: number;
  note: string | null;
}

export interface ShiftReportCounts {
  issued: number;
  accepted: number;
  done: number;
  closed: number;
  overdue: number;
  rejected: number;
  rework: number;
  cancelled: number;
  active_now: number;
}

export interface ShiftReportWorkload {
  employee_id: Uuid;
  short_name: string;
  busy_min: number;
  /** busy minutes / shift minutes, 0..1. */
  share: number;
}

export interface ShiftReportDowntime {
  equipment_id: number;
  name: string;
  hours: number;
  orders: number;
}

/** jsonb returned by public.shift_report(). */
export interface ShiftReport {
  period: Period;
  counts: ShiftReportCounts;
  /** reason is a reject_t value (null for a reject without reason). */
  rejected_reasons: { reason: string | null; count: number }[];
  workload: ShiftReportWorkload[];
  downtime: ShiftReportDowntime[];
  downtime_hours: number;
  reaction_avg_min: number | null;
  execution_avg_min: number | null;
  on_time_share: number | null;
  verdicts: Partial<Record<Verdict, number>>;
  master_overrides: number;
  top_issues: { code: string; name: string | null; count: number }[];
  top_equipment: { equipment_id: number; name: string; count: number }[];
}

/** jsonb returned by public.dashboard(): the manager tiles. */
export interface Dashboard {
  in_progress_now: number;
  overdue_now: number;
  reaction_avg_min: number | null;
  execution_avg_min: number | null;
  downtime_hours: number;
  on_time_share: number | null;
  closed: number;
  top_equipment: { equipment_id: number; name: string; unplanned: number; downtime_h: number }[];
  /** employee_id is the rating row id (uuid as text). */
  best_workers: { employee_id: string; short_name: string; score: number; closed: number }[];
}

export const INSIGHT_KINDS = [
  'top_equipment',
  'repeat_faults',
  'post_ppr',
  'time_patterns',
  'worker_repeats',
  'materials',
  'trend',
  'shift_summary',
  'weekly_digest',
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export interface InsightEvidence {
  order_ids: number[];
  stats: Record<string, unknown>;
}

/** A card of public.insight_cards() or an ai_insights row (id, created_at and scope only on stored rows). */
export interface Insight {
  id?: number;
  created_at?: Timestamp;
  scope?: Record<string, unknown>;
  kind: string;
  severity: Severity;
  title: string;
  body: string;
  recommendation: string;
  evidence: InsightEvidence;
}

export interface ShiftSummary {
  summary: string;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// inputs and filters
// ---------------------------------------------------------------------------

/** A time window, ISO timestamps, `to` exclusive. */
export interface Period {
  from: Timestamp;
  to: Timestamp;
}

/** The shared report filter (one jsonb in every report RPC). */
export interface ReportFilters {
  area_id?: number;
  equipment_id?: number;
  assignee_id?: Uuid;
  brigade_id?: number;
}

export interface ShiftReportInput extends Period {
  filters?: ReportFilters;
}

export interface InsightsInput extends Period {
  filters?: ReportFilters;
  /** Free text question for the ask box (Phase 6). */
  query?: string;
}

/** orders.list filter over v_orders. Sorted by priority (emergency first), then due_at. */
export interface OrderFilter {
  assignee_id?: Uuid;
  master_id?: Uuid;
  statuses?: Status[];
  area_id?: number;
  equipment_id?: number;
  priority?: Priority;
  /** created_at >= since (ISO). */
  since?: Timestamp;
  limit?: number;
}

export interface OrderDetail {
  order: OrderView;
  /** Ordered by created_at. */
  events: OrderEvent[];
  photos: OrderPhoto[];
  materials: OrderMaterialView[];
  /** Every attempt, oldest first. */
  reviews: AiReview[];
}

/** The `p` jsonb of create_order. area_id always follows the equipment on the server. */
export interface CreateOrderInput {
  type: OrderType;
  priority: Priority;
  description: string;
  equipment_id: number;
  area_id?: number;
  /** A worker; for a brigade order pass brigade_id (the server assigns the leader). */
  assignee_id?: Uuid;
  brigade_id?: number | null;
  /** Deadline: due_at, else due_in_min (server clock), else norm_hours, else the suggested code's norm, else by priority. */
  due_at?: Timestamp;
  due_in_min?: number;
  norm_hours?: number;
  /** Draft id, also the photo folder: orders/{client_ref}/{kind}/{uuid}.jpg */
  client_ref: Uuid;
  comment?: string;
  equipment_stopped?: boolean;
  suggested_fault_code?: string | null;
  allow_off_shift?: boolean;
}

/** The `p_payload` jsonb of order_action: every key the SQL reads, all optional. */
export interface ActionPayload {
  /** reject: reject_t; pause: pause_t; cancel: free text. */
  reason?: string;
  comment?: string;
  /** complete */
  works_done?: string;
  fault_code?: string | null;
  materials?: MaterialLine[];
  no_materials?: boolean;
  /** close */
  final_verdict?: Verdict;
  final_score?: number;
  /** reassign */
  assignee_id?: Uuid;
  brigade_id?: number | null;
  /** set_priority */
  priority?: Priority;
  /** start, resume, resume_rework */
  pause_current?: boolean;
  /** reassign */
  allow_off_shift?: boolean;
  /** mark_reject_justified: id of the reject event */
  reject_event_id?: number;
}

export interface PhotoUploadInput {
  client_ref: Uuid;
  kind: PhotoKind;
  /** The compressed JPEG bytes. */
  data: Uint8Array;
  /** Local file uri, for previews while uploading. */
  uri?: string;
  source: PhotoSource;
  captured_at: Timestamp | null;
  dhash: string | null;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  exif: Record<string, unknown> | null;
}

export interface PushTokenInput {
  token: string;
  platform: 'ios' | 'android' | 'web';
  device_name: string | null;
}

export interface Session {
  user_id: Uuid;
  role: Role;
  short_name: string;
  full_name: string;
  tab_no: string;
  pseudonym: string;
}

export const REALTIME_TOPICS = ['orders', 'notifications', 'workers', 'reviews'] as const;
export type RealtimeTopic = (typeof REALTIME_TOPICS)[number];

export interface RealtimeEvent {
  topic: RealtimeTopic;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  row?: unknown;
}

export type Unsubscribe = () => void;
