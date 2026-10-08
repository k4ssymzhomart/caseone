// Time helpers for Asia/Qostanay: UTC+5 all year, a fixed offset. Never Intl time zones (Hermes support varies):
// shift the instant by +5 h and read it with the getUTC* getters.
// Shifts: day 08:00 to 20:00, night 20:00 to 08:00 local.

import type { Shift } from '../domain/enums';
import type { Period } from '../domain/types';
import { plural } from './number';

export const QOSTANAY_OFFSET_MIN = 300;
const OFFSET_MS = QOSTANAY_OFFSET_MIN * 60_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const DAY_SHIFT_START_HOUR = 8;
export const NIGHT_SHIFT_START_HOUR = 20;

export type DateInput = Date | string | number;

export function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/** The same instant shifted to local wall time; read it only with getUTC* getters. */
function local(value: DateInput): Date {
  return new Date(toDate(value).getTime() + OFFSET_MS);
}

/** UTC instant of a local wall time. */
function fromLocal(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month, day, hour, minute) - OFFSET_MS);
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** «14:05» local. */
export function hhmm(value: DateInput): string {
  const d = local(value);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** «08.10» local. */
export function ddmm(value: DateInput): string {
  const d = local(value);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`;
}

/** «08.10.2026» local. */
export function formatDate(value: DateInput): string {
  const d = local(value);
  return `${ddmm(value)}.${d.getUTCFullYear()}`;
}

/** «08.10 14:05» local. */
export function formatDateTime(value: DateInput): string {
  return `${ddmm(value)} ${hhmm(value)}`;
}

/** Local hour 0..23. */
export function localHour(value: DateInput): number {
  return local(value).getUTCHours();
}

/** «45 мин», «2 ч», «1 ч 20 мин». Rounds to whole minutes; negative values count as 0. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} мин`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/** Whole minutes from `from` to `to` (floor). */
export function minutesBetween(from: DateInput, to: DateInput): number {
  return Math.floor((toDate(to).getTime() - toDate(from).getTime()) / MINUTE);
}

/** «осталось 24 мин» before the deadline, «просрочен на 12 мин» after it. */
export function formatLeft(due: DateInput, now: DateInput = new Date()): string {
  const diffMin = (toDate(due).getTime() - toDate(now).getTime()) / MINUTE;
  if (diffMin >= 0) return `осталось ${formatDuration(Math.ceil(diffMin))}`;
  return `просрочен на ${formatDuration(Math.floor(-diffMin))}`;
}

/** Day shift 08:00 to 20:00 local, night otherwise. */
export function shiftOf(value: DateInput): Shift {
  const h = localHour(value);
  return h >= DAY_SHIFT_START_HOUR && h < NIGHT_SHIFT_START_HOUR ? 'day' : 'night';
}

/** Start of the shift that contains `now`: today 08:00, today 20:00 or yesterday 20:00 local. */
export function shiftStart(now: DateInput = new Date()): Date {
  const d = local(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const h = d.getUTCHours();
  if (h >= DAY_SHIFT_START_HOUR && h < NIGHT_SHIFT_START_HOUR)
    return fromLocal(y, m, day, DAY_SHIFT_START_HOUR);
  if (h >= NIGHT_SHIFT_START_HOUR) return fromLocal(y, m, day, NIGHT_SHIFT_START_HOUR);
  return fromLocal(y, m, day - 1, NIGHT_SHIFT_START_HOUR);
}

/** End of the shift that contains `now` (start + 12 h). */
export function shiftEnd(now: DateInput = new Date()): Date {
  return new Date(shiftStart(now).getTime() + 12 * HOUR);
}

/** Local midnight of the day that contains `now`. */
export function startOfLocalDay(now: DateInput = new Date()): Date {
  const d = local(now);
  return fromLocal(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Is the instant on the same local calendar day as `now`? */
export function isToday(value: DateInput, now: DateInput = new Date()): boolean {
  const start = startOfLocalDay(now).getTime();
  const t = toDate(value).getTime();
  return t >= start && t < start + DAY;
}

/** Report filter presets: смена, сутки, неделя, месяц (CLAUDE.md §14). `to` is now. */
export const PERIOD_PRESETS = ['shift', 'day', 'week', 'month'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_PRESET_LABEL: Readonly<Record<PeriodPreset, string>> = {
  shift: 'Смена',
  day: 'Сутки',
  week: 'Неделя',
  month: 'Месяц',
};

export function periodFor(preset: PeriodPreset, now: DateInput = new Date()): Period {
  const end = toDate(now);
  const from =
    preset === 'shift'
      ? shiftStart(end)
      : new Date(end.getTime() - (preset === 'day' ? 1 : preset === 'week' ? 7 : 30) * DAY);
  return { from: from.toISOString(), to: end.toISOString() };
}

/** «час», «часа», «часов» for prose; the UI itself always writes «ч» and «мин». */
export function hoursWord(n: number): string {
  return plural(n, ['час', 'часа', 'часов']);
}
