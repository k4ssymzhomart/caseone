// Small display helpers of the master pages (shift, board, order, equipment): the shift eyebrow, the specialty line,
// initials for the avatar circle.
import { SHIFT_LABEL, shiftHours, shiftOf } from '@rota/shared';
import { t } from './strings';

/** «слесарь» → «Слесарь». */
export function capitalize(s: string): string {
  const v = s.trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
}

/** «День · с 08:00 до 20:00» (the eyebrow style uppercases it). */
export function shiftEyebrow(now: Date): string {
  const shift = shiftOf(now);
  return t('shift.eyebrow', { shift: SHIFT_LABEL[shift], hours: shiftHours(shift) });
}

/** «Слесарь · 5 разряд», plus «· Бригада 1» when given. Missing parts are left out. */
export function specialtyLine(
  w: { specialty: string | null; grade: number | null },
  brigadeName?: string | null,
): string {
  const parts: string[] = [];
  if (w.specialty && w.grade != null) {
    parts.push(t('shift.specialty_grade', { specialty: capitalize(w.specialty), grade: w.grade }));
  } else if (w.specialty) {
    parts.push(capitalize(w.specialty));
  }
  if (brigadeName) parts.push(brigadeName);
  return parts.join(' · ');
}

/** «Ахметов Е.» → «АЕ». */
export function initials(shortName: string): string {
  const letters = shortName
    .replace(/\./g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase());
  return letters.slice(0, 2).join('');
}
