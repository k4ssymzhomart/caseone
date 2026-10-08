import { describe, expect, it } from 'vitest';
import areas from './fixtures/areas.json';
import {
  areaStems,
  cacheKey,
  cacheTtlMs,
  DAY_MS,
  digestPeriod,
  localDay,
  parseQueryMessage,
  periodDays,
  periodLabel,
  qostanayIso,
  readingFromAnswer,
  requestPeriod,
  resolveScope,
  ruleReading,
  sanitizeFilters,
  sanitizeQuery,
  shiftStart,
} from './scope.ts';

// 2026-10-16 10:00 Asia/Qostanay (Demo Day morning)
const NOW = Date.parse('2026-10-16T05:00:00Z');

describe('time', () => {
  it('prints Asia/Qostanay ISO and local days', () => {
    expect(qostanayIso(NOW)).toBe('2026-10-16T10:00:00+05:00');
    expect(localDay(Date.parse('2026-10-15T19:30:00Z'))).toBe('2026-10-16');
  });

  it('finds the shift start', () => {
    expect(new Date(shiftStart(NOW)).toISOString()).toBe('2026-10-16T03:00:00.000Z');
    expect(new Date(shiftStart(Date.parse('2026-10-16T16:00:00Z'))).toISOString()).toBe(
      '2026-10-16T15:00:00.000Z',
    );
    // 02:00 local belongs to the night shift that began at 20:00 the day before
    expect(new Date(shiftStart(Date.parse('2026-10-15T21:00:00Z'))).toISOString()).toBe(
      '2026-10-15T15:00:00.000Z',
    );
  });

  it('labels periods like internal.period_label', () => {
    expect(periodLabel(NOW - 7 * DAY_MS, NOW)).toBe('неделю');
    expect(periodLabel(NOW - 30 * DAY_MS, NOW)).toBe('30 дней');
    expect(periodLabel(NOW - 92 * DAY_MS, NOW)).toBe('3 месяца');
    expect(periodLabel(NOW - 1 * DAY_MS, NOW)).toBe('1 день');
    expect(periodLabel(NOW - 14 * DAY_MS, NOW)).toBe('14 дней');
    expect(periodLabel(NOW - 3 * DAY_MS, NOW)).toBe('3 дня');
  });

  it('gives the digest the 7 local days before Monday', () => {
    // Monday 2026-10-19 03:00 UTC = 08:00 local, the cron time
    const p = digestPeriod(Date.parse('2026-10-19T03:00:00Z'));
    expect(qostanayIso(p.from)).toBe('2026-10-12T00:00:00+05:00');
    expect(qostanayIso(p.to)).toBe('2026-10-19T00:00:00+05:00');
  });
});

describe('request body', () => {
  it('keeps the four filter keys, checked', () => {
    expect(
      sanitizeFilters({
        area_id: 2,
        equipment_id: '13',
        brigade_id: -1,
        assignee_id: 'not-a-uuid',
        extra: 'x',
      }),
    ).toEqual({ area_id: 2, equipment_id: 13 });
    expect(sanitizeFilters({ assignee_id: '1D8CDD85-A387-40CE-B84A-B67737DA5BD0' })).toEqual({
      assignee_id: '1d8cdd85-a387-40ce-b84a-b67737da5bd0',
    });
    expect(sanitizeFilters(null)).toEqual({});
  });

  it('reads the period or falls back to 30 days', () => {
    const p = requestPeriod({ from: '2026-07-07T19:00:00Z', to: '2026-10-07T19:00:00Z' }, NOW);
    expect(p.to - p.from).toBe(92 * DAY_MS);
    expect(requestPeriod({}, NOW)).toEqual({ from: NOW - 30 * DAY_MS, to: NOW });
    // reversed or broken periods are not trusted
    expect(
      requestPeriod({ from: '2026-10-10T00:00:00Z', to: '2026-10-01T00:00:00Z' }, NOW),
    ).toEqual({
      from: NOW - 30 * DAY_MS,
      to: NOW,
    });
    // a period ending far in the future ends now (plus the minute slack)
    const f = requestPeriod({ from: '2026-10-01T00:00:00Z', to: '2027-01-01T00:00:00Z' }, NOW);
    expect(f.to).toBe(NOW + 120_000);
  });

  it('cleans the question', () => {
    expect(sanitizeQuery('  покажи\n\tпроблемы  ')).toBe('покажи проблемы');
    expect(sanitizeQuery('   ')).toBeNull();
    expect(sanitizeQuery(42)).toBeNull();
    expect(sanitizeQuery('я'.repeat(500))?.length).toBe(300);
  });
});

describe('the keyword reader', () => {
  it('stems area names', () => {
    expect(areaStems('Участок дробления')).toEqual(['дробл']);
    expect(areaStems('Карьер')).toEqual(['карье']);
  });

  it('reads the demo question', () => {
    const r = ruleReading('покажи проблемы участка дробления за месяц', NOW, areas);
    expect(r.area_id).toBe(2);
    expect(r.period).toEqual({ from: NOW - 30 * DAY_MS, to: NOW });
    expect(r.focus).toEqual([]);
  });

  it.each([
    ['за неделю', 7],
    ['за 2 недели', 14],
    ['за месяц', 30],
    ['за два месяца', 60],
    ['за 3 месяца', 92],
    ['за три месяца', 92],
    ['за квартал', 92],
    ['за 10 дней', 10],
    ['за сутки', 1],
    ['сегодня', 1],
    ['за год', 365],
  ])('«%s» is %i days', (q, days) => {
    expect(periodDays(q)).toBe(days);
  });

  it('reads «за смену» from the shift start and no period at all', () => {
    expect(periodDays('что было за смену')).toBe('shift');
    expect(ruleReading('что было за смену', NOW, areas).period).toEqual({
      from: shiftStart(NOW),
      to: NOW,
    });
    expect(ruleReading('где больше всего отказов', NOW, areas).period).toBeNull();
  });

  it('reads the focus and does not take equipment for an area', () => {
    const r = ruleReading('электрические отказы ночью на обогащении', NOW, areas);
    expect(r.area_id).toBe(3);
    expect(r.focus).toEqual(['time_patterns']);
    expect(ruleReading('почему ломаются дробилки', NOW, areas).area_id).toBeNull();
    expect(ruleReading('перерасход смазки по бригадам', NOW, areas).focus).toEqual(['materials']);
    expect(ruleReading('у какого оборудования растёт число отказов', NOW, areas).focus).toEqual([
      'top_equipment',
      'trend',
    ]);
  });
});

describe('the model reading', () => {
  it('keeps a known area, a sane period and detector kinds', () => {
    const r = readingFromAnswer(
      {
        area_id: 2,
        from: '2026-09-16T10:00:00+05:00',
        to: '2026-10-16T10:00:00+05:00',
        focus: ['top_equipment', 'other'],
      },
      NOW,
      areas,
    );
    expect(r).toEqual({
      area_id: 2,
      period: { from: NOW - 30 * DAY_MS, to: NOW },
      focus: ['top_equipment'],
    });
  });

  it('drops an unknown area and a broken period', () => {
    const r = readingFromAnswer(
      { area_id: 9, from: '2026-10-20T10:00:00+05:00', to: null, focus: [] },
      NOW,
      areas,
    );
    expect(r.area_id).toBeNull();
    expect(r.period).toBeNull();
    expect(
      readingFromAnswer({ area_id: null, from: 'вчера', to: null, focus: [] }, NOW, areas).period,
    ).toBeNull();
  });

  it('builds the parse message with the clock and the areas', () => {
    const m = parseQueryMessage('покажи проблемы', NOW, areas);
    expect(m).toContain('Вопрос: «покажи проблемы»');
    expect(m).toContain('Текущее время: 2026-10-16T10:00:00+05:00');
    expect(m).toContain('2 Участок дробления');
  });
});

describe('scope and cache', () => {
  const base = { from: NOW - 30 * DAY_MS, to: NOW };

  it('lets the question override the period and the area', () => {
    const reading = ruleReading('покажи проблемы участка дробления за 3 месяца', NOW, areas);
    const s = resolveScope({
      period: base,
      filters: { area_id: 1, brigade_id: 2 },
      query: 'покажи проблемы участка дробления за 3 месяца',
      reading,
      parsedBy: 'rules',
      areas,
    });
    expect(s.filters).toEqual({ area_id: 2, brigade_id: 2 });
    expect(s.area_name).toBe('Участок дробления');
    expect(s.label).toBe('3 месяца');
    expect(s.parsed_by).toBe('rules');
  });

  it('keeps the request scope without a question', () => {
    const s = resolveScope({
      period: base,
      filters: {},
      query: null,
      reading: null,
      parsedBy: 'llm',
      areas,
    });
    expect(s).toMatchObject({
      label: '30 дней',
      area_name: null,
      focus: [],
      query: null,
      parsed_by: null,
    });
  });

  it('shares a cache key within the hour of a rolling window, not across areas or focus', () => {
    const s1 = resolveScope({
      period: base,
      filters: {},
      query: null,
      reading: null,
      parsedBy: null,
      areas,
    });
    const later = { from: base.from + 20 * 60_000, to: base.to + 20 * 60_000 };
    const s2 = resolveScope({
      period: later,
      filters: {},
      query: null,
      reading: null,
      parsedBy: null,
      areas,
    });
    expect(cacheKey(s1, NOW, 'i1')).toBe(cacheKey(s2, NOW + 20 * 60_000, 'i1'));
    const s3 = resolveScope({
      period: base,
      filters: { area_id: 2 },
      query: null,
      reading: null,
      parsedBy: null,
      areas,
    });
    expect(cacheKey(s3, NOW, 'i1')).not.toBe(cacheKey(s1, NOW, 'i1'));
    const s4 = { ...s1, focus: ['trend' as const] };
    expect(cacheKey(s4, NOW, 'i1')).not.toBe(cacheKey(s1, NOW, 'i1'));
    // a past window keeps its own end
    expect(cacheKey(s1, NOW + 3 * DAY_MS, 'i1')).toContain('2026-10-16T10:00:00+05:00');
  });

  it('caches a tenth of the period, capped', () => {
    const s = resolveScope({
      period: base,
      filters: {},
      query: null,
      reading: null,
      parsedBy: null,
      areas,
    });
    expect(cacheTtlMs(s, 6 * 3_600_000)).toBe(6 * 3_600_000);
    const shift = resolveScope({
      period: { from: NOW - 12 * 3_600_000, to: NOW },
      filters: {},
      query: null,
      reading: null,
      parsedBy: null,
      areas,
    });
    expect(cacheTtlMs(shift, 6 * 3_600_000)).toBe(72 * 60_000);
  });
});
