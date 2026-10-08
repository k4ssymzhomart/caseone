import { describe, expect, it } from 'vitest';
import directories from '../../seed/directories.json';
import { DbError } from '../_shared/caller.ts';
import type { LlmAuditRequest, LlmConfig } from '../_shared/llm.ts';
import { anthropicConfig, anthropicFetch, anthropicReply } from '../_shared/llmFakes.ts';
import type { DirectoryEmployee } from '../_shared/privacy.ts';
import { AKHMETOV, IVANOV, REPORT } from '../_shared/reportFixtures.ts';
import type { CachedSummaryRow, SummaryInsightRow } from '../_shared/reportInput.ts';
import { templateShiftSummary, type ShiftReportData } from '../_shared/reportText.ts';
import { handleSummaryRequest, type SummaryDb, type SummaryEmployee, type SummaryResponse } from './handler.ts';

const NOW = new Date('2026-10-09T09:05:30.000Z');
const BODY = { from: '2026-10-09T03:00:00.000Z', to: '2026-10-09T09:06:00.000Z', filters: {} };

const EMPLOYEES: SummaryEmployee[] = (directories as { employees: DirectoryEmployee[] }).employees.map(
  (e) => ({
    ...e,
    id: e.tab_no === '2002' ? IVANOV : e.tab_no === '2001' ? AKHMETOV : `id-${e.tab_no}`,
  }),
);

interface FakeDb extends SummaryDb {
  tokens: string[];
  saved: SummaryInsightRow[];
  rows: CachedSummaryRow[];
}

function fakeDb(over: Partial<SummaryDb> = {}, report: ShiftReportData = REPORT): FakeDb {
  const db: FakeDb = {
    tokens: [],
    saved: [],
    rows: [],
    async shiftReport(token) {
      db.tokens.push(token);
      return report;
    },
    async employees() {
      return EMPLOYEES;
    },
    async filterNames() {
      return { area: 'Участок дробления' };
    },
    async recentSummaries() {
      return db.rows;
    },
    async saveSummary(row) {
      db.saved.push(row);
    },
    ...over,
  };
  return db;
}

function post(body: unknown, token: string | null = 'user-token'): Request {
  return new Request('http://localhost/ai-shift-summary', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function run(req: Request, db: SummaryDb, llmConfig: () => LlmConfig = () => ({})) {
  const logs: Record<string, unknown>[] = [];
  const res = await handleSummaryRequest(req, { db, llmConfig, now: () => NOW, log: (e) => logs.push(e) });
  return { status: res.status, body: (await res.json()) as SummaryResponse & { error?: string }, logs };
}

const ANSWER = {
  summary:
    'За смену выдано 7 нарядов, исполнено 5, закрыто 12. Просрочен 1 наряд. E02 загружен на 42%. Насос НШ-32 маслостанции простаивал 2,1 ч. ИИ вернул на доработку 1 наряд.',
  recommendations: [
    'Проверить уплотнения насоса НШ-32 маслостанции.',
    'Разобрать просроченный наряд с E02.',
    'Проверить допуски до выдачи нарядов.',
  ],
};

describe('ai-shift-summary', () => {
  it('answers OPTIONS with CORS and refuses other methods', async () => {
    const pre = await handleSummaryRequest(new Request('http://x', { method: 'OPTIONS' }), {
      db: fakeDb(),
      llmConfig: () => ({}),
    });
    expect(pre.status).toBe(200);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    const get = await handleSummaryRequest(new Request('http://x'), { db: fakeDb(), llmConfig: () => ({}) });
    expect(get.status).toBe(405);
  });

  it('needs a user token and a valid body', async () => {
    expect((await run(post(BODY, null), fakeDb())).status).toBe(401);
    expect((await run(post('not json'), fakeDb())).status).toBe(400);
    const bad = await run(post({ from: 'x', to: BODY.to }), fakeDb());
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('BAD_INPUT');
  });

  it('passes the caller token to shift_report and maps its refusals', async () => {
    const forbidden = fakeDb({
      async shiftReport() {
        throw new DbError('FORBIDDEN', 'P0001');
      },
    });
    expect((await run(post(BODY), forbidden)).status).toBe(403);
    const anon = fakeDb({
      async shiftReport() {
        throw new DbError('permission denied for function shift_report', '42501');
      },
    });
    expect((await run(post(BODY), anon)).status).toBe(403);
    const expired = fakeDb({
      async shiftReport() {
        throw new DbError('JWT expired', 'PGRST301');
      },
    });
    expect((await run(post(BODY), expired)).status).toBe(401);
    const db = fakeDb();
    await run(post(BODY), db);
    expect(db.tokens).toEqual(['user-token']);
  });

  it('mock provider: the rules text from the real numbers, nothing stored', async () => {
    const db = fakeDb();
    const { status, body } = await run(post(BODY), db);
    expect(status).toBe(200);
    expect(body).toEqual({
      ...templateShiftSummary(REPORT),
      source: 'rules',
      model: 'rules',
      cached: false,
      generated_at: NOW.toISOString(),
      reason: 'mock',
    });
    expect(db.saved).toEqual([]);
  });

  it('anthropic: one Sonnet call without names, the answer rehydrated and cached', async () => {
    const { fetchFn, bodies } = anthropicFetch([[200, anthropicReply(ANSWER)]]);
    const audits: LlmAuditRequest[] = [];
    const db = fakeDb();
    const { status, body, logs } = await run(
      post({ ...BODY, filters: { area_id: 2, assignee_id: IVANOV } }),
      db,
      anthropicConfig(fetchFn, 0.001, audits),
    );
    expect(status).toBe(200);
    expect(body.source).toBe('llm');
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.cached).toBe(false);
    expect(body.summary).toContain('Иванов С. загружен на 42%');
    expect(body.recommendations[1]).toBe('Разобрать просроченный наряд с Иванов С.');
    expect(body.unknown_numbers).toEqual([]);

    expect(bodies).toHaveLength(1);
    const sent = JSON.stringify(bodies[0]);
    expect(sent).not.toMatch(/Иванов|Ахметов/);
    expect(sent).toContain('исполнитель E02');
    expect(sent).toContain('участок «Участок дробления»');
    expect(bodies[0]?.thinking).toEqual({ type: 'between_tools' });
    expect(bodies[0]).not.toHaveProperty('temperature');
    expect(audits[0]?.purpose).toBe('shift_summary');

    expect(db.saved).toHaveLength(1);
    expect(db.saved[0]?.kind).toBe('shift_summary');
    expect(db.saved[0]?.scope.filters).toEqual({ area_id: 2, assignee_id: IVANOV });
    expect(db.saved[0]?.evidence.recommendations).toEqual(body.recommendations);
    expect(logs.find((l) => l.event === 'summarized')).toMatchObject({ model: 'claude-sonnet-5-5' });
    expect(JSON.stringify(logs)).not.toMatch(/Иванов|E02/);
  });

  it('returns a cached summary of the same scope without calling the model', async () => {
    const { fetchFn, bodies } = anthropicFetch([[200, anthropicReply(ANSWER)]]);
    const db = fakeDb();
    db.rows = [
      {
        id: 5,
        created_at: '2026-10-09T09:01:00.000Z',
        scope: { ...BODY, to: '2026-10-09T09:02:00.000Z' },
        body: 'Из кэша.',
        recommendation: null,
        evidence: { recommendations: ['a', 'b', 'c'], model: 'claude-sonnet-5-5' },
      },
    ];
    const { body } = await run(post(BODY), db, anthropicConfig(fetchFn));
    expect(body).toEqual({
      summary: 'Из кэша.',
      recommendations: ['a', 'b', 'c'],
      source: 'llm',
      model: 'claude-sonnet-5-5',
      cached: true,
      generated_at: '2026-10-09T09:01:00.000Z',
    });
    expect(bodies).toHaveLength(0);
    // «Обновить» skips a summary older than a minute
    const again = await run(post({ ...BODY, refresh: true }), db, anthropicConfig(fetchFn));
    expect(again.body.cached).toBe(false);
    expect(bodies).toHaveLength(1);
  });

  it('falls back to the rules text on HTTP errors, over budget and unusable answers', async () => {
    const rules = templateShiftSummary(REPORT);
    const http = anthropicFetch([[529, { error: { type: 'overloaded_error', message: 'busy' } }]]);
    const a = await run(post(BODY), fakeDb(), anthropicConfig(http.fetchFn));
    expect(a.body).toMatchObject({ ...rules, source: 'rules', reason: 'HTTP' });

    const budget = anthropicFetch([[200, anthropicReply(ANSWER)]]);
    const b = await run(post(BODY), fakeDb(), anthropicConfig(budget.fetchFn, 3.999));
    expect(b.body).toMatchObject({ source: 'rules', reason: 'BUDGET_EXCEEDED' });
    expect(budget.bodies).toHaveLength(0);

    const empty = anthropicFetch([[200, anthropicReply({ summary: '', recommendations: [] })]]);
    const c = await run(post(BODY), fakeDb(), anthropicConfig(empty.fetchFn));
    expect(c.body).toMatchObject({ source: 'rules', reason: 'BAD_RESPONSE' });

    const noKey = await run(post(BODY), fakeDb(), () => ({ provider: 'anthropic', spentUsd: () => 0 }));
    expect(noKey.body).toMatchObject({ source: 'rules', reason: 'CONFIG' });
  });

  it('sends nothing when the directory does not cover a worker of the report', async () => {
    const { fetchFn, bodies } = anthropicFetch([[200, anthropicReply(ANSWER)]]);
    const db = fakeDb({
      async employees() {
        return EMPLOYEES.filter((e) => e.id !== AKHMETOV);
      },
    });
    const { body } = await run(post(BODY), db, anthropicConfig(fetchFn));
    expect(body).toMatchObject({ source: 'rules', reason: 'CONFIG' });
    expect(bodies).toHaveLength(0);
  });

  it('a failing cache read or write never fails the summary', async () => {
    const { fetchFn } = anthropicFetch([[200, anthropicReply(ANSWER)]]);
    const db = fakeDb({
      async recentSummaries() {
        throw new Error('down');
      },
      async saveSummary() {
        throw new Error('down');
      },
    });
    const { status, body, logs } = await run(post(BODY), db, anthropicConfig(fetchFn));
    expect(status).toBe(200);
    expect(body.source).toBe('llm');
    expect(logs.map((l) => l.event)).toEqual(
      expect.arrayContaining(['cache_read_failed', 'cache_write_failed', 'summarized']),
    );
  });
});
