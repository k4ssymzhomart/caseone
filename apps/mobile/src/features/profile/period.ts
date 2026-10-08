import type { Period } from '@rota/shared';

const HOUR = 3_600_000;
const DAYS_30 = 30 * 24 * HOUR;

/**
 * Start of «the last 30 days», rounded down to the hour so a query key built from it stays the same across
 * mounts within the hour. The end of the window is taken at fetch time (periodFrom).
 */
export function last30DaysFrom(now: number = Date.now()): string {
  return new Date(Math.floor((now - DAYS_30) / HOUR) * HOUR).toISOString();
}

export function periodFrom(from: string): Period {
  return { from, to: new Date().toISOString() };
}
