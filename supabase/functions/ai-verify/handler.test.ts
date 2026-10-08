import { describe, expect, it } from 'vitest';
import directories from '../../seed/directories.json';
import type { LlmAuditRequest, LlmConfig } from '../_shared/llm.ts';
import type { DirectoryEmployee } from '../_shared/privacy.ts';
import type { VerifyAnswer } from '../_shared/schemas.ts';
import type { VerifyUser } from './auth.ts';
import {
  DbError,
  handleVerifyRequest,
  parseOrderId,
  type VerifyDb,
  type VerifyReview,
} from './handler.ts';
import type { VerifyContext } from '../_shared/verifyInput.ts';
import type { RetryClock, RetryPolicy } from './retry.ts';
import { demoContext, jpegBytes, NAMES_IN_FIXTURE } from './test-fixtures.ts';

const SECRET = 'sb_secret_test_value_0123456789';
const URL_ = 'https://example.supabase.co/functions/v1/ai-verify';

interface Submitted {
  orderId: number;
  llm: VerifyAnswer | null;
  meta: Record<string, unknown>;
}

function fakeDb(
  opts: {
    ctx?: VerifyContext | null;
    users?: Record<string, VerifyUser>;
    assignee?: string;
    existing?: VerifyReview | null;
    submitError?: Error;
    /** An error for this submit (null lets it through); called before every submit. */
    submitFails?: (llm: VerifyAnswer | null) => Error | null;
    employees?: () => Promise<DirectoryEmployee[]>;
  } = {},
) {
  const submitted: Submitted[] = [];
  const downloads: string[] = [];
  const ctx = opts.ctx === undefined ? demoContext() : opts.ctx;
  const db: VerifyDb = {
    getUser: async (token) => opts.users?.[token] ?? null,
    orderAssignee: async () => ({ assignee_id: opts.assignee ?? 'worker-1' }),
    context: async () => ctx,
    review: async () => opts.existing ?? null,
    employees: opts.employees ?? (async () => directories.employees),
    download: async (path) => {
      downloads.push(path);
      return jpegBytes(path.includes('after') ? 4096 : 2048);
    },
    submit: async (orderId, llm, meta) => {
      if (opts.submitError) throw opts.submitError;
      const fail = opts.submitFails?.(llm);
      if (fail) throw fail;
      submitted.push({ orderId, llm, meta });
      return {
        id: 77,
        order_id: orderId,
        attempt: Number(meta.attempt ?? 1),
        verdict: llm ? 'accepted' : 'accepted_with_remarks',
        score: llm ? 92 : 100,
        needs_master_review: !llm,
        model: String(meta.model),
      };
    },
  };
  return { db, submitted, downloads };
}

const instantClock: RetryClock = { now: () => 0, sleep: async () => {} };
const fastPolicy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 0,
  attemptTimeoutMs: 45_000,
  deadlineMs: 100_000,
  minAttemptMs: 0,
};

function post(body: unknown, headers: Record<string, string> = { apikey: SECRET }): Request {
  return new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function run(
  req: Request,
  db: VerifyDb,
  llmConfig: () => LlmConfig = () => ({ provider: 'mock' }),
) {
  const logs: Record<string, unknown>[] = [];
  const res = handleVerifyRequest(req, {
    db,
    secrets: [SECRET],
    llmConfig,
    policy: fastPolicy,
    clock: instantClock,
    log: (e) => logs.push(e),
  });
  return { res, logs };
}

/** Anthropic answers: a list of [status, body] consumed in order; records every request body. */
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

const GOOD: VerifyAnswer = {
  work_match: { verdict: 'full', explanation: 'Течь устранена, E01 заменил кольцо' },
  code_consistent: true,
  suggested_code: 'Г-01',
  materials_logic: { verdict: 'ok', explanation: 'по норме' },
  photo: {
    after_present: true,
    same_equipment: 'yes',
    problem_resolved: 'yes',
    quality_issues: [],
    score_1_5: 5,
    explanation: 'масла нет',
  },
  confidence: 0.9,
  feedback_worker: { good: ['Течь устранена'], improve: [] },
  summary_master: 'E01 устранил течь',
};

const sonnetReply = (json: unknown) => ({
  id: 'msg',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5-5',
  stop_reason: 'end_turn',
  content: [
    { type: 'thinking', thinking: '', signature: 's' },
    { type: 'text', text: JSON.stringify(json) },
  ],
  usage: { input_tokens: 6000, output_tokens: 500 },
});

function anthropicConfig(
  fetchFn: typeof fetch,
  spent = 0.001,
  audits: LlmAuditRequest[] = [],
): () => LlmConfig {
  return () => ({
    provider: 'anthropic',
    apiKey: 'test-key',
    budgetUsd: 4,
    spentUsd: () => spent,
    fetch: fetchFn,
    audit: {
      start: (row) => {
        audits.push(row);
        return audits.length;
      },
      finish: () => {},
    },
  });
}

describe('request handling', () => {
  it('answers the CORS preflight and refuses other methods', async () => {
    const { db } = fakeDb();
    const pre = await run(new Request(URL_, { method: 'OPTIONS' }), db).res;
    expect(pre.status).toBe(200);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    expect(
      (await run(new Request(URL_, { method: 'GET', headers: { apikey: SECRET } }), db).res).status,
    ).toBe(405);
  });

  it('needs the secret key or a user session', async () => {
    const { db } = fakeDb();
    expect((await run(post({ order_id: 1 }, {}), db).res).status).toBe(401);
    expect((await run(post({ order_id: 1 }, { apikey: 'sb_publishable_x' }), db).res).status).toBe(
      401,
    );
    expect(
      (await run(post({ order_id: 1 }, { authorization: 'Bearer expired' }), db).res).status,
    ).toBe(401);
  });

  it('checks the body', async () => {
    const { db } = fakeDb();
    expect((await run(post({}), db).res).status).toBe(400);
    expect((await run(post({ order_id: -3 }), db).res).status).toBe(400);
    expect(parseOrderId({ order_id: '147' })).toBe(147);
    expect(parseOrderId({ order_id: 1.5 })).toBeNull();
  });

  it('lets the assignee and staff in, keeps other workers out', async () => {
    const users = {
      w1: { id: 'worker-1', role: 'worker' },
      w2: { id: 'worker-2', role: 'worker' },
      m1: { id: 'master-1', role: 'master' },
    };
    const auth = (t: string) => ({ apikey: 'sb_publishable_x', authorization: `Bearer ${t}` });
    expect((await run(post({ order_id: 9001 }, auth('w2')), fakeDb({ users }).db).res).status).toBe(
      403,
    );
    expect((await run(post({ order_id: 9001 }, auth('w1')), fakeDb({ users }).db).res).status).toBe(
      200,
    );
    expect((await run(post({ order_id: 9001 }, auth('m1')), fakeDb({ users }).db).res).status).toBe(
      200,
    );
  });

  it('returns 404 for an unknown order and 409 for an order that is not waiting for a check', async () => {
    expect((await run(post({ order_id: 5 }), fakeDb({ ctx: null }).db).res).status).toBe(404);
    const res = await run(
      post({ order_id: 5 }),
      fakeDb({ ctx: demoContext({ status: 'in_progress' }) }).db,
    ).res;
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'NOT_IN_REVIEW', status: 'in_progress' });
  });

  it('exits at once with the existing review when the attempt is already reviewed', async () => {
    const existing: VerifyReview = {
      id: 5,
      order_id: 9001,
      attempt: 1,
      verdict: 'accepted',
      score: 90,
      needs_master_review: false,
      model: 'mock',
    };
    const { db, submitted, downloads } = fakeDb({
      ctx: demoContext({ already_reviewed: true, status: 'closed' }),
      existing,
    });
    const res = await run(post({ order_id: 9001, source: 'watchdog' }), db).res;
    expect(await res.json()).toEqual({ review: existing, already_reviewed: true });
    expect(submitted).toHaveLength(0);
    expect(downloads).toHaveLength(0);
  });

  it('maps a stale attempt from ai_submit to 409', async () => {
    const { db } = fakeDb({ submitError: new DbError('BAD_TRANSITION', 'P0001') });
    const res = await run(post({ order_id: 9001 }), db).res;
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'BAD_TRANSITION' });
  });
});

describe('the check', () => {
  it('mock provider: downloads both photos, submits a schema valid answer with model and latency', async () => {
    const { db, submitted, downloads } = fakeDb();
    const { res, logs } = run(post({ order_id: 9001 }), db);
    const out = (await (await res).json()) as { review: VerifyReview };
    expect(out.review.id).toBe(77);
    expect(downloads).toEqual(['orders/aaaa/before/1.jpg', 'orders/aaaa/after/2.jpg']);
    expect(submitted).toHaveLength(1);
    const s = submitted[0];
    expect(s?.llm?.work_match.verdict).toBe('full');
    expect(s?.llm?.suggested_code).toBe('Г-01');
    expect(s?.meta).toMatchObject({ model: 'mock', attempt: 1, provider: 'mock', tries: 1 });
    expect(typeof s?.meta.latency_ms).toBe('number');
    const done = logs.find((l) => l.event === 'reviewed');
    expect(done).toMatchObject({ order_id: 9001, model: 'mock', review_id: 77, images: 2 });
    expect(JSON.stringify(logs)).not.toMatch(/Ахметов|Течь|base64|sb_secret/);
  });

  it('anthropic: Sonnet request without sampling parameters, names redacted, photos as base64, answer rehydrated', async () => {
    const { fetchFn, bodies } = anthropicFetch([[200, sonnetReply(GOOD)]]);
    const audits: LlmAuditRequest[] = [];
    const { db, submitted } = fakeDb();
    const res = await run(post({ order_id: 9001 }), db, anthropicConfig(fetchFn, 0.001, audits))
      .res;
    expect(res.status).toBe(200);
    expect(bodies).toHaveLength(1);

    const body = bodies[0] ?? {};
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.thinking).toEqual({ type: 'between_tools' });
    expect(body.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
    for (const k of ['temperature', 'top_p', 'top_k']) expect(body).not.toHaveProperty(k);

    const sent = JSON.stringify(body.messages);
    for (const name of NAMES_IN_FIXTURE) expect(sent).not.toContain(name);
    expect(sent).toContain('"media_type":"image/jpeg"');
    const audit = JSON.stringify(audits);
    for (const name of NAMES_IN_FIXTURE) expect(audit).not.toContain(name);
    expect(audit).not.toContain('"data"');

    // pseudonyms in the answer come back as short names for display; numbers stay as they were
    expect(submitted[0]?.llm?.summary_master).toBe('Ахметов Е. устранил течь');
    expect(submitted[0]?.llm?.confidence).toBe(0.9);
    expect(submitted[0]?.meta).toMatchObject({
      model: 'claude-sonnet-5-5',
      provider: 'anthropic',
      tries: 1,
    });
  });

  it('retries a 529 and an unparsable answer, then succeeds on the third call', async () => {
    const { fetchFn, bodies } = anthropicFetch([
      [529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }],
      [200, sonnetReply({ nonsense: true })],
      [200, sonnetReply(GOOD)],
    ]);
    const { db, submitted } = fakeDb();
    const { res, logs } = run(post({ order_id: 9001 }), db, anthropicConfig(fetchFn));
    expect((await res).status).toBe(200);
    expect(bodies).toHaveLength(3);
    expect(submitted[0]?.llm).not.toBeNull();
    expect(submitted[0]?.meta.tries).toBe(3);
    expect(logs.filter((l) => l.event === 'llm_retry').map((l) => l.error)).toEqual([
      'HTTP',
      'BAD_RESPONSE',
    ]);
  });

  it('after 3 failed calls writes a rules-only review with a Russian reason', async () => {
    const err: [number, unknown] = [
      500,
      { type: 'error', error: { type: 'api_error', message: 'x' } },
    ];
    const { fetchFn, bodies } = anthropicFetch([err, err, err]);
    const { db, submitted } = fakeDb();
    const res = await run(post({ order_id: 9001 }), db, anthropicConfig(fetchFn)).res;
    expect(await res.json()).toMatchObject({ rules_only: true, review: { id: 77 } });
    expect(bodies).toHaveLength(3);
    expect(submitted[0]?.llm).toBeNull();
    expect(submitted[0]?.meta).toMatchObject({
      model: 'rules',
      llm_model: 'claude-sonnet-5-5',
      error: 'сервис ИИ недоступен',
      error_code: 'HTTP',
      attempt: 1,
      tries: 3,
    });
  });

  it('BUDGET_EXCEEDED: no provider call at all, rules-only review at once', async () => {
    const { fetchFn, bodies } = anthropicFetch([[200, sonnetReply(GOOD)]]);
    const { db, submitted } = fakeDb();
    await run(post({ order_id: 9001 }), db, anthropicConfig(fetchFn, 3.999)).res;
    expect(bodies).toHaveLength(0);
    expect(submitted[0]?.llm).toBeNull();
    expect(submitted[0]?.meta).toMatchObject({
      error_code: 'BUDGET_EXCEEDED',
      error: 'бюджет ИИ исчерпан',
      tries: 1,
    });
  });

  it('a missing API key (anthropic without ANTHROPIC_API_KEY) also ends in a rules-only review', async () => {
    const { db, submitted } = fakeDb();
    await run(post({ order_id: 9001 }), db, () => ({ provider: 'anthropic', spentUsd: () => 0 }))
      .res;
    expect(submitted[0]?.meta).toMatchObject({ error_code: 'CONFIG', model: 'rules', tries: 1 });
  });

  it('an order without photos is still checked, with no downloads', async () => {
    const { db, submitted, downloads } = fakeDb({ ctx: demoContext({ photos: [] }) });
    await run(post({ order_id: 9001 }), db).res;
    expect(downloads).toHaveLength(0);
    expect(submitted[0]?.llm?.photo.after_present).toBe(false);
  });
});

describe('hardening', () => {
  it('privacy: an empty directory or one without the worker sends nothing to the model', async () => {
    for (const employees of [
      async () => [],
      async () => directories.employees.filter((e) => e.pseudonym !== 'E01'),
    ]) {
      const { fetchFn, bodies } = anthropicFetch([[200, sonnetReply(GOOD)]]);
      const { db, submitted } = fakeDb({ employees });
      const res = await run(post({ order_id: 9001 }), db, anthropicConfig(fetchFn)).res;
      expect(await res.json()).toMatchObject({ rules_only: true });
      expect(bodies).toHaveLength(0);
      expect(submitted[0]?.llm).toBeNull();
      expect(submitted[0]?.meta).toMatchObject({ error_code: 'CONFIG', error: 'ИИ не настроен' });
    }
  });

  it('a failed directory read ends in a rules-only review, not in a 500 without a review', async () => {
    const { fetchFn, bodies } = anthropicFetch([[200, sonnetReply(GOOD)]]);
    const { db, submitted } = fakeDb({
      employees: async () => {
        throw new DbError('connection reset');
      },
    });
    const res = await run(post({ order_id: 9001 }), db, anthropicConfig(fetchFn)).res;
    expect(res.status).toBe(200);
    expect(bodies).toHaveLength(0);
    expect(submitted[0]?.meta).toMatchObject({ error_code: 'INPUT', model: 'rules' });
  });

  it('an answer the database refuses still leaves a rules-only review', async () => {
    const { db, submitted } = fakeDb({
      submitFails: (llm) =>
        llm ? new DbError('unsupported Unicode escape sequence', '22P05') : null,
    });
    const { res, logs } = run(post({ order_id: 9001 }), db);
    expect(await (await res).json()).toMatchObject({ rules_only: true, review: { id: 77 } });
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.llm).toBeNull();
    expect(submitted[0]?.meta).toMatchObject({
      error_code: 'SUBMIT',
      error: 'ответ ИИ не сохранён',
    });
    expect(logs.find((l) => l.event === 'submit_fallback')).toMatchObject({ error: '22P05' });
    expect(JSON.stringify(logs)).not.toContain('Unicode');
  });

  it('two calls for the same attempt at once share one model call', async () => {
    const { fetchFn, bodies } = anthropicFetch([[200, sonnetReply(GOOD)]]);
    const { db, submitted } = fakeDb();
    const config = anthropicConfig(fetchFn);
    const a = run(post({ order_id: 9001, source: 'app' }), db, config);
    const b = run(post({ order_id: 9001, source: 'retry' }), db, config);
    const [ra, rb] = await Promise.all([a.res, b.res]);
    expect(bodies).toHaveLength(1);
    expect(submitted).toHaveLength(1);
    expect(await ra.json()).toEqual(await rb.json());
    expect(b.logs.some((l) => l.event === 'joined')).toBe(true);
    // the next call after both finished runs again (here: a fresh check, as the fake has no stored review)
    await run(post({ order_id: 9001 }), db, config).res;
    expect(submitted).toHaveLength(2);
  });

  it('an already reviewed attempt never reaches the model, even when the row lookup comes back empty', async () => {
    const { fetchFn, bodies } = anthropicFetch([[200, sonnetReply(GOOD)]]);
    const { db, submitted } = fakeDb({ ctx: demoContext({ already_reviewed: true }) });
    const res = await run(post({ order_id: 9001 }), db, anthropicConfig(fetchFn)).res;
    expect(await res.json()).toMatchObject({ already_reviewed: true, review: { id: 77 } });
    expect(bodies).toHaveLength(0);
    expect(submitted[0]).toMatchObject({ llm: null, meta: { attempt: 1 } });
  });

  it('logs the source as a short token only', async () => {
    const { db } = fakeDb();
    const { res, logs } = run(
      post({ order_id: 9001, source: 'Ахметов Ерлан, тел 8 707 123 45 67' }),
      db,
    );
    await res;
    expect(logs.find((l) => l.event === 'reviewed')?.source).toBe('other');
    expect(JSON.stringify(logs)).not.toMatch(/Ахметов|707/);
  });
});
