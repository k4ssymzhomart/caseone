// Notification texts, titles, severity, url and push routing (CLAUDE.md §8).
// renderNotification() prints exactly what internal.notify() in 20261008100004_rota_state_machine.sql
// writes into public.notifications, character for character, so MockApi rows look like real ones.
// The vars mirror the jsonb p_vars keys the SQL reads (minutes, status_since, cand_short_name, cand_reason,
// url, top_reason, verdict_label, score, unsure, reason_label, reason). weekly_digest has no SQL template
// yet (ai-insights sends it in Phase 6); its text follows CLAUDE.md §8.

import { RotaError } from '../api/errors';
import { hhmm, minutesBetween, toDate, type DateInput } from '../format/time';
import { INSIGHT_FORMS, plural, SCORE_FORMS } from '../format/number';
import type { NotificationKind, Priority, Severity, Status, Verdict } from './enums';
import { PRIORITY_LABEL_LOWER } from './priority';
import { REJECT_REASON_LABEL } from './reasons';
import { STATUS_LABEL, VERDICT_LABEL } from './status';

/** Every kind except weekly_digest is about one order. */
export type OrderNotificationKind = Exclude<NotificationKind, 'weekly_digest'>;

/**
 * The order fields a template reads. An OrderView fits as it is; a bare Order needs the three names
 * (equipment, area, assignee short name) added, like the SQL joins them.
 */
export interface TemplateOrder {
  id: number;
  number: number;
  priority: Priority;
  status: Status;
  due_at: string;
  last_comment?: string | null;
  equipment_name?: string | null;
  area_name?: string | null;
  assignee_short_name?: string | null;
}

/** The p_vars of internal.notify, plus two conveniences (verdict, cand_id) and the digest fields. */
export interface NotificationVars {
  /** reminder, overdue, escalation, manager_overdue: real minutes (see the *Minutes helpers below). */
  minutes?: number | null;
  /** overdue: «HH:MM» local time the current status began (pass a time and it is formatted). */
  status_since?: string | null;
  /** escalation: the suggested worker; the «Предлагаем» clause is left out without one. */
  cand_short_name?: string | null;
  /** escalation: the first suggest_assignees reason, lowercased (escalationReason); default «свободен». */
  cand_reason?: string | null;
  /** escalation: the candidate's id, builds the url «/order/{id}?reassign={cand_id}» when `url` is absent. */
  cand_id?: string | null;
  /** Overrides the default url, like the SQL `coalesce(nullif(p_vars ->> 'url', ''), v_url)`. */
  url?: string | null;
  /** rework, review_rework: the first failed check or the master's comment; default «см. отчёт». */
  top_reason?: string | null;
  /** review_ready, report, closed: «Принято», «Принято с замечаниями», «Требует доработки». */
  verdict_label?: string | null;
  /** Used for verdict_label when that is absent. */
  verdict?: Verdict | null;
  /** review_ready, report, closed: score 0..100; «, 85 баллов» is left out without it. */
  score?: number | null;
  /** review_ready: true when the AI is unsure (needs_master_review). */
  unsure?: boolean | null;
  /** rejected: the reject label, built by rejectedReasonLabel(). */
  reason_label?: string | null;
  /** cancelled: the master's reason text. */
  reason?: string | null;
  /** weekly_digest: number of insights. */
  count?: number | null;
  /** weekly_digest: title of the top insight; «Главное: …» is left out without it. */
  top_title?: string | null;
}

/** What a template produces: the notification row fields the client fills (plus order_id and kind). */
export interface RenderedNotification {
  kind: NotificationKind;
  order_id: number | null;
  severity: Severity;
  title: string;
  body: string;
  url: string;
}

// ---------------------------------------------------------------------------
// severity, titles, urls, push routing
// ---------------------------------------------------------------------------

export const NOTIFICATION_SEVERITY: Readonly<Record<NotificationKind, Severity>> = {
  new_order: 'info',
  emergency: 'critical',
  reminder: 'warning',
  overdue: 'critical',
  escalation: 'warning',
  manager_overdue: 'critical',
  rework: 'critical',
  review_ready: 'info',
  review_rework: 'critical',
  report: 'info',
  rejected: 'warning',
  reassigned: 'info',
  closed: 'info',
  cancelled: 'warning',
  weekly_digest: 'info',
};

const TITLE_PREFIX: Readonly<Record<OrderNotificationKind, string>> = {
  new_order: 'Новый наряд №',
  emergency: 'Аварийный наряд №',
  reminder: 'Скоро срок №',
  overdue: 'Просрочен №',
  escalation: 'Не принят №',
  manager_overdue: 'Длительная просрочка №',
  rework: 'На доработку №',
  review_ready: 'Проверка ИИ №',
  review_rework: 'ИИ вернул №',
  report: 'Отчёт ИИ №',
  rejected: 'Отклонён №',
  reassigned: 'Передан №',
  closed: 'Закрыт №',
  cancelled: 'Отменён №',
};

export const WEEKLY_DIGEST_TITLE = 'Сводка ИИ за неделю';

/** Where the weekly digest opens: the analytics page of the web panel. */
export const WEEKLY_DIGEST_URL = '/analytics';

/** Push title and HUD line: «Новый наряд №148»; weekly_digest has no number. */
export function notificationTitle(kind: NotificationKind, orderNumber?: number): string {
  if (kind === 'weekly_digest') return WEEKLY_DIGEST_TITLE;
  return TITLE_PREFIX[kind] + (orderNumber ?? '');
}

/** Default url of a kind (CLAUDE.md §8); escalation gets «?reassign=» when the candidate is known. */
export function notificationUrl(
  kind: NotificationKind,
  orderId: number | null,
  candidateId?: string | null,
): string {
  if (kind === 'weekly_digest') return WEEKLY_DIGEST_URL;
  if (orderId == null) return '/';
  if (kind === 'emergency') return `/emergency/${orderId}`;
  if (kind === 'report' || kind === 'review_ready' || kind === 'review_rework')
    return `/order/${orderId}/review`;
  if (kind === 'escalation' && candidateId) return `/order/${orderId}?reassign=${candidateId}`;
  return `/order/${orderId}`;
}

/** Android notification channels created at startup (CLAUDE.md §8). */
export const NOTIFICATION_CHANNELS = ['orders', 'emergency', 'reminders'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

const REMINDER_CHANNEL_KINDS: ReadonlySet<NotificationKind> = new Set<NotificationKind>([
  'reminder',
  'overdue',
  'rework',
]);
const ACTION_KINDS: ReadonlySet<NotificationKind> = new Set<NotificationKind>(['new_order', 'emergency']);

/** The channel notify-dispatch uses: emergency, reminders (reminder, overdue, rework) or orders. */
export function notificationChannel(kind: NotificationKind): NotificationChannel {
  if (kind === 'emergency') return 'emergency';
  if (REMINDER_CHANNEL_KINDS.has(kind)) return 'reminders';
  return 'orders';
}

/** The sound notify-dispatch sends: siren.wav, ding.wav or the system default. */
export function notificationSound(kind: NotificationKind): 'siren.wav' | 'ding.wav' | 'default' {
  if (kind === 'emergency') return 'siren.wav';
  if (REMINDER_CHANNEL_KINDS.has(kind)) return 'default';
  return 'ding.wav';
}

/** Notification category with «Принять» and «Открыть», set on new and emergency orders only. */
export const ORDER_ACTIONS_CATEGORY = 'order_actions';

export function notificationCategory(kind: NotificationKind): typeof ORDER_ACTIONS_CATEGORY | null {
  return ACTION_KINDS.has(kind) ? ORDER_ACTIONS_CATEGORY : null;
}

// ---------------------------------------------------------------------------
// SQL string semantics
// ---------------------------------------------------------------------------

/** format('%s', null) prints nothing. */
const s = (value: string | number | null | undefined): string => (value == null ? '' : String(value));

/** btrim(x): spaces only, like the Postgres default. */
const btrim = (value: string): string => value.replace(/^ +| +$/g, '');

/** rtrim(x, '.'): every trailing period. */
const rtrimDots = (value: string): string => value.replace(/\.+$/, '');

const isBlank = (value: string | null | undefined): boolean => value == null || btrim(value) === '';

/** The name closing a sentence: «Иванов С.» already ends with a period. */
function nameEnd(name: string | null | undefined): string {
  if (name == null) return '';
  return name.endsWith('.') ? name : `${name}.`;
}

function scoreClause(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return '';
  const n = Math.round(score);
  return `, ${n} ${plural(n, SCORE_FORMS)}`;
}

function verdictText(vars: NotificationVars): string {
  if (vars.verdict_label != null) return vars.verdict_label;
  return vars.verdict ? VERDICT_LABEL[vars.verdict] : '';
}

function statusSince(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  return /^\d{1,2}:\d{2}$/.test(value) ? value : hhmm(value);
}

// ---------------------------------------------------------------------------
// bodies
// ---------------------------------------------------------------------------

function orderBody(kind: OrderNotificationKind, o: TemplateOrder, vars: NotificationVars): string {
  const n = o.number;
  const eq = s(o.equipment_name);
  const area = s(o.area_name);
  const who = nameEnd(o.assignee_short_name);
  const minutes = s(vars.minutes);

  switch (kind) {
    case 'new_order':
      return `Новый наряд №${n}. ${eq}, ${area}. Срок до ${hhmm(o.due_at)}. Приоритет: ${PRIORITY_LABEL_LOWER[o.priority]}.`;
    case 'emergency':
      return `АВАРИЙНЫЙ наряд №${n}. ${eq}, ${area}. Требует ответа.`;
    case 'reminder':
      return `Через ${minutes} мин истекает срок наряда №${n}. ${eq}, ${area}.`;
    case 'overdue':
      return (
        `Наряд №${n} просрочен на ${minutes} мин. ${eq}, ${area}. Исполнитель: ${who} ` +
        `Статус: ${STATUS_LABEL[o.status]} с ${statusSince(vars.status_since)}.` +
        (isBlank(o.last_comment) ? '' : ` Последний комментарий: “${s(o.last_comment)}”.`)
      );
    case 'escalation':
      return (
        `Наряд №${n} не принят за ${minutes} мин. ${eq}, ${area}. Исполнитель: ${who}` +
        (isBlank(vars.cand_short_name)
          ? ''
          : ` Предлагаем: ${s(vars.cand_short_name)}, ${isBlank(vars.cand_reason) ? 'свободен' : s(vars.cand_reason)}.`)
      );
    case 'manager_overdue':
      return `Длительная просрочка: наряд №${n} просрочен на ${minutes} мин. ${eq}, ${area}. Исполнитель: ${who}`;
    case 'rework':
      return `Наряд №${n} возвращён на доработку. Причина: ${topReason(vars.top_reason)}.`;
    case 'review_ready':
      return vars.unsure
        ? `Наряд №${n} ждёт вашей проверки: ИИ не уверен в оценке.`
        : `Наряд №${n} проверен ИИ: ${verdictText(vars)}${scoreClause(vars.score)}. Подтвердите закрытие.`;
    case 'review_rework':
      return `ИИ вернул наряд №${n} на доработку. Причина: ${topReason(vars.top_reason)}. Исполнитель: ${who}`;
    case 'report':
      return `Наряд №${n} проверен ИИ: ${verdictText(vars)}${scoreClause(vars.score)}. Ждёт подтверждения мастера.`;
    case 'rejected':
      return `Наряд №${n} отклонён. ${eq}, ${area}. Исполнитель: ${who} Причина: ${rtrimDots(s(vars.reason_label))}.`;
    case 'reassigned':
      return `Наряд №${n} передан другому исполнителю. ${eq}, ${area}.`;
    case 'closed':
      return `Наряд №${n} закрыт. Итог: ${verdictText(vars)}${scoreClause(vars.score)}.`;
    case 'cancelled':
      return `Наряд №${n} отменён. ${eq}, ${area}. Причина: ${rtrimDots(s(vars.reason))}.`;
  }
}

function topReason(value: string | null | undefined): string {
  return rtrimDots(isBlank(value) ? 'см. отчёт' : s(value));
}

/** «Сводка ИИ за неделю: 5 выводов. Главное: Конвейер К-3: 7 внеплановых остановок за 30 дней.» */
export function weeklyDigestBody(count: number, topTitle?: string | null): string {
  const n = Math.max(0, Math.round(count));
  return (
    `${WEEKLY_DIGEST_TITLE}: ${n} ${plural(n, INSIGHT_FORMS)}.` +
    (isBlank(topTitle) ? '' : ` Главное: ${rtrimDots(btrim(s(topTitle)))}.`)
  );
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

export function isOrderNotificationKind(kind: NotificationKind): kind is OrderNotificationKind {
  return kind !== 'weekly_digest';
}

/** Title, body, severity and url of an order notification, exactly as internal.notify() writes them. */
export function renderOrderNotification(
  kind: OrderNotificationKind,
  order: TemplateOrder,
  vars: NotificationVars = {},
): RenderedNotification {
  if (!(kind in TITLE_PREFIX)) throw new RotaError('BAD_INPUT', { details: `unknown notification kind ${kind}` });
  return {
    kind,
    order_id: order.id,
    severity: NOTIFICATION_SEVERITY[kind],
    title: notificationTitle(kind, order.number),
    body: orderBody(kind, order, vars),
    url: vars.url ? vars.url : notificationUrl(kind, order.id, vars.cand_id),
  };
}

/** The weekly digest to managers and masters (no order). */
export function renderWeeklyDigest(vars: Pick<NotificationVars, 'count' | 'top_title' | 'url'>): RenderedNotification {
  return {
    kind: 'weekly_digest',
    order_id: null,
    severity: NOTIFICATION_SEVERITY.weekly_digest,
    title: WEEKLY_DIGEST_TITLE,
    body: weeklyDigestBody(vars.count ?? 0, vars.top_title),
    url: vars.url ? vars.url : WEEKLY_DIGEST_URL,
  };
}

/** Any kind; order kinds need the order (BAD_INPUT without it, like an unknown kind in SQL). */
export function renderNotification(
  kind: NotificationKind,
  order: TemplateOrder | null,
  vars: NotificationVars = {},
): RenderedNotification {
  if (!isOrderNotificationKind(kind)) return renderWeeklyDigest(vars);
  if (!order) throw new RotaError('BAD_INPUT', { details: `order required for ${kind}` });
  return renderOrderNotification(kind, order, vars);
}

// ---------------------------------------------------------------------------
// vars the SQL builds before calling internal.notify (state machine and watchdog)
// ---------------------------------------------------------------------------

/**
 * rejected: «Нет допуска», or for `other` the label plus the comment with a lowercase first letter:
 * «Другое: нет ключа от щитовой». The comment is trimmed of spaces like v_comment.
 */
export function rejectedReasonLabel(reason: string, comment?: string | null): string {
  const label = (REJECT_REASON_LABEL as Readonly<Record<string, string>>)[reason] ?? reason;
  const c = comment == null ? '' : btrim(comment);
  if (reason !== 'other' || c === '') return label;
  const [first = '', ...rest] = Array.from(c);
  return `${label}: ${first.toLowerCase()}${rest.join('')}`;
}

/** rework after ai_result: the message of the first failed check, else «низкая оценка ИИ». */
export function reworkTopReason(checks: readonly { status: string; message_ru: string }[] | null | undefined): string {
  const failed = (checks ?? []).find((c) => c.status === 'fail');
  return failed?.message_ru ?? 'низкая оценка ИИ';
}

/** escalation: the candidate's first reason lowercased, else «свободен». */
export function escalationReason(reasons: readonly string[] | null | undefined): string {
  return (reasons?.[0] ?? 'свободен').toLowerCase();
}

/** reminder (and the escalation reminder): whole minutes left, rounded up, at least 1. */
export function reminderMinutes(due: DateInput, now: DateInput = new Date()): number {
  return Math.max(1, Math.ceil((toDate(due).getTime() - toDate(now).getTime()) / 60_000));
}

/** overdue: whole minutes past the deadline, at least 1. */
export function overdueMinutes(due: DateInput, now: DateInput = new Date()): number {
  return Math.max(1, minutesBetween(due, now));
}

/** escalation (since issued_at) and manager_overdue (since due_at): whole minutes, rounded down. */
export function elapsedMinutes(from: DateInput, now: DateInput = new Date()): number {
  return minutesBetween(from, now);
}

/** Unix seconds of a deadline, as the SQL keys print it: floor(extract(epoch from due_at)). */
const epochSec = (value: DateInput): number => Math.floor(toDate(value).getTime() / 1000);

/** Dedupe keys exactly as the SQL writes them (unique per recipient). */
export const DEDUPE_KEY = {
  /** create_order → new_order or emergency to the assignee. */
  created: (eventId: number): string => `ev:${eventId}:new`,
  /** order_action side effects: one per event and kind. */
  event: (eventId: number, kind: NotificationKind): string => `ev:${eventId}:${kind}`,
  escalation: (orderId: number, assigneeId: string): string => `esc:${orderId}:${assigneeId}`,
  escalationReminder: (orderId: number, assigneeId: string): string => `escrem:${orderId}:${assigneeId}`,
  reminder: (orderId: number, due: DateInput): string => `rem:${orderId}:${epochSec(due)}`,
  /** k = floor((now − due_at) / overdue_repeat), so a repeat every interval gets a new key. */
  overdue: (orderId: number, due: DateInput, k: number): string => `ovd:${orderId}:${epochSec(due)}:${k}`,
  managerOverdue: (orderId: number): string => `mgr:${orderId}`,
} as const;

/** The repeat index k of the overdue key: floor(seconds overdue / max(repeat seconds, 1)). */
export function overdueRepeatIndex(due: DateInput, now: DateInput, repeatSec: number): number {
  return Math.floor((toDate(now).getTime() - toDate(due).getTime()) / 1000 / Math.max(repeatSec, 1));
}
