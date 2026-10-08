import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatInt,
  formatNumber,
  formatPercent,
  formatScore,
  ORDER_FORMS,
  plural,
  SCORE_FORMS,
} from './number';
import {
  ddmm,
  formatDateTime,
  formatDuration,
  formatLeft,
  hhmm,
  isToday,
  periodFor,
  shiftEnd,
  shiftOf,
  shiftStart,
  startOfLocalDay,
} from './time';

describe('time (Asia/Qostanay, UTC+5)', () => {
  it('hhmm shifts by five hours', () => {
    expect(hhmm('2026-10-08T09:05:00Z')).toBe('14:05');
    expect(hhmm('2026-10-08T19:30:00Z')).toBe('00:30');
    expect(ddmm('2026-10-08T19:30:00Z')).toBe('09.10');
    expect(formatDateTime(new Date('2026-10-08T03:00:00Z'))).toBe('08.10 08:00');
  });

  it('formatDuration', () => {
    expect(formatDuration(80)).toBe('1 ч 20 мин');
    expect(formatDuration(45)).toBe('45 мин');
    expect(formatDuration(120)).toBe('2 ч');
    expect(formatDuration(0)).toBe('0 мин');
    expect(formatDuration(-5)).toBe('0 мин');
  });

  it('formatLeft', () => {
    const now = new Date('2026-10-08T10:00:00Z');
    expect(formatLeft('2026-10-08T10:24:00Z', now)).toBe('осталось 24 мин');
    expect(formatLeft('2026-10-08T09:48:00Z', now)).toBe('просрочен на 12 мин');
    expect(formatLeft('2026-10-08T11:30:00Z', now)).toBe('осталось 1 ч 30 мин');
    expect(formatLeft('2026-10-08T10:23:30Z', now)).toBe('осталось 24 мин');
  });

  it('shift boundaries: day 08:00 to 20:00 local', () => {
    expect(shiftOf('2026-10-08T03:00:00Z')).toBe('day'); // 08:00
    expect(shiftOf('2026-10-08T02:59:59Z')).toBe('night'); // 07:59
    expect(shiftOf('2026-10-08T14:59:59Z')).toBe('day'); // 19:59
    expect(shiftOf('2026-10-08T15:00:00Z')).toBe('night'); // 20:00
  });

  it('shiftStart and shiftEnd', () => {
    // 14:00 local → 08:00 local today
    expect(shiftStart('2026-10-08T09:00:00Z').toISOString()).toBe('2026-10-08T03:00:00.000Z');
    // 22:00 local → 20:00 local today
    expect(shiftStart('2026-10-08T17:00:00Z').toISOString()).toBe('2026-10-08T15:00:00.000Z');
    // 03:00 local on the 9th → 20:00 local on the 8th
    expect(shiftStart('2026-10-08T22:00:00Z').toISOString()).toBe('2026-10-08T15:00:00.000Z');
    // 07:59 local on the 1st of a month → 20:00 local on the last day of the previous month
    expect(shiftStart('2026-11-01T02:59:00Z').toISOString()).toBe('2026-10-31T15:00:00.000Z');
    expect(shiftEnd('2026-10-08T09:00:00Z').toISOString()).toBe('2026-10-08T15:00:00.000Z');
  });

  it('local day', () => {
    expect(startOfLocalDay('2026-10-08T20:00:00Z').toISOString()).toBe('2026-10-08T19:00:00.000Z');
    expect(isToday('2026-10-08T19:00:00Z', '2026-10-09T10:00:00Z')).toBe(true);
    expect(isToday('2026-10-08T18:59:00Z', '2026-10-09T10:00:00Z')).toBe(false);
  });

  it('period presets', () => {
    const now = new Date('2026-10-08T09:00:00Z');
    expect(periodFor('shift', now)).toEqual({
      from: '2026-10-08T03:00:00.000Z',
      to: '2026-10-08T09:00:00.000Z',
    });
    expect(periodFor('week', now).from).toBe('2026-10-01T09:00:00.000Z');
  });
});

describe('number', () => {
  it('plural agrees like the SQL', () => {
    expect(formatScore(81)).toBe('81 балл');
    expect(formatScore(82)).toBe('82 балла');
    expect(formatScore(85)).toBe('85 баллов');
    expect(formatScore(11)).toBe('11 баллов');
    expect(formatScore(112)).toBe('112 баллов');
    expect(plural(21, SCORE_FORMS)).toBe('балл');
    expect(formatCount(3, ORDER_FORMS)).toBe('3 наряда');
  });

  it('decimal comma, percent, grouping', () => {
    expect(formatNumber(4.66)).toBe('4,7');
    expect(formatNumber(2)).toBe('2');
    expect(formatPercent(0.425)).toBe('43%');
    expect(formatInt(185000)).toBe('185 000');
  });
});
