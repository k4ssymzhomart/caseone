import { describe, expect, it } from 'vitest';
import directories from '../../seed/directories.json';
import { buildDirectory } from '../_shared/privacy.ts';
import type { InsightCardAnswer } from '../_shared/schemas.ts';
import {
  assembleCards,
  cleanText,
  collectNumbers,
  collectRefs,
  compactRow,
  fillUncovered,
  focusCards,
  hasFindings,
  insightsMessage,
  mergeWithRules,
  rowIdentity,
  normalizeRuleCard,
  numbersIn,
  ungroundedNumbers,
  type AnalyticsBundle,
  type Card,
} from './cards.ts';
import area2 from './fixtures/bundle-30d-area2.json';
import history from './fixtures/bundle-92d.json';
import areas from './fixtures/areas.json';
import { resolveScope, type Scope } from './scope.ts';

const b92 = history.bundle as unknown as AnalyticsBundle;
const b30 = area2.bundle as unknown as AnalyticsBundle;

function scopeOf(
  fx: { from: string; to: string; filters: Record<string, unknown> },
  query: string | null = null,
): Scope {
  return resolveScope({
    period: { from: Date.parse(fx.from), to: Date.parse(fx.to) },
    filters: fx.filters as Scope['filters'],
    query,
    reading: null,
    parsedBy: query ? 'rules' : null,
    areas,
  });
}

const s92 = scopeOf(history);
const s30 = scopeOf(area2, 'покажи проблемы участка дробления за месяц');
const rules92 = (history.rules as unknown[]).map(normalizeRuleCard).filter((c): c is Card => !!c);
const rules30 = (area2.rules as unknown[]).map(normalizeRuleCard).filter((c): c is Card => !!c);

const card = (over: Partial<InsightCardAnswer>): InsightCardAnswer => ({
  kind: 'top_equipment',
  severity: 'critical',
  title: 'Конвейер К-3 ломается чаще всех',
  body: 'Конвейер К-3: 7 внеплановых остановок за 30 дней, 5 из них шифр М-02 (подшипник).',
  recommendation: 'Рекомендуем проверить соосность привода и включить в план ППР.',
  refs: ['top_equipment.0'],
  ...over,
});

describe('numbers', () => {
  it('reads decimals, percents, times and dates', () => {
    expect(numbersIn('в 2,6 раза чаще, 41% ремонтов, пик с 02:00 до 05:00')).toEqual([
      2, 0, 5, 0, 2.6, 41,
    ]);
    expect(numbersIn('с 08.07.2026 по 7 октября')).toEqual([8, 7, 2026, 7]);
    expect(numbersIn('Конвейер К-3, шифр М-02, ВДН-12,5')).toEqual([3, 2, 12.5]);
    expect(numbersIn('простой 87 ч')).toEqual([87]);
  });

  it('collects numbers from values, strings and keys, never from ids', () => {
    const got = collectNumbers({
      first_2_weeks: 1,
      name: 'Насос ЦНС-300 №2',
      order_ids: [999],
      id: '77',
    });
    expect(got).toEqual(expect.arrayContaining([2, 1, 300]));
    expect(got).not.toContain(999);
    expect(got).not.toContain(77);
  });
});

describe('the model input', () => {
  it('has rows to cite and finds something in the history', () => {
    expect(hasFindings(b92)).toBe(true);
    expect(hasFindings({ top_areas: [{ unplanned: 3 }], top_equipment: [] })).toBe(false);
    const refs = collectRefs(b92, [], s92);
    expect(refs.get('top_equipment.0')?.compact).toMatchObject({
      name: 'Конвейер К-3',
      unplanned: 21,
    });
    expect(refs.has('top_areas.0')).toBe(true);
    expect(refs.has('repeat_faults.8')).toBe(false); // 8 rows at most
    expect(refs.get('post_ppr.1')?.compact).toMatchObject({
      name: 'Дробилка КМД-1750 №2',
      planned: 13,
      followed_count: 8,
      followed_pct: 62,
      unit_base_pct: 17,
    });
    expect(refs.get('worker_repeats.0')?.compact).toMatchObject({
      who: 'E06',
      repeat_pct: 41,
      team_pct: 14,
    });
  });

  it('sends no ids and, after the privacy gateway, no names', () => {
    const msg = insightsMessage(s92, collectRefs(b92, [], s92));
    expect(msg).not.toContain('order_ids');
    expect(msg).not.toContain('employee_id');
    expect(msg).not.toContain('Сериков');
    expect(msg).toContain('Период: 3 месяца, с 8 июля 2026 по 7 октября 2026');
    const redacted = buildDirectory(directories.employees).redact(msg);
    for (const e of directories.employees) expect(redacted).not.toContain(e.short_name);
    // about 2 500 input tokens with the system prompt: the call stays cheap
    expect(msg.length).toBeLessThan(9000);
  });

  it('sends only the focus detectors when they found something', () => {
    const refs = collectRefs(b92, ['trend'], s92);
    expect([...refs.keys()]).toEqual(['trend.0']);
    // a focus that found nothing falls back to every detector
    expect(collectRefs(b30, ['worker_repeats'], s30).size).toBeGreaterThan(1);
  });

  it('leaves top_areas out inside one area and names the question', () => {
    const refs = collectRefs(b30, [], s30);
    expect([...refs.keys()].some((k) => k.startsWith('top_areas'))).toBe(false);
    const msg = insightsMessage(s30, refs);
    expect(msg).toContain('Участок: Участок дробления.');
    expect(msg).toContain('Вопрос руководителя: «покажи проблемы участка дробления за месяц».');
  });

  it('compacts a materials row without the worker id', () => {
    const row = (b92.materials as Record<string, unknown>[])[0]!;
    const c = compactRow('materials', row, 'materials.0');
    expect(c).not.toHaveProperty('id');
    expect(c).toMatchObject({ who_kind: 'исполнитель', ratio: 2.2, reference_qty: 0.8 });
  });
});

describe('the model answer', () => {
  const refs30 = collectRefs(b30, [], s30);
  const refs92 = collectRefs(b92, [], s92);

  it('keeps the case example and copies the evidence from the row', () => {
    const { cards, dropped } = assembleCards({ cards: [card({})] }, refs30, s30);
    expect(dropped).toEqual([]);
    expect(cards).toHaveLength(1);
    const c = cards[0]!;
    expect(c.kind).toBe('top_equipment');
    expect(c.evidence.order_ids).toHaveLength(7);
    expect(c.evidence.stats).toMatchObject({
      equipment_id: 13,
      unplanned: 7,
      refs: ['top_equipment.0'],
    });
    expect(c.evidence.stats).not.toHaveProperty('order_ids');
  });

  it('accepts rounded and percent forms of the row numbers and the detector windows', () => {
    const text = [
      'Дробилка КМД-1750 №2: после 8 из 13 ППР отказ в течение 5 дней (62%), в остальное время 17%.',
      'В 3,6 раза чаще. ППР делала бригада 3.',
    ].join(' ');
    expect(ungroundedNumbers(text, [refs92.get('post_ppr.1')!], [])).toEqual([]);
    expect(
      ungroundedNumbers(
        'Простой 87 ч, в 3 раза больше медианы 7.',
        [refs92.get('top_equipment.0')!],
        [],
      ),
    ).toEqual([]);
  });

  it('drops a card with a number the rows do not hold and puts the rules card in its place', () => {
    const assembled = assembleCards(
      {
        cards: [
          card({ body: 'Конвейер К-3: 12 внеплановых остановок за 30 дней.' }),
          card({
            kind: 'trend',
            title: 'Грохот ГИЛ-52: отказов больше',
            body: 'Грохот ГИЛ-52: за последние 2 недели 4 отказа против 1 за первые две.',
            recommendation: 'Запланировать диагностику до отказа.',
            refs: ['trend.0'],
          }),
        ],
      },
      refs30,
      s30,
    );
    expect(assembled.cards.map((c) => c.kind)).toEqual(['trend']);
    expect(assembled.dropped).toEqual([
      { kind: 'top_equipment', reason: 'ungrounded', index: 0, numbers: [12] },
    ]);
    const merged = mergeWithRules(assembled, rules30);
    expect(merged.replaced).toBe(1);
    expect(merged.cards.map((c) => c.kind)).toEqual(['top_equipment', 'trend']);
    expect(merged.cards[0]!.title).toBe(rules30.find((r) => r.kind === 'top_equipment')!.title);
  });

  it('drops unknown refs, duplicates and empty text; takes the kind of the main row', () => {
    const { cards, dropped } = assembleCards(
      {
        cards: [
          card({ refs: ['top_equipment.9'] }),
          card({ kind: 'repeat_faults', refs: ['top_equipment.0', 'repeat_faults.0'] }),
          card({ title: ' ' }),
          card({
            kind: 'repeat_faults',
            body: 'Конвейер К-3: шифр М-02 повторился 5 раз за 30 дней.',
            refs: ['repeat_faults.0'],
          }),
        ],
      },
      refs30,
      s30,
    );
    expect(cards.map((c) => c.kind)).toEqual(['repeat_faults']);
    expect(cards[0]!.evidence.stats.refs).toEqual(['repeat_faults.0', 'top_equipment.0']);
    expect(dropped.map((d) => d.reason)).toEqual(['no_refs', 'empty', 'duplicate']);
  });

  it('keeps only known severities and at most 8 cards', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      card({
        kind: 'repeat_faults',
        severity: 'urgent' as never,
        title: `Повтор ${i}`,
        body: 'Шифр повторился.',
        refs: [`repeat_faults.${i % 8}`],
      }),
    );
    const { cards } = assembleCards({ cards: many }, refs92, s92);
    expect(cards).toHaveLength(8);
    expect(cards.every((c) => c.severity === 'info')).toBe(true);
  });

  it('cleans dashes out of the copy but keeps codes', () => {
    expect(cleanText(' Конвейер К-3 — 7 остановок ,  шифр М-02 ')).toBe(
      'Конвейер К-3, 7 остановок, шифр М-02',
    );
  });

  it('writes decimals with a comma and drops the doubled period after a short name', () => {
    expect(cleanText('254.7 часа простоя, в 2.5 раза, с 08.07.2026')).toBe(
      '254,7 часа простоя, в 2,5 раза, с 08.07.2026',
    );
    expect(cleanText('по 55 нарядам исполнителя Касымов Б..')).toBe(
      'по 55 нарядам исполнителя Касымов Б.',
    );
    expect(cleanText('и так далее...')).toBe('и так далее...');
  });

  it('filters by focus unless nothing is left', () => {
    expect(focusCards(rules92, ['trend']).map((c) => c.kind)).toEqual(['trend']);
    expect(focusCards(rules92, ['top_areas'])).toHaveLength(rules92.length);
    expect(focusCards(rules92, [])).toHaveLength(rules92.length);
  });

  it('adds rules cards for the findings the model left out', () => {
    const { cards } = assembleCards(
      {
        cards: [
          card({
            body: 'Конвейер К-3: 21 внеплановая остановка за 3 месяца, 15 из них шифр М-02.',
            refs: ['top_equipment.0'],
          }),
          card({
            kind: 'materials',
            title: 'Перерасход смазки: Касымов Б.',
            body: 'Литол-24 по С-01 в 2,2 раза выше нормы, 55 нарядов.',
            refs: ['materials.0'],
          }),
        ],
      },
      refs92,
      s92,
    );
    expect(cards).toHaveLength(2);
    const plain = cards.map(({ index: _i, ...c }) => c);
    const full = fillUncovered(plain, rules92, refs92, []);
    // К-3 and the Литол-24 finding (worker and brigade rows alike) are covered; the other five come as rules cards
    expect(full.filled).toBe(5);
    expect(full.cards.map((c) => c.kind)).toEqual([
      'top_equipment',
      'materials',
      'repeat_faults',
      'post_ppr',
      'time_patterns',
      'worker_repeats',
      'trend',
    ]);
    expect(fillUncovered(plain, rules92, refs92, ['trend']).cards.map((c) => c.kind)).toEqual([
      'top_equipment',
      'materials',
      'trend',
    ]);
    expect(
      rowIdentity('materials', { kind: 'worker', id: 'x', code: 'С-01', material_id: 18 }),
    ).toBe(rowIdentity('materials', { kind: 'brigade', id: '1', code: 'С-01', material_id: 18 }));
  });

  it('reads the rules cards of insight_cards', () => {
    expect(rules92.map((c) => c.kind)).toEqual([
      'top_equipment',
      'repeat_faults',
      'post_ppr',
      'time_patterns',
      'worker_repeats',
      'materials',
      'trend',
    ]);
    expect(rules92[0]!.evidence.order_ids).toHaveLength(21);
    expect(normalizeRuleCard({ kind: 'x' })).toBeNull();
  });
});
