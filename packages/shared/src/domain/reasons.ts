// Reject and pause reasons with their Russian labels (CLAUDE.md §6; SQL internal.reject_label, pause_label).

import {
  PAUSE_REASON_VALUES,
  REJECT_REASON_VALUES,
  type PauseReason,
  type RejectReason,
} from './enums';

export const REJECT_REASON_LABEL: Readonly<Record<RejectReason, string>> = {
  no_materials: 'Нет материалов',
  no_permit: 'Нет допуска',
  busy_emergency: 'Занят аварийным',
  equipment_running: 'Оборудование работает',
  other: 'Другое',
};

export const PAUSE_REASON_LABEL: Readonly<Record<PauseReason, string>> = {
  waiting_parts: 'Ожидание запчастей',
  waiting_stop: 'Ожидание остановки',
  waiting_permit: 'Ожидание допуска',
  other: 'Другое',
};

export interface ReasonOption<T extends string> {
  value: T;
  label: string;
}

/** Options for the reject sheet, in display order. A comment is required for `other`. */
export const REJECT_REASONS: readonly ReasonOption<RejectReason>[] = REJECT_REASON_VALUES.map(
  (value) => ({
    value,
    label: REJECT_REASON_LABEL[value],
  }),
);

/** Options for the pause sheet, in display order. */
export const PAUSE_REASONS: readonly ReasonOption<PauseReason>[] = PAUSE_REASON_VALUES.map(
  (value) => ({
    value,
    label: PAUSE_REASON_LABEL[value],
  }),
);

export function isRejectReason(value: string): value is RejectReason {
  return (REJECT_REASON_VALUES as readonly string[]).includes(value);
}

export function isPauseReason(value: string): value is PauseReason {
  return (PAUSE_REASON_VALUES as readonly string[]).includes(value);
}

/** Label of a stored reason code (reject or pause); unknown values come back as they are, like the SQL. */
export function reasonLabel(reason: string | null | undefined): string {
  if (reason == null) return '';
  if (isRejectReason(reason)) return REJECT_REASON_LABEL[reason];
  if (isPauseReason(reason)) return PAUSE_REASON_LABEL[reason];
  return reason;
}

/** The comment is required when the reject reason is `other`. */
export function rejectNeedsComment(reason: RejectReason): boolean {
  return reason === 'other';
}
