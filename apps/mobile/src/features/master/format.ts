// Small display helpers shared by the master screens.
import { hhmm, shiftEnd, shiftOf, shiftStart, type BrigadeStatusView } from '@rota/shared';

import { t } from '@/lib/i18n';

/** «слесарь» → «Слесарь». */
export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** «Слесарь · 5 разряд», plus «· Бригада 1» when given. Missing parts are left out. */
export function specialtyLine(
  w: { specialty: string | null; grade: number | null },
  brigadeName?: string | null,
): string {
  const parts: string[] = [];
  if (w.specialty && w.grade != null) {
    parts.push(t('master.specialtyGrade', { specialty: capitalize(w.specialty), grade: w.grade }));
  } else if (w.specialty) {
    parts.push(capitalize(w.specialty));
  }
  if (brigadeName) parts.push(brigadeName);
  return parts.join(' · ');
}

/** «День · с 08:00 до 20:00» or «Ночь · с 20:00 до 08:00» (Eyebrow uppercases it). */
export function shiftEyebrow(now: Date): string {
  const key = shiftOf(now) === 'day' ? 'master.shift.eyebrowDay' : 'master.shift.eyebrowNight';
  return t(key, { from: hhmm(shiftStart(now)), to: hhmm(shiftEnd(now)) });
}

/** «Свободны 2 · Заняты 3», or «Не на смене» when nobody of the brigade is on shift. */
export function brigadeCounts(b: BrigadeStatusView): string {
  if (b.on_shift_count === 0) return t('master.brigades.off');
  return t('master.brigades.counts', { free: b.free_count, busy: b.busy_count });
}

/** «Свободны · 3» */
export function groupHeader(label: string, count: number): string {
  return t('master.groupHeader', { label, count });
}
