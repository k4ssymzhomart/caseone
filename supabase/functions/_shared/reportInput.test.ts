import { describe, expect, it } from 'vitest';
import directories from '../../seed/directories.json';
import { createLlm } from './llm.ts';
import { buildDirectory, type DirectoryEmployee } from './privacy.ts';
import {
  buildExplainText,
  buildShiftSummaryText,
  cleanText,
  filterLine,
  localStamp,
  matchCachedSummary,
  median,
  normalizeExplanation,
  normalizeShiftSummary,
  numbersIn,
  parseExplainBody,
  parseFilters,
  parseSummaryBody,
  ratingContext,
  shiftLabel,
  SUMMARY_CACHE_TTL_MS,
  summaryInsightRow,
  unknownNumbers,
  workloadCovered,
  type CachedSummaryRow,
  type SummaryScope,
} from './reportInput.ts';
import { AKHMETOV, IVANOV, REPORT } from './reportFixtures.ts';
import {
  NO_RATING_TEXT,
  templateExplainRating,
  templateShiftSummary,
  type RatingRowData,
  type ShiftReportData,
} from './reportText.ts';

const SCOPE: SummaryScope = {
  from: '2026-10-09T03:00:00.000Z',
  to: '2026-10-09T09:06:00.000Z',
  filters: {},
};

const NOW = new Date('2026-10-09T09:05:30.000Z'); // 14:05 local

describe('request bodies', () => {
  it('parses the summary body and normalizes the timestamps', () => {
    const r = parseSummaryBody({
      from: '2026-10-09T08:00:00+05:00',
      to: '2026-10-09T14:06:00+05:00',
      filters: { area_id: 2, assignee_id: IVANOV.toUpperCase() },
      refresh: true,
    });
    expect(r).toEqual({
      ok: true,
      value: {
        scope: {
          from: '2026-10-09T03:00:00.000Z',
          to: '2026-10-09T09:06:00.000Z',
          filters: { area_id: 2, assignee_id: IVANOV },
        },
        refresh: true,
      },
    });
  });

  it('rejects broken periods and filters', () => {
    expect(parseSummaryBody(null).ok).toBe(false);
    expect(parseSummaryBody({ from: 'yesterday', to: SCOPE.to }).ok).toBe(false);
    expect(parseSummaryBody({ from: SCOPE.to, to: SCOPE.from }).ok).toBe(false);
    expect(
      parseSummaryBody({ from: '2024-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }).ok,
    ).toBe(false);
    expect(parseFilters({ area_id: '2' }).ok).toBe(false);
    expect(parseFilters({ assignee_id: 'Иванов' }).ok).toBe(false);
    expect(parseFilters([]).ok).toBe(false);
    expect(parseFilters({ unknown: 1, brigade_id: 3 })).toEqual({ ok: true, value: { brigade_id: 3 } });
    expect(parseFilters({ area_id: null })).toEqual({ ok: true, value: {} });
  });

  it('parses the explain body', () => {
    expect(
      parseExplainBody({ employee_id: IVANOV, from: SCOPE.from, to: SCOPE.to }),
    ).toEqual({ ok: true, value: { employee_id: IVANOV, period: { from: SCOPE.from, to: SCOPE.to } } });
    expect(parseExplainBody({ employee_id: '2002', from: SCOPE.from, to: SCOPE.to }).ok).toBe(false);
  });
});

describe('local time', () => {
  it('writes Asia/Qostanay stamps and recognizes shifts', () => {
    expect(localStamp('2026-10-09T03:00:00Z')).toBe('08:00 09.10.2026');
    expect(shiftLabel({ from: '2026-10-09T03:00:00Z', to: '2026-10-09T15:00:00Z' })).toBe(
      'дневная смена',
    );
    expect(shiftLabel({ from: '2026-10-09T15:00:00Z', to: '2026-10-10T03:00:00Z' })).toBe(
      'ночная смена',
    );
    expect(shiftLabel({ from: '2026-09-09T09:06:00Z', to: '2026-10-09T09:06:00Z' })).toBeNull();
  });
});

describe('the shift summary message', () => {
  const pseudonyms = new Map([
    [IVANOV, 'E02'],
    [AKHMETOV, 'E01'],
  ]);
  const text = buildShiftSummaryText(REPORT, { scope: SCOPE, now: NOW, names: {}, pseudonyms });

  it('carries every count and workers by pseudonym only', () => {
    expect(text).toContain('с 08:00 09.10.2026 по 14:06 09.10.2026 (время Костаная), дневная смена.');
    expect(text).not.toContain('Период ещё идёт');
    const whole = buildShiftSummaryText(REPORT, {
      scope: { ...SCOPE, to: '2026-10-09T15:00:00.000Z' },
      now: NOW,
      names: {},
      pseudonyms,
    });
    expect(whole).toContain('по 14:05 09.10.2026 (время Костаная), дневная смена. Период ещё идёт');
    expect(text).toContain(
      'выдано 7, принято в работу 6, исполнено 5, закрыто 12, просрочено 1, отклонено 2, возвращено на доработку 1, отменено 0.',
    );
    expect(text).toContain('Причины отказов: Нет допуска 1, Другое 1.');
    expect(text).toContain('реакции, от выдачи до принятия: 4,2 мин.');
    expect(text).toContain('без пауз: 1 ч 35 мин.');
    expect(text).toContain('Выполнено в срок: 92%');
    expect(text).toContain('Насос НШ-32 маслостанции: 2,1 ч, 1 наряд');
    expect(text).toContain('E02 2 ч 30 мин, 42%; E01 1 ч 5 мин, 18%');
    expect(text).toContain('Проверка ИИ: принято 8, принято с замечаниями 2, на доработку 1.');
    expect(text).toContain('М-02 Подшипник: перегрев, шум, разрушение, 2');
    expect(text).not.toMatch(/Иванов|Ахметов/);
  });

  it('says what is empty instead of zeros', () => {
    const empty: ShiftReportData = {
      ...REPORT,
      counts: { ...REPORT.counts, rejected: 0 },
      rejected_reasons: [],
      workload: [],
      downtime: [],
      downtime_hours: 0,
      reaction_avg_min: null,
      execution_avg_min: null,
      on_time_share: null,
      verdicts: {},
      top_issues: [],
      top_equipment: [],
    };
    const t = buildShiftSummaryText(empty, {
      scope: { ...SCOPE, to: '2026-10-09T08:00:00Z' },
      now: NOW,
      names: {},
      pseudonyms,
    });
    expect(t).toContain('Отказов от нарядов не было.');
    expect(t).toContain('Среднее время реакции: нет данных.');
    expect(t).toContain('Простоя оборудования за период не было.');
    expect(t).toContain('За период никто не работал по нарядам.');
    expect(t).toContain('Проверок ИИ за период не было.');
    expect(t).not.toContain('Период ещё идёт');
  });

  it('names the filter, the assignee by pseudonym', () => {
    expect(filterLine({}, {})).toBe('Фильтр: все участки, всё оборудование и все исполнители.');
    expect(
      filterLine(
        { area_id: 2, assignee_id: IVANOV, brigade_id: 1 },
        { area: 'Участок дробления', assignee: 'E02', brigade: 'Бригада 1' },
      ),
    ).toBe('Фильтр: участок «Участок дробления», бригада «Бригада 1», исполнитель E02.');
  });

  it('needs a pseudonym for every worker of the workload', () => {
    expect(workloadCovered(REPORT, pseudonyms)).toBe(true);
    expect(workloadCovered(REPORT, new Map([[IVANOV, 'E02']]))).toBe(false);
  });

  it('goes out through the privacy gateway without names', async () => {
    const audit: unknown[] = [];
    const llm = createLlm({
      privacy: buildDirectory((directories as { employees: DirectoryEmployee[] }).employees),
      audit: { finish: (_id, row) => void audit.push(row.request_redacted) },
    });
    const r = await llm.call({ purpose: 'shift_summary', messages: [{ role: 'user', content: text }] });
    expect(r.data.recommendations).toHaveLength(3);
    expect(JSON.stringify(audit)).not.toMatch(/Иванов|Ахметов/);
  });
});

const rules = templateShiftSummary(REPORT);

describe('answers', () => {

  it('keeps a good summary, cleans dashes and pads recommendations from the rules', () => {
    const r = normalizeShiftSummary(
      {
        summary:
          'За смену выдано 7 нарядов — исполнено 5.  Просрочен 1 наряд, на Насосе НШ-32 простой 2,1 ч.',
        recommendations: ['Проверить насос НШ-32 – уплотнения.', '  '],
      },
      rules,
    );
    expect(r?.summary).toBe(
      'За смену выдано 7 нарядов, исполнено 5. Просрочен 1 наряд, на Насосе НШ-32 простой 2,1 ч.',
    );
    expect(r?.recommendations).toEqual([
      'Проверить насос НШ-32, уплотнения.',
      rules.recommendations[0],
      rules.recommendations[1],
    ]);
  });

  it('refuses an empty answer', () => {
    expect(normalizeShiftSummary({ summary: 'Коротко.', recommendations: ['a'] }, rules)).toBeNull();
    expect(
      normalizeShiftSummary({ summary: 'x'.repeat(60), recommendations: [] }, rules),
    ).toBeNull();
    expect(normalizeShiftSummary(null, rules)).toBeNull();
    expect(normalizeExplanation({ text: 'Хорошо.' })).toBeNull();
    expect(normalizeExplanation({ text: ' Рейтинг держит качество работ, 82%.  Мешают доработки — F 61%. Ищите причину отказа. ' })).toBe(
      'Рейтинг держит качество работ, 82%. Мешают доработки, F 61%. Ищите причину отказа.',
    );
  });

  it('keeps fault codes and finds numbers the input never had', () => {
    expect(cleanText('Шифр М-02 на К-3')).toBe('Шифр М-02 на К-3');
    expect(cleanText('Поговорить с Иванов С.. Затем')).toBe('Поговорить с Иванов С. Затем');
    expect(cleanText('Итого 5.. и т.д.')).toBe('Итого 5.. и т.д.');
    expect(numbersIn('4,2 мин и 05 и М-02')).toEqual(['4.2', '5', '2']);
    expect(unknownNumbers('Выдано 7, исполнено 5, рост 30%', 'выдано 7, исполнено 5')).toEqual(['30']);
  });
});

describe('the cache', () => {
  const row = (over: Partial<CachedSummaryRow> & { scope?: unknown }): CachedSummaryRow => ({
    id: 1,
    created_at: '2026-10-09T09:00:00.000Z',
    scope: SCOPE,
    body: 'Сводка из кэша.',
    recommendation: 'a\nb\nc',
    evidence: { recommendations: ['a', 'b', 'c'], model: 'claude-sonnet-5-5' },
    ...over,
  });

  it('reuses a fresh summary of the same scope, rolling ends within 10 minutes', () => {
    const later = { ...SCOPE, from: '2026-10-09T03:04:00.000Z', to: '2026-10-09T09:10:00.000Z' };
    expect(matchCachedSummary([row({})], later, NOW, SUMMARY_CACHE_TTL_MS)).toEqual({
      summary: 'Сводка из кэша.',
      recommendations: ['a', 'b', 'c'],
      model: 'claude-sonnet-5-5',
      created_at: '2026-10-09T09:00:00.000Z',
    });
  });

  it('skips old rows, other filters, far windows and broken rows', () => {
    const ttl = SUMMARY_CACHE_TTL_MS;
    expect(matchCachedSummary([row({ created_at: '2026-10-09T08:50:00Z' })], SCOPE, NOW, ttl)).toBeNull();
    expect(matchCachedSummary([row({})], { ...SCOPE, filters: { area_id: 2 } }, NOW, ttl)).toBeNull();
    expect(
      matchCachedSummary([row({})], { ...SCOPE, from: '2026-10-08T03:00:00.000Z' }, NOW, ttl),
    ).toBeNull();
    expect(matchCachedSummary([row({ body: null })], SCOPE, NOW, ttl)).toBeNull();
    expect(matchCachedSummary([row({})], SCOPE, NOW, 60_000)).toBeNull();
  });

  it('picks the newest and reads recommendations from the text column too', () => {
    const rows = [
      row({ id: 1, body: 'старая' }),
      row({ id: 2, created_at: '2026-10-09T09:04:00.000Z', body: 'новая', evidence: {} }),
    ];
    const hit = matchCachedSummary(rows, SCOPE, NOW, SUMMARY_CACHE_TTL_MS);
    expect(hit?.summary).toBe('новая');
    expect(hit?.recommendations).toEqual(['a', 'b', 'c']);
    expect(hit?.model).toBe('unknown');
  });

  it('writes the ai_insights row', () => {
    const r = summaryInsightRow(SCOPE, rules, REPORT, { model: 'claude-sonnet-5-5', unknown_numbers: [] });
    expect(r.kind).toBe('shift_summary');
    expect(r.title).toBe('Сводка ИИ, дневная смена с 08:00 09.10.2026');
    expect(r.recommendation.split('\n')).toEqual(rules.recommendations);
    expect(r.evidence.stats.issued).toBe(7);
    expect(r.scope).toEqual(SCOPE);
  });
});

describe('rating explanation input', () => {
  const w = (id: string, over: Partial<RatingRowData>): RatingRowData => ({
    kind: 'worker',
    id,
    name: id,
    brigade_id: 1,
    closed: 20,
    q: 0.8,
    t: 0.9,
    f: 0.85,
    v: 0.6,
    d: 1,
    score: 84,
    rank: 1,
    note: null,
    ...over,
  });
  const rows: RatingRowData[] = [
    w('a', { rank: 1 }),
    w('b', { rank: 2, q: 0.82 }),
    w('c', { rank: 3, f: 0.61, t: 0.95, score: 79, closed: 18 }),
    w('d', { rank: 4, score: null, q: null, t: null, f: null, closed: 0, note: 'нет закрытых нарядов' }),
    { ...w('1', {}), kind: 'brigade' },
  ];

  it('computes the medians, the gaps and what helps and hurts', () => {
    const ctx = ratingContext(rows, 'C');
    expect(ctx?.row.id).toBe('c');
    expect(ctx?.ranked).toBe(3);
    expect(ctx?.team.f).toBe(0.85);
    expect(ctx?.gaps.f).toBe(-4.8);
    expect(ctx?.gaps.t).toBe(1.3);
    expect(ctx?.helped).toBe('t');
    expect(ctx?.hurt).toBe('f');
    expect(ratingContext(rows, 'zzz')).toBeNull();
    expect(median([3, 1, 2, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('writes the components without the name', () => {
    const ctx = ratingContext(rows, 'c');
    const text = buildExplainText(ctx!, { from: '2026-09-09T09:00:00Z', to: '2026-10-09T09:00:00Z' });
    expect(text).toContain('Период рейтинга: с 09.09.2026 по 09.10.2026.');
    expect(text).toContain('Рейтинг исполнителя: 79 из 100, место 3 из 3 исполнителей');
    expect(text).toContain('F с первого раза: 61%; команда 85%; 12,2 из 20; на 4,8 балла ниже команды.');
    expect(text).toContain('T в срок: 95%; команда 90%; 23,8 из 25; на 1,3 балла выше команды.');
    expect(text).toContain('D дисциплина: 100%; команда 100%; 10 из 10; на уровне команды.');
    expect(text).toContain('Больше всего помогает: соблюдение сроков. Больше всего мешает: ремонт с первого раза.');
  });

  it('falls back to the rules text', () => {
    expect(templateExplainRating(rows[2])).toBe(
      'Сильнее всего рейтинг поднимает дисциплина: 100%. Ниже всего объём и сложность: 60%. Берите сложные и аварийные наряды, когда свободны.',
    );
    expect(templateExplainRating(rows[3])).toBe(NO_RATING_TEXT);
    expect(templateExplainRating(undefined)).toBe(NO_RATING_TEXT);
  });
});
