// Helpers the report pages share (/reports/shift, /reports/rating, /dashboard, /analytics): the period eyebrow and
// number formatters that survive numeric strings and nulls. The shared components live in kit.tsx.
import {
  ddmm,
  formatDateTime,
  formatDuration,
  formatNumber,
  shiftHours,
  shiftOf,
  SHIFT_LABEL,
  type Directories,
  type Period,
  type ReportFilters,
} from '@rota/shared';
import type { FilterPreset } from '@/lib/filters';
import { t } from '@/lib/i18n';

/** A number from a jsonb or numeric column (PostgREST may send numeric as text), or null. */
export function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** «1 ч 20 мин», or «нет данных» when the average has no rows. */
export function minutesText(value: unknown): string {
  const n = num(value);
  return n == null ? t('report.no_data') : formatDuration(n);
}

/** A rating score with one decimal always: «87,6», «79,0», so the column lines up. */
export function scoreText(value: unknown): string {
  return (num(value) ?? 0).toFixed(1).replace('.', ',');
}

/** «12,5 ч». */
export function hoursText(value: unknown): string {
  return t('report.hours', { value: formatNumber(num(value) ?? 0) });
}

/** «87%», or «нет данных». */
export function shareText(value: unknown, digits = 0): string {
  const n = num(value);
  return n == null ? t('report.no_data') : `${formatNumber(n * 100, digits)}%`;
}

/** «2026-10-08» → «08.10.2026». */
function dayText(day: string): string {
  const [y, m, d] = day.split('-');
  return y && m && d ? `${d}.${m}.${y}` : day;
}

/**
 * The mono caps line above a report title: «Смена · День · 08.10 · с 08:00 до 20:00» for the shift preset,
 * «Неделя · с 01.10 14:05 по 08.10 14:06» for rolling ones, «Период · с 01.10.2026 по 08.10.2026» for custom days.
 */
export function periodEyebrow(
  preset: FilterPreset,
  period: Period,
  fromDay: string,
  toDay: string,
): string {
  if (preset === 'shift') {
    const shift = shiftOf(period.from);
    return t('report.eyebrow_shift', {
      shift: SHIFT_LABEL[shift],
      date: ddmm(period.from),
      hours: shiftHours(shift),
    });
  }
  const label = t(`filter.preset.${preset}`);
  if (preset === 'custom')
    return t('report.eyebrow_range', { label, from: dayText(fromDay), to: dayText(toDay) });
  return t('report.eyebrow_range', {
    label,
    from: formatDateTime(period.from),
    to: formatDateTime(period.to),
  });
}

/** «Фильтр: участок «Участок дробления», Бригада 1» for exports, or the no filter line. */
export function filterText(filters: ReportFilters, dirs: Directories | undefined): string {
  const parts: string[] = [];
  if (filters.area_id != null) {
    const name = dirs?.areas.find((a) => a.id === filters.area_id)?.name ?? `№${filters.area_id}`;
    parts.push(t('export.filter.area', { name }));
  }
  if (filters.equipment_id != null) {
    const name = dirs?.equipment.find((e) => e.id === filters.equipment_id)?.name ?? `№${filters.equipment_id}`;
    parts.push(t('export.filter.equipment', { name }));
  }
  if (filters.brigade_id != null) {
    const name = dirs?.brigades.find((b) => b.id === filters.brigade_id)?.name ?? `№${filters.brigade_id}`;
    parts.push(t('export.filter.brigade', { name }));
  }
  if (filters.assignee_id != null) {
    const name = dirs?.employees.find((e) => e.id === filters.assignee_id)?.short_name ?? '';
    if (name) parts.push(t('export.filter.assignee', { name }));
  }
  return parts.length > 0 ? t('export.filter', { parts: parts.join(', ') }) : t('export.filter_all');
}
