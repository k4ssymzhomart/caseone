import { describe, expect, it } from 'vitest';
import directories from '../../seed/directories.json';
import { jsonFileLedger, parseLedger } from './ledger.ts';
import {
  anthropicModelProfile,
  buildAnthropicRequest,
  createLlm,
  extractJson,
  isLlmError,
  llmConfigFromEnv,
  type LlmAuditRequest,
  type LlmAuditResponse,
  type LlmMessage,
} from './llm.ts';
import { estimateCost, priceFor } from './pricing.ts';
import { buildDirectory } from './privacy.ts';
import { SCHEMAS } from './schemas.ts';

const SONNET = 'claude-sonnet-5-5';
const HAIKU = 'claude-haiku-5-5';
const SAMPLING = ['temperature', 'top_p', 'top_k'];

function deepKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => deepKeys(v, out));
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      deepKeys(v, out);
    }
  }
  return out;
}

const messages: LlmMessage[] = [
  { role: 'user', content: 'Ответь JSON: ok true, echo «Рота готова»' },
];

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** A fetch that records the request and answers with `reply` (an Anthropic messages response). */
function fakeFetch(reply: unknown, status = 200): { fetch: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    return new Response(JSON.stringify(reply), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetch: fn, calls };
}

function anthropicReply(json: unknown, model = SONNET): unknown {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model,
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: JSON.stringify(json) },
    ],
    usage: { input_tokens: 1200, output_tokens: 300 },
  };
}

describe('anthropic request builder', () => {
  it('Sonnet 5.5 gets between_tools, effort low and the schema, no sampling parameters', () => {
    const body = buildAnthropicRequest({
      model: SONNET,
      system: 'S',
      messages,
      schema: SCHEMAS.verify,
      maxTokens: 4000,
    });
    expect(body.thinking).toEqual({ type: 'between_tools' });
    expect(body.output_config).toEqual({
      effort: 'low',
      format: { type: 'json_schema', schema: SCHEMAS.verify },
    });
    expect(body.model).toBe(SONNET);
    expect(body.max_tokens).toBe(4000);
    for (const key of SAMPLING) expect(deepKeys(body)).not.toContain(key);
  });

  it('Haiku 5.5 gets no thinking field, effort low and the schema', () => {
    const body = buildAnthropicRequest({
      model: HAIKU,
      system: 'S',
      messages,
      schema: SCHEMAS.smoke,
      maxTokens: 1024,
    });
    expect('thinking' in body).toBe(false);
    expect(body.output_config).toEqual({
      effort: 'low',
      format: { type: 'json_schema', schema: SCHEMAS.smoke },
    });
    for (const key of SAMPLING) expect(deepKeys(body)).not.toContain(key);
  });

  it('between_tools goes only to Sonnet 5.5', () => {
    expect(anthropicModelProfile(SONNET).thinking).toBe('between_tools');
    for (const model of [HAIKU, 'claude-opus-5-5', 'claude-sonnet-5', 'claude-haiku-4-5']) {
      expect(anthropicModelProfile(model).thinking).toBeNull();
    }
    expect(anthropicModelProfile('claude-haiku-4-5').effort).toBe(false);
  });

  it('images become base64 source blocks', () => {
    const body = buildAnthropicRequest({
      model: SONNET,
      system: 'S',
      schema: SCHEMAS.verify,
      maxTokens: 10,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', media_type: 'image/jpeg', data: 'QUJD' },
            { type: 'text', text: 'фото после' },
          ],
        },
      ],
    });
    expect(body.messages[0]?.content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
      { type: 'text', text: 'фото после' },
    ]);
  });
});

describe('anthropic call', () => {
  const directory = buildDirectory(directories.employees);

  it('posts the request, reads the text block after thinking, redacts, audits and rehydrates', async () => {
    const answer = { ok: true, echo: 'E01 готов' };
    const { fetch, calls } = fakeFetch(anthropicReply(answer));
    const started: LlmAuditRequest[] = [];
    const finished: LlmAuditResponse[] = [];
    const llm = createLlm({
      provider: 'anthropic',
      apiKey: 'test-key',
      spentUsd: () => 0,
      fetch,
      privacy: directory,
      audit: {
        start: (row) => {
          started.push(row);
          return 7;
        },
        finish: (id, row) => {
          expect(id).toBe(7);
          finished.push(row);
        },
      },
    });
    const r = await llm.call({
      purpose: 'smoke',
      model: SONNET,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Ахметов Ерлан, таб. 2001, проверь связь' },
            { type: 'image', media_type: 'image/png', data: 'QUJDRA==' },
          ],
        },
      ],
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call?.headers['x-api-key']).toBe('test-key');
    expect(call?.headers['anthropic-version']).toBe('2023-06-01');
    for (const key of SAMPLING) expect(deepKeys(call?.body)).not.toContain(key);
    const sent = JSON.stringify(call?.body);
    expect(sent).not.toContain('Ахметов');
    expect(sent).not.toContain('2001');
    expect(sent).toContain('E01, таб. E01, проверь связь');

    expect(r.data).toEqual({ ok: true, echo: 'Ахметов Е. готов' });
    expect(r.model).toBe(SONNET);
    expect(r.usage.input_tokens).toBe(1200);
    expect(r.costUsd).toBe(estimateCost(SONNET, { input_tokens: 1200, output_tokens: 300 }));
    expect(r.costUsd).toBeCloseTo(0.0054, 6);

    expect(started).toHaveLength(1);
    const audited = JSON.stringify(started[0]?.request_redacted);
    expect(audited).not.toContain('Ахметов');
    expect(audited).not.toContain('QUJDRA==');
    expect(finished[0]?.cost_usd).toBe(r.costUsd);
    expect(JSON.stringify(finished[0]?.response_redacted)).toContain('E01 готов');
  });

  it('the budget guard throws BUDGET_EXCEEDED before any request', async () => {
    const { fetch, calls } = fakeFetch(anthropicReply({ ok: true, echo: 'x' }));
    const llm = createLlm({
      provider: 'anthropic',
      apiKey: 'k',
      budgetUsd: 4,
      spentUsd: () => 3.9999,
      fetch,
    });
    await expect(llm.call({ purpose: 'verify', messages })).rejects.toMatchObject({
      code: 'BUDGET_EXCEEDED',
    });
    await expect(llm.call({ purpose: 'verify', messages })).rejects.toThrow(/^BUDGET_EXCEEDED/);
    expect(calls).toHaveLength(0);
  });

  it('the budget guard lets a call through under the cap', async () => {
    const { fetch, calls } = fakeFetch(anthropicReply({ ok: true, echo: 'x' }, HAIKU));
    const llm = createLlm({
      provider: 'anthropic',
      apiKey: 'k',
      budgetUsd: 4,
      spentUsd: async () => 1.5,
      fetch,
    });
    await expect(llm.call({ purpose: 'smoke', messages })).resolves.toMatchObject({
      data: { ok: true },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body.model).toBe(HAIKU);
  });

  it('refuses to start without a spend source or a key', () => {
    expect(() => createLlm({ provider: 'anthropic', apiKey: 'k' })).toThrow(/CONFIG/);
    expect(() => createLlm({ provider: 'anthropic', spentUsd: () => 0 })).toThrow(/CONFIG/);
  });

  it('maps HTTP errors with the status and the model id', async () => {
    const { fetch } = fakeFetch(
      { type: 'error', error: { type: 'not_found_error', message: 'model: claude-x' } },
      404,
    );
    const llm = createLlm({ provider: 'anthropic', apiKey: 'k', spentUsd: () => 0, fetch });
    const err = await llm
      .call({ purpose: 'smoke', model: 'claude-x', messages })
      .catch((e: unknown) => e);
    expect(isLlmError(err, 'HTTP')).toBe(true);
    expect(err).toMatchObject({ status: 404, model: 'claude-x' });
    expect(String((err as Error).message)).toContain('not_found_error');
  });

  it('times out through AbortController', async () => {
    const hang = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as typeof fetch;
    const llm = createLlm({
      provider: 'anthropic',
      apiKey: 'k',
      spentUsd: () => 0,
      fetch: hang,
      timeoutMs: 20,
    });
    await expect(llm.call({ purpose: 'smoke', messages })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('a refusal is an error the caller can fall back from', async () => {
    const { fetch } = fakeFetch({
      model: SONNET,
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'general_harms', explanation: '' },
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    });
    const llm = createLlm({ provider: 'anthropic', apiKey: 'k', spentUsd: () => 0, fetch });
    await expect(llm.call({ purpose: 'verify', messages })).rejects.toMatchObject({
      code: 'REFUSAL',
    });
  });
});

describe('helpers', () => {
  it('extractJson takes the text block that holds the JSON', () => {
    expect(extractJson(['Проверяю наряд.', '{"ok":true,"echo":"x"}'])).toEqual({
      ok: true,
      echo: 'x',
    });
    expect(extractJson(['```json\n{"a":1}\n```'])).toEqual({ a: 1 });
    expect(extractJson(['нет JSON'])).toBeUndefined();
  });

  it('pricing follows PHASE_0 0.8', () => {
    expect(estimateCost(SONNET, { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(12);
    expect(estimateCost(HAIKU, { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(0.6);
    expect(priceFor('claude-sonnet-5-5-20261001')).toEqual(priceFor(SONNET));
    expect(priceFor('some-local-model').input).toBeGreaterThanOrEqual(5);
  });

  it('llmConfigFromEnv defaults to mock and takes model overrides', () => {
    expect(llmConfigFromEnv(() => undefined).provider).toBe('mock');
    const env: Record<string, string> = {
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'k',
      LLM_MODEL_FAST: 'claude-haiku-4-5',
      LLM_BUDGET_USD: '2',
    };
    const cfg = llmConfigFromEnv((k) => env[k]);
    expect(cfg).toMatchObject({
      provider: 'anthropic',
      apiKey: 'k',
      budgetUsd: 2,
      models: { fast: 'claude-haiku-4-5' },
    });
    const llm = createLlm({ ...cfg, spentUsd: () => 0 });
    expect(llm.modelFor('smoke')).toBe('claude-haiku-4-5');
    expect(llm.modelFor('verify')).toBe(SONNET);
    expect(() => llmConfigFromEnv((k) => (k === 'LLM_PROVIDER' ? 'gpt' : undefined))).toThrow(
      /CONFIG/,
    );
  });

  it('the JSON ledger appends entries and sums the spend', async () => {
    let file: string | null = null;
    const ledger = jsonFileLedger({
      read: async () => file,
      write: async (t) => {
        file = t;
      },
      now: () => new Date('2026-10-08T10:00:00Z'),
    });
    expect(await ledger.spentUsd()).toBe(0);
    const row = { purpose: 'smoke' as const, model: HAIKU, request_redacted: {}, latency_ms: 5 };
    await ledger.audit.finish(null, {
      ...row,
      cost_usd: 0.0012,
      response_redacted: { usage: { input_tokens: 10, output_tokens: 5 } },
    });
    await ledger.audit.finish(null, {
      ...row,
      cost_usd: 0.0003,
      response_redacted: { error: 'HTTP' },
    });
    expect(await ledger.spentUsd()).toBe(0.0015);
    const parsed = parseLedger(file);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]).toMatchObject({
      input_tokens: 10,
      output_tokens: 5,
      cost_usd: 0.0012,
    });
    expect(parsed.entries[1]?.error).toBe('HTTP');
  });
});
