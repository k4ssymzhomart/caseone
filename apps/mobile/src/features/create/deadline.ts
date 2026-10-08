// Deadline of a new order (CLAUDE.md §6 «Deadline on create», §10b). The default is the norm of the
// suggested fault code, else the priority default; presets 1, 2, 4, 8 h, end of shift, «1 мин» in demo mode.
import {
  PRIORITY_DEFAULT_HOURS,
  formatDuration,
  hhmm,
  minutesBetween,
  shiftEnd,
  type CreateOrderInput,
  type Priority,
} from '@rota/shared';

import { t } from '@/lib/i18n';

export type DeadlineChoice =
  | { kind: 'auto' }
  | { kind: 'hours'; hours: number }
  | { kind: 'shiftEnd' }
  | { kind: 'minutes'; minutes: number };

export const HOUR_PRESETS: readonly number[] = [1, 2, 4, 8];
/** The demo preset «1 мин» (due_in_min: 1, the server's clock). */
export const DEMO_MINUTES = 1;

export interface DeadlineContext {
  /** Norm hours of the suggested fault code (work_norms), or null. */
  codeNormHours: number | null;
  priority: Priority;
}

export function autoHours(ctx: DeadlineContext): number {
  return ctx.codeNormHours ?? PRIORITY_DEFAULT_HOURS[ctx.priority];
}

export function choiceKey(choice: DeadlineChoice): string {
  switch (choice.kind) {
    case 'auto':
      return 'auto';
    case 'hours':
      return `h${choice.hours}`;
    case 'shiftEnd':
      return 'shiftEnd';
    case 'minutes':
      return `m${choice.minutes}`;
  }
}

/** Due moment as the phone sees it (display only; the server keeps its own clock). */
export function deadlineDue(choice: DeadlineChoice, ctx: DeadlineContext, now: Date): Date {
  switch (choice.kind) {
    case 'auto':
      return new Date(now.getTime() + autoHours(ctx) * 3_600_000);
    case 'hours':
      return new Date(now.getTime() + choice.hours * 3_600_000);
    case 'shiftEnd':
      return shiftEnd(now);
    case 'minutes':
      return new Date(now.getTime() + choice.minutes * 60_000);
  }
}

/** «2 ч · до 11:30», «1 мин · до 10:31», «Конец смены · до 20:00». */
export function deadlineText(choice: DeadlineChoice, ctx: DeadlineContext, now: Date): string {
  const due = deadlineDue(choice, ctx, now);
  if (choice.kind === 'shiftEnd') return t('create.deadline.shiftEndPill', { time: hhmm(due) });
  return t('create.deadline.pill', {
    duration: formatDuration(Math.max(1, minutesBetween(now, due))),
    time: hhmm(due),
  });
}

/**
 * The deadline fields of create_order. norm_hours always carries the code's norm when there is one (the
 * order keeps its work norm); the deadline itself comes from due_at, else due_in_min, else norm_hours,
 * else the server's priority default.
 */
export function deadlineInput(
  choice: DeadlineChoice,
  ctx: DeadlineContext,
  now: Date,
): Pick<CreateOrderInput, 'due_at' | 'due_in_min' | 'norm_hours'> {
  const norm = ctx.codeNormHours != null ? { norm_hours: ctx.codeNormHours } : {};
  switch (choice.kind) {
    case 'auto':
      return norm;
    case 'hours':
      return { ...norm, due_at: new Date(now.getTime() + choice.hours * 3_600_000).toISOString() };
    case 'shiftEnd':
      return { ...norm, due_at: shiftEnd(now).toISOString() };
    case 'minutes':
      return { ...norm, due_in_min: choice.minutes };
  }
}
