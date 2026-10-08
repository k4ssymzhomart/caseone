import { describe, expect, it } from 'vitest';
import directories from '../../seed/directories.json';
import { DbError } from '../_shared/caller.ts';
import type { LlmConfig } from '../_shared/llm.ts';
import { anthropicConfig, anthropicFetch, anthropicReply } from '../_shared/llmFakes.ts';
import type { DirectoryEmployee } from '../_shared/privacy.ts';
import { NO_RATING_TEXT, templateExplainRating, type RatingRowData } from '../_shared/reportText.ts';
import { handleExplainRequest, type ExplainDb, type ExplainResponse, type ExplainUser } from './handler.ts';

const SERIKOV = '00000000-0000-4000-8000-000000002006';
const IVANOV = '00000000-0000-4000-8000-000000002002';
const NEW_WORKER = '00000000-0000-4000-8000-000000002015';
const MASTER = '00000000-0000-4000-8000-000000001001';
const NOW = new Date('2026-10-09T09:00:00.000Z');
const BODY = { employee_id: SERIKOV, from: '2026-09-09T09:00:00.000Z', to: '2026-10-09T09:00:00.000Z' };

const w = (id: string, name: string, over: Partial<RatingRowData>): RatingRowData => ({
  kind: 'worker',
  id,
  name,
  brigade_id: 2,
  closed: 20,
  q: 0.84,
  t: 0.9,
  f: 0.86,
  v: 0.6,
  d: 1,
  score: 85,
  rank: 1,
  note: null,
  ...over,
});

const ROWS: RatingRowData[] = [
  w(IVANOV, 'Иванов С.', { rank: 1 }),
  w('00000000-0000-4000-8000-000000002007', 'Петренко В.', { rank: 2, q: 0.86, score: 84 }),
  w(SERIKOV, 'Сериков Д.', { rank: 3, f: 0.55, q: 0.8, score: 77.4, closed: 14 }),
  w(NEW_WORKER, 'Есенов А.', {
    rank: 4,
    closed: 0,
    q: null,
    t: null,
    f: null,
    v: 0,
    score: null,
    note: 'нет закрытых нарядов',
  }),
];

const USERS: Record<string, ExplainUser> = {
  serikov: { id: SERIKOV, role: 'worker' },
  ivanov: { id: IVANOV, role: 'worker' },
  master: { id: MASTER, role: 'master' },
};

function fakeDb(over: Partial<ExplainDb> = {}): ExplainDb & { periods: unknown[] } {
  const periods: unknown[] = [];
  return {
    periods,
    async getUser(token) {
      return USERS[token] ?? null;
    },
    async rating(period) {
      periods.push(period);
      return ROWS;
    },
    async employees() {
      return (directories as { employees: DirectoryEmployee[] }).employees;
    },
    ...over,
  };
}

function post(body: unknown, token: string | null = 'serikov'): Request {
  return new Request('http://localhost/ai-explain-rating', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function run(req: Request, db: ExplainDb, llmConfig: () => LlmConfig = () => ({})) {
  const logs: Record<string, unknown>[] = [];
  const res = await handleExplainRequest(req, { db, llmConfig, now: () => NOW, log: (e) => logs.push(e) });
  return { status: res.status, body: (await res.json()) as ExplainResponse & { error?: string }, logs };
}

const TEXT =
  'Рейтинг поддерживают сроки: 90% нарядов вовремя. Мешает ремонт с первого раза, 55% при медиане команды 86%. Ищите причину отказа узла, а не только следствие.';

describe('ai-explain-rating', () => {
  it('lets a worker ask about themselves and staff about anyone', async () => {
    expect((await run(post(BODY, null), fakeDb())).status).toBe(401);
    expect((await run(post(BODY, 'stranger'), fakeDb())).status).toBe(401);
    expect((await run(post(BODY, 'ivanov'), fakeDb())).status).toBe(403);
    expect((await run(post(BODY, 'serikov'), fakeDb())).status).toBe(200);
    expect((await run(post(BODY, 'master'), fakeDb())).status).toBe(200);
    expect((await run(post({ ...BODY, employee_id: '2006' }), fakeDb())).status).toBe(400);
    expect((await run(post('{'), fakeDb())).status).toBe(400);
  });

  it('answers 404 for someone who is not in the rating', async () => {
    const res = await run(post({ ...BODY, employee_id: MASTER }, 'master'), fakeDb());
    expect(res.status).toBe(404);
  });

  it('maps a failing rating call', async () => {
    const db = fakeDb({
      async rating() {
        throw new DbError('connection reset', null);
      },
    });
    expect((await run(post(BODY), db)).status).toBe(500);
  });

  it('mock provider and no closed orders: the rules text', async () => {
    const db = fakeDb();
    const a = await run(post(BODY), db);
    expect(a.body).toEqual({
      text: templateExplainRating(ROWS[2]),
      source: 'rules',
      model: 'rules',
      generated_at: NOW.toISOString(),
      reason: 'mock',
    });
    expect(db.periods).toEqual([{ from: BODY.from, to: BODY.to }]);
    const b = await run(post({ ...BODY, employee_id: NEW_WORKER }, 'master'), fakeDb());
    expect(b.body).toMatchObject({ text: NO_RATING_TEXT, source: 'rules', reason: 'no_closed' });
  });

  it('anthropic: one Haiku call without the name and without a thinking field', async () => {
    const { fetchFn, bodies } = anthropicFetch([[200, anthropicReply({ text: TEXT }, 'claude-haiku-5-5')]]);
    const { body, logs } = await run(post(BODY), fakeDb(), anthropicConfig(fetchFn));
    expect(body).toEqual({
      text: TEXT,
      source: 'llm',
      model: 'claude-haiku-5-5',
      generated_at: NOW.toISOString(),
      cost_usd: expect.any(Number),
    });
    expect(bodies).toHaveLength(1);
    const req = bodies[0] ?? {};
    expect(req.model).toBe('claude-haiku-5-5');
    expect(req).not.toHaveProperty('thinking');
    expect(req).not.toHaveProperty('temperature');
    expect(req.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
    const sent = JSON.stringify(req.messages);
    expect(sent).not.toMatch(/Сериков|Иванов|Петренко|E06/);
    expect(sent).toContain('F с первого раза: 55%; команда 86%');
    expect(sent).toContain('место 3 из 3');
    expect(sent).toContain('Больше всего мешает: ремонт с первого раза.');
    expect(logs.find((l) => l.event === 'explained')).toMatchObject({ caller: 'self' });
  });

  it('falls back to the rules text on errors and unusable answers', async () => {
    const rules = templateExplainRating(ROWS[2]);
    const http = anthropicFetch([[500, { error: { type: 'api_error', message: 'x' } }]]);
    expect((await run(post(BODY), fakeDb(), anthropicConfig(http.fetchFn))).body).toMatchObject({
      text: rules,
      source: 'rules',
      reason: 'HTTP',
    });
    const short = anthropicFetch([[200, anthropicReply({ text: 'Хорошо.' }, 'claude-haiku-5-5')]]);
    expect((await run(post(BODY), fakeDb(), anthropicConfig(short.fetchFn))).body).toMatchObject({
      source: 'rules',
      reason: 'BAD_RESPONSE',
    });
    const budget = anthropicFetch([]);
    expect(
      (await run(post(BODY), fakeDb(), anthropicConfig(budget.fetchFn, 4))).body,
    ).toMatchObject({ source: 'rules', reason: 'BUDGET_EXCEEDED' });
    expect(budget.bodies).toHaveLength(0);
    const noDirectory = fakeDb({
      async employees() {
        return [];
      },
    });
    const none = anthropicFetch([]);
    expect((await run(post(BODY), noDirectory, anthropicConfig(none.fetchFn))).body).toMatchObject({
      source: 'rules',
      reason: 'CONFIG',
    });
    expect(none.bodies).toHaveLength(0);
  });
});
