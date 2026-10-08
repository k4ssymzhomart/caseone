import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatInt,
  formatNumber,
  formatOrderNo,
  formatOutOf,
  formatPercent,
  formatQty,
  formatScore,
  INSIGHT_FORMS,
  ORDER_FORMS,
  plural,
  ruNum,
  SCORE_FORMS,
} from './number';
import {
  addMinutes,
  ddmm,
  formatAgo,
  formatDate,
  formatDateTime,
  formatDeadline,
  formatDue,
  formatDuration,
  formatLeft,
  formatNorm,
  fromLocalParts,
  hhmm,
  isSameLocalDay,
  isToday,
  localParts,
  minutesBetween,
  minutesUntil,
  periodFor,
  SHIFT_LABEL,
  shiftEnd,
  shiftHours,
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

describe('time: boundaries and screen helpers', () => {
  it('shift switches exactly at 08:00 and 20:00 local', () => {
    // 08:00:00 local starts the day shift; one millisecond earlier is still the night shift from 20:00 yesterday
    expect(shiftStart('2026-10-08T03:00:00.000Z').toISOString()).toBe('2026-10-08T03:00:00.000Z');
    expect(shiftStart('2026-10-08T02:59:59.999Z').toISOString()).toBe('2026-10-07T15:00:00.000Z');
    expect(shiftOf('2026-10-08T02:59:59.999Z')).toBe('night');
    // 20:00:00 local starts the night shift; 19:59:59.999 is still day
    expect(shiftStart('2026-10-08T15:00:00.000Z').toISOString()).toBe('2026-10-08T15:00:00.000Z');
    expect(shiftStart('2026-10-08T14:59:59.999Z').toISOString()).toBe('2026-10-08T03:00:00.000Z');
    // midnight local belongs to the night shift that began at 20:00 the day before
    expect(shiftOf('2026-10-08T19:00:00Z')).toBe('night');
    expect(shiftStart('2026-10-08T19:00:00Z').toISOString()).toBe('2026-10-08T15:00:00.000Z');
    expect(shiftEnd('2026-10-08T19:00:00Z').toISOString()).toBe('2026-10-09T03:00:00.000Z');
    // a year boundary
    expect(shiftStart('2027-01-01T01:00:00Z').toISOString()).toBe('2026-12-31T15:00:00.000Z');
  });

  it('shift labels and hours', () => {
    expect(SHIFT_LABEL.day).toBe('День');
    expect(SHIFT_LABEL.night).toBe('Ночь');
    expect(shiftHours('day')).toBe('с 08:00 до 20:00');
    expect(shiftHours('night')).toBe('с 20:00 до 08:00');
  });

  it('durations from the copy rules', () => {
    expect(formatDuration(80)).toBe('1 ч 20 мин');
    expect(formatDuration(130)).toBe('2 ч 10 мин');
    expect(formatDuration(59.6)).toBe('1 ч');
    expect(formatNorm(3)).toBe('3 ч');
    expect(formatNorm(1.5)).toBe('1 ч 30 мин');
    expect(formatNorm(0.5)).toBe('30 мин');
  });

  it('left and overdue', () => {
    const now = '2026-10-08T06:00:00Z';
    expect(formatLeft('2026-10-08T06:24:00Z', now)).toBe('осталось 24 мин');
    expect(formatLeft('2026-10-08T05:48:00Z', now)).toBe('просрочен на 12 мин');
    expect(formatLeft('2026-10-08T05:47:30Z', now)).toBe('просрочен на 12 мин');
    expect(formatLeft('2026-10-08T04:40:00Z', now)).toBe('просрочен на 1 ч 20 мин');
    expect(formatLeft(now, now)).toBe('осталось 0 мин');
    expect(minutesUntil('2026-10-08T06:00:01Z', now)).toBe(1);
    expect(minutesUntil('2026-10-08T05:59:00Z', now)).toBe(-1);
    expect(minutesBetween('2026-10-08T05:59:01Z', now)).toBe(0);
  });

  it('deadline and due', () => {
    const now = new Date('2026-10-08T04:30:00Z'); // 09:30 local
    expect(formatDue('2026-10-08T06:30:00Z', now)).toBe('до 11:30');
    expect(formatDue('2026-10-09T04:30:00Z', now)).toBe('до 09.10 09:30');
    expect(formatDeadline(addMinutes(now, 120), now)).toBe('2 ч · до 11:30');
    expect(formatDeadline(addMinutes(now, 1), now)).toBe('1 мин · до 09:31');
  });

  it('ago', () => {
    const now = '2026-10-08T09:00:00Z'; // 14:00 local
    expect(formatAgo('2026-10-08T08:59:30Z', now)).toBe('только что');
    expect(formatAgo('2026-10-08T08:55:00Z', now)).toBe('5 мин назад');
    expect(formatAgo('2026-10-08T04:05:00Z', now)).toBe('09:05');
    expect(formatAgo('2026-10-07T09:05:00Z', now)).toBe('вчера 14:05');
    expect(formatAgo('2026-10-06T09:05:00Z', now)).toBe('06.10 14:05');
  });

  it('local parts round trip', () => {
    const p = localParts('2026-10-08T19:30:00Z');
    expect(p).toEqual({ year: 2026, month: 10, day: 9, hour: 0, minute: 30 });
    expect(fromLocalParts(p).toISOString()).toBe('2026-10-08T19:30:00.000Z');
    expect(fromLocalParts({ year: 2026, month: 10, day: 8, hour: 20, minute: 0 }).toISOString()).toBe(
      '2026-10-08T15:00:00.000Z',
    );
    expect(formatDate('2026-12-31T19:00:00Z')).toBe('01.01.2027');
    expect(isSameLocalDay('2026-10-08T19:00:00Z', '2026-10-09T18:59:59Z')).toBe(true);
    expect(isSameLocalDay('2026-10-08T18:59:59Z', '2026-10-08T19:00:00Z')).toBe(false);
  });
});

describe('number', () => {
  it('plural forms 81 балл, 82 балла, 85 баллов', () => {
    expect(plural(81, SCORE_FORMS)).toBe('балл');
    expect(plural(82, SCORE_FORMS)).toBe('балла');
    expect(plural(85, SCORE_FORMS)).toBe('баллов');
    expect(plural(0, SCORE_FORMS)).toBe('баллов');
    expect(plural(14, SCORE_FORMS)).toBe('баллов');
    expect(plural(101, SCORE_FORMS)).toBe('балл');
    expect(formatCount(1, INSIGHT_FORMS)).toBe('1 вывод');
    expect(formatCount(4, INSIGHT_FORMS)).toBe('4 вывода');
    expect(formatCount(7, INSIGHT_FORMS)).toBe('7 выводов');
  });

  it('order number, out of, quantities like internal.ru_num', () => {
    expect(formatOrderNo(147)).toBe('№147');
    expect(formatOutOf(85, 100)).toBe('85 из 100');
    expect(formatOutOf(4, 5)).toBe('4 из 5');
    expect(formatQty(2, 'шт')).toBe('2 шт');
    expect(formatQty(0.5, 'кг')).toBe('0,5 кг');
    expect(ruNum(6)).toBe('6');
    expect(ruNum(1.25)).toBe('1,25');
    expect(ruNum(0.1 + 0.2)).toBe('0,3');
  });
});

describe('number (existing)', () => {
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
