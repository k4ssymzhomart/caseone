import { describe, expect, it } from 'vitest';
import directories from '../../seed/directories.json';
import type { AuthUser } from '../_shared/auth.ts';
import type { LlmAuditResponse, LlmConfig } from '../_shared/llm.ts';
import type { InsightsAnswer, ParseQueryAnswer } from '../_shared/schemas.ts';
import type { AnalyticsBundle } from './cards.ts';
import { weeklyDigestBody, type DigestNotification } from './digest.ts';
import area2 from './fixtures/bundle-30d-area2.json';
import history from './fixtures/bundle-92d.json';
import areas from './fixtures/areas.json';
import {
  handleInsightsRequest,
  type InsightsBody,
  type InsightsDb,
  type NewInsight,
  type StoredInsight,
} from './handler.ts';
import type { InsightFilters } from './scope.ts';

const SECRET = 'sb_secret_test_value_0123456789';
const URL_ = 'https://example.supabase.co/functions/v1/ai-insights';
// 2026-10-09 00:56 Asia/Qostanay, just after the fixtures were taken
const NOW = Date.parse('2026-10-08T19:56:00Z');

const USERS: Record<string, AuthUser> = {
  'tok-master': { id: 'm-1', role: 'master' },
  'tok-manager': { id: 'r-1', role: 'manager' },
  'tok-worker': { id: 'w-1', role: 'worker' },
};

interface Calls {
  bundle: { from: string; to: string; filters: InsightFilters }[];
  rules: { from: string; to: string; filters: InsightFilters }[];
  stored: NewInsight[][];
  notified: DigestNotification[][];
  employees: number;
}

function fakeDb() {
  const calls: Calls = { bundle: [], rules: [], stored: [], notified: [], employees: 0 };
  const table: StoredInsight[] = [];
  const keys = new Set<string>();
  let id = 0;
  const pick = (filters: InsightFilters) => (filters.area_id === 2 ? area2 : history);
  const db: InsightsDb = {
    getUser: async (token) => USERS[token] ?? null,
    areas: async () => areas,
    bundle: async (from, to, filters) => {
      calls.bundle.push({ from, to, filters });
      return pick(filters).bundle as unknown as AnalyticsBundle;
    },
    ruleCards: async (from, to, filters) => {
      calls.rules.push({ from, to, filters });
      return pick(filters).rules as unknown[];
    },
    employees: async () => {
      calls.employees += 1;
      return directories.employees;
    },
    cached: async (key, since) =>
      table.filter((r) => r.scope.key === key && Date.parse(r.created_at) >= Date.parse(since)),
    store: async (rows) => {
      calls.stored.push(rows);
      const out = rows.map((r) => ({ ...r, id: ++id, created_at: new Date(NOW).toISOString() }));
      table.push(...out);
      return out;
    },
    digestRecipients: async () => ['m-1', 'm-2', 'r-1'],
    notify: async (rows) => {
      calls.notified.push(rows);
      let added = 0;
      for (const r of rows) {
        const k = `${r.recipient_id}|${r.dedupe_key}`;
        if (!keys.has(k)) added += 1;
        keys.add(k);
      }
      return added;
    },
  };
  return { db, calls, table };
}

function post(
  body: unknown,
  headers: Record<string, string> = { authorization: 'Bearer tok-master' },
): Request {
  return new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function run(
  req: Request,
  db: InsightsDb,
  llmConfig: () => LlmConfig = () => ({ provider: 'mock' }),
  now = NOW,
) {
  const logs: Record<string, unknown>[] = [];
  let n = 0;
  const res = await handleInsightsRequest(req, {
    db,
    secrets: [SECRET],
    llmConfig,
    now: () => now,
    newId: () => `batch-${++n}-${now}`,
    log: (e) => logs.push(e),
  });
  return { res, body: (await res.json()) as InsightsBody & { error?: string }, logs };
}

/** Anthropic answers in order; records every request body. */
function anthropicFetch(replies: [number, unknown][]) {
  const bodies: Record<string, unknown>[] = [];
  const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    const [status, body] = replies.shift() ?? [
      500,
      { error: { type: 'api_error', message: 'none left' } },
    ];
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchFn, bodies };
}

const reply = (model: string, json: unknown) => ({
  model,
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify(json) }],
  usage: { input_tokens: 3000, output_tokens: 1200 },
});

function anthropicConfig(
  fetchFn: typeof fetch,
  spent = 0.2,
  audits: LlmAuditResponse[] = [],
): () => LlmConfig {
  return () => ({
    provider: 'anthropic',
    apiKey: 'test-key',
    spentUsd: () => spent,
    audit: { finish: (_id, row) => void audits.push(row) },
    fetch: fetchFn,
  });
}

const PARSED: ParseQueryAnswer = {
  area_id: 2,
  from: '2026-09-09T00:56:00+05:00',
  to: '2026-10-09T00:56:00+05:00',
  focus: [],
};

const SONNET: InsightsAnswer = {
  cards: [
    {
      kind: 'top_equipment',
      severity: 'critical',
      title: 'Конвейер К-3 ломается чаще всех',
      body: 'Конвейер К-3: 7 внеплановых остановок за 30 дней, 5 из них шифр М-02 (подшипник).',
      recommendation: 'Рекомендуем проверить соосность привода и включить в план ППР.',
      refs: ['top_equipment.0'],
    },
    {
      kind: 'trend',
      severity: 'critical',
      title: 'Грохот ГИЛ-52: отказов всё больше',
      // 11 is not in the trend row: the card goes, the rules card of trend takes its place
      body: 'Грохот ГИЛ-52: за последние 2 недели 11 отказов.',
      recommendation: 'Рекомендуем запланировать диагностику грохота.',
      refs: ['trend.0'],
    },
    {
      kind: 'materials',
      severity: 'warning',
      title: 'Перерасход смазки: E05',
      body: 'E05 списывает Смазка Литол-24 по шифру С-01 в 2,1 раза больше нормы: 1,7 кг при норме 0,8 кг, 11 нарядов.',
      recommendation: 'Рекомендуем проверить списание смазки.',
      refs: ['materials.0'],
    },
  ],
};

describe('access', () => {
  it('answers OPTIONS and refuses GET', async () => {
    const { db } = fakeDb();
    const opt = await handleInsightsRequest(new Request(URL_, { method: 'OPTIONS' }), {
      db,
      secrets: [SECRET],
      llmConfig: () => ({}),
    });
    expect(opt.status).toBe(200);
    expect(opt.headers.get('access-control-allow-origin')).toBe('*');
    expect((await run(new Request(URL_, { method: 'GET' }), db)).res.status).toBe(405);
  });

  it('needs a session or the secret key; workers get 403', async () => {
    const { db } = fakeDb();
    expect((await run(post({}, {}), db)).res.status).toBe(401);
    expect((await run(post({}, { authorization: 'Bearer tok-unknown' }), db)).res.status).toBe(401);
    expect((await run(post({}, { authorization: 'Bearer tok-worker' }), db)).res.status).toBe(403);
    expect((await run(post({}, { authorization: 'Bearer tok-manager' }), db)).res.status).toBe(200);
    expect((await run(post({}, { apikey: SECRET }), db)).res.status).toBe(200);
  });

  it('keeps the digest to the secret key', async () => {
    const { db } = fakeDb();
    expect(
      (await run(post({ digest: true }, { authorization: 'Bearer tok-manager' }), db)).res.status,
    ).toBe(403);
  });

  it('rejects a broken body', async () => {
    const { db } = fakeDb();
    const req = new Request(URL_, {
      method: 'POST',
      headers: { authorization: 'Bearer tok-master' },
      body: '{nope',
    });
    expect((await run(req, db)).res.status).toBe(400);
  });
});

describe('mock provider', () => {
  it('returns the cards of insight_cards with the scope and stores them', async () => {
    const { db, calls } = fakeDb();
    const { res, body } = await run(post({ from: history.from, to: history.to, filters: {} }), db);
    expect(res.status).toBe(200);
    expect(body.cards.map((c) => c.title)).toEqual(
      (history.rules as { title: string }[]).map((r) => r.title),
    );
    expect(body.scope).toMatchObject({
      label: '3 месяца',
      source: 'rules',
      cached: false,
      model: null,
      query: null,
    });
    expect(body.cards[0]).toMatchObject({
      id: 1,
      scope: { source: 'rules', prompt_version: 'i2' },
    });
    expect(calls.bundle).toHaveLength(0); // insight_cards computes it itself
    expect(calls.employees).toBe(0); // no directory without a model
    expect(calls.stored).toHaveLength(1);
  });

  it('reads the question with the keyword reader', async () => {
    const { db, calls } = fakeDb();
    const { body } = await run(
      post({
        from: history.from,
        to: history.to,
        query: 'покажи проблемы участка дробления за месяц',
      }),
      db,
    );
    expect(calls.rules[0]!.filters).toEqual({ area_id: 2 });
    expect(Date.parse(calls.rules[0]!.to) - Date.parse(calls.rules[0]!.from)).toBe(30 * 86_400_000);
    expect(body.scope).toMatchObject({
      area_name: 'Участок дробления',
      label: '30 дней',
      parsed_by: 'rules',
      query: 'покажи проблемы участка дробления за месяц',
    });
    expect(body.cards[0]!.body).toContain('7 внеплановых остановок за 30 дней, 5 из них шифр М-02');
  });

  it('answers the same scope from the cache', async () => {
    const { db, calls } = fakeDb();
    await run(post({ from: history.from, to: history.to }), db);
    const again = await run(post({ from: history.from, to: history.to }), db);
    expect(again.body.scope.cached).toBe(true);
    expect(again.body.cards).toHaveLength(7);
    expect(calls.rules).toHaveLength(1);
    // rules cards go stale after 10 minutes
    const later = await run(
      post({ from: history.from, to: history.to }),
      db,
      undefined,
      NOW + 11 * 60_000,
    );
    expect(later.body.scope.cached).toBe(false);
  });
});

describe('anthropic', () => {
  it('parses with Haiku, writes with Sonnet, grounds every card and logs the cost', async () => {
    const { db, calls } = fakeDb();
    const { fetchFn, bodies } = anthropicFetch([
      [200, reply('claude-haiku-5-5', PARSED)],
      [200, reply('claude-sonnet-5-5', SONNET)],
    ]);
    const audits: LlmAuditResponse[] = [];
    const { body, logs } = await run(
      post({ query: 'покажи проблемы участка дробления за месяц' }),
      db,
      anthropicConfig(fetchFn, 0.2, audits),
    );
    // requests: CLAUDE.md §2 settings, no sampling parameters, no names
    expect(bodies[0]).toMatchObject({ model: 'claude-haiku-5-5' });
    expect(bodies[0]).not.toHaveProperty('thinking');
    expect(bodies[1]).toMatchObject({
      model: 'claude-sonnet-5-5',
      thinking: { type: 'between_tools' },
    });
    for (const b of bodies) {
      expect(b).not.toHaveProperty('temperature');
      expect(b).toMatchObject({ output_config: { effort: 'low' } });
      const text = JSON.stringify(b.messages);
      expect(text).not.toContain('Касымов');
      expect(text).not.toContain('Сериков');
    }
    expect(JSON.stringify(bodies[1]!.messages)).toContain('E05');

    expect(calls.bundle[0]!.filters).toEqual({ area_id: 2 });
    expect(body.scope).toMatchObject({
      parsed_by: 'llm',
      source: 'mixed',
      area_name: 'Участок дробления',
    });
    expect(body.cards.map((c) => c.kind)).toEqual(['top_equipment', 'trend', 'materials']);
    // the trend card is the rules card; the materials card is rehydrated
    expect(body.cards[1]!.title).toBe(
      (area2.rules as { kind: string; title: string }[]).find((r) => r.kind === 'trend')!.title,
    );
    expect(body.cards[2]!.title).toBe('Перерасход смазки: Касымов Б.');
    expect(body.cards[0]!.evidence.order_ids).toHaveLength(7);
    expect(audits.map((a) => a.purpose)).toEqual(['parse_query', 'insights']);
    expect(logs.at(-1)).toMatchObject({
      event: 'insights',
      source: 'mixed',
      replaced: 1,
      dropped: 1,
    });
    expect(Number(logs.at(-1)!.cost_usd)).toBeGreaterThan(0);
  });

  it('falls back to the rules when the model fails', async () => {
    const { db } = fakeDb();
    const err: [number, unknown] = [500, { error: { type: 'api_error', message: 'boom' } }];
    const { fetchFn } = anthropicFetch([err, err]);
    const { body, logs } = await run(
      post({ query: 'покажи проблемы участка дробления за месяц' }),
      db,
      anthropicConfig(fetchFn),
    );
    expect(body.scope).toMatchObject({
      parsed_by: 'rules',
      source: 'rules',
      area_name: 'Участок дробления',
    });
    expect(body.cards).toHaveLength((area2.rules as unknown[]).length);
    expect(logs.at(-1)).toMatchObject({ parse_error: 'HTTP', error: 'HTTP' });
  });

  it('makes no paid call over the budget', async () => {
    const { db } = fakeDb();
    const { fetchFn, bodies } = anthropicFetch([]);
    const { body, logs } = await run(
      post({ from: history.from, to: history.to }),
      db,
      anthropicConfig(fetchFn, 3.999),
    );
    expect(bodies).toHaveLength(0);
    expect(body.scope.source).toBe('rules');
    expect(body.cards).toHaveLength(7);
    expect(logs.at(-1)).toMatchObject({ error: 'BUDGET_EXCEEDED' });
  });

  it('answers a repeated scope from the cache without a second model call', async () => {
    const { db } = fakeDb();
    const { fetchFn, bodies } = anthropicFetch([
      [200, reply('claude-sonnet-5-5', { cards: [SONNET.cards[0]] })],
    ]);
    const config = anthropicConfig(fetchFn);
    const first = await run(post({ filters: { area_id: 2 } }), db, config);
    expect(first.body.scope).toMatchObject({ source: 'llm', model: 'claude-sonnet-5-5' });
    const second = await run(post({ filters: { area_id: 2 } }), db, config, NOW + 30 * 60_000);
    expect(second.body.scope).toMatchObject({ source: 'llm', cached: true });
    expect(second.body.cards[0]!.title).toBe(first.body.cards[0]!.title);
    expect(bodies).toHaveLength(1);
  });

  it('skips the model when the detectors found nothing', async () => {
    const { db } = fakeDb();
    db.bundle = async () => ({ top_areas: [{ unplanned: 0 }], top_equipment: [], trend: [] });
    const { fetchFn, bodies } = anthropicFetch([]);
    const { body } = await run(post({}), db, anthropicConfig(fetchFn));
    expect(bodies).toHaveLength(0);
    expect(body.cards).toEqual([]);
  });

  it('a CONFIG error (no key) means rules only', async () => {
    const { db } = fakeDb();
    const { body, logs } = await run(post({}), db, () => ({
      provider: 'anthropic',
      spentUsd: () => 0,
    }));
    expect(body.scope.source).toBe('rules');
    expect(logs.at(-1)).toMatchObject({ error: 'CONFIG' });
  });
});

describe('weekly digest', () => {
  // Monday 2026-10-12 08:00 Asia/Qostanay
  const MONDAY = Date.parse('2026-10-12T03:00:00Z');

  it('writes the week once and tells every master and manager once', async () => {
    const { db, calls } = fakeDb();
    const first = await run(post({ digest: true }, { apikey: SECRET }), db, undefined, MONDAY);
    expect(first.res.status).toBe(200);
    expect(first.body.scope).toMatchObject({ label: 'неделю', digest: true });
    expect(new Date(calls.rules[0]!.from).toISOString()).toBe('2026-10-04T19:00:00.000Z');
    expect(new Date(calls.rules[0]!.to).toISOString()).toBe('2026-10-11T19:00:00.000Z');
    expect(first.body.digest).toEqual({ recipients: 3, notified: 3 });
    const n = calls.notified[0]![0]!;
    expect(n).toMatchObject({
      kind: 'weekly_digest',
      order_id: null,
      severity: 'info',
      title: 'Сводка ИИ за неделю',
      url: '/analytics',
      dedupe_key: 'digest:2026-10-05',
    });
    expect(n.body).toBe(weeklyDigestBody(first.body.cards.length, first.body.cards[0]!.title));

    const again = await run(
      post({ digest: true }, { apikey: SECRET }),
      db,
      undefined,
      MONDAY + 60_000,
    );
    expect(again.body.scope.cached).toBe(true);
    expect(again.body.digest).toEqual({ recipients: 3, notified: 0 });
    expect(calls.rules).toHaveLength(1);
  });

  it('prints the digest like renderWeeklyDigest', () => {
    expect(weeklyDigestBody(1, 'Конвейер К-3 ломается чаще всех')).toBe(
      'Сводка ИИ за неделю: 1 вывод. Главное: Конвейер К-3 ломается чаще всех.',
    );
    expect(weeklyDigestBody(3, null)).toBe('Сводка ИИ за неделю: 3 вывода.');
    expect(weeklyDigestBody(7, 'Итог.')).toBe('Сводка ИИ за неделю: 7 выводов. Главное: Итог.');
    expect(weeklyDigestBody(11)).toBe('Сводка ИИ за неделю: 11 выводов.');
  });
});
