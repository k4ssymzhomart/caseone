import { describe, expect, it } from 'vitest';
import { fromLocalDateInput, localDaysPeriod, toLocalDateInput } from './time';

describe('local date inputs (UTC+5)', () => {
  it('reads the local calendar day of an instant', () => {
    // 2026-10-08 19:30 UTC is 2026-10-09 00:30 in Qostanay
    expect(toLocalDateInput('2026-10-08T19:30:00Z')).toBe('2026-10-09');
    expect(toLocalDateInput('2026-10-08T18:59:00Z')).toBe('2026-10-08');
  });

  it('turns a day into its local midnight', () => {
    expect(fromLocalDateInput('2026-10-08')?.toISOString()).toBe('2026-10-07T19:00:00.000Z');
    expect(fromLocalDateInput(' 2026-01-01 ')?.toISOString()).toBe('2025-12-31T19:00:00.000Z');
  });

  it('rejects text that is not a real day', () => {
    expect(fromLocalDateInput('')).toBeNull();
    expect(fromLocalDateInput('2026-02-31')).toBeNull();
    expect(fromLocalDateInput('08.10.2026')).toBeNull();
  });

  it('round trips', () => {
    const d = fromLocalDateInput('2026-03-15');
    expect(d && toLocalDateInput(d)).toBe('2026-03-15');
  });

  it('builds an inclusive period with an exclusive end', () => {
    expect(localDaysPeriod('2026-10-01', '2026-10-08')).toEqual({
      from: '2026-09-30T19:00:00.000Z',
      to: '2026-10-08T19:00:00.000Z',
    });
    // one day
    expect(localDaysPeriod('2026-10-08', '2026-10-08')).toEqual({
      from: '2026-10-07T19:00:00.000Z',
      to: '2026-10-08T19:00:00.000Z',
    });
  });

  it('swaps reversed days and rejects invalid ones', () => {
    expect(localDaysPeriod('2026-10-08', '2026-10-01')).toEqual(localDaysPeriod('2026-10-01', '2026-10-08'));
    expect(localDaysPeriod('nope', '2026-10-01')).toBeNull();
  });
});
