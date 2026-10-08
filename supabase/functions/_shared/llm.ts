// The one LLM client (CLAUDE.md §2, §16): redact → llm_audit (request) → provider → llm_audit (response, cost)
// → rehydrate. fetch only, no Deno or Node globals, so it runs in Edge Functions, Node scripts and vitest.
//
// Request rules for Anthropic:
// - never send temperature, top_p or top_k
// - Sonnet 5.5: thinking { type: 'between_tools' } (its lowest setting; 'disabled' is a 400)
// - Haiku 5.5: no thinking field
// - output_config { effort: 'low', format: { type: 'json_schema', schema } }
// - the answer is the text block that holds the JSON; thinking blocks may come first
// - 45 s timeout through AbortController, no retries (callers decide)

import type { EnvGetter } from './env.ts';
import { estimateCost, type LlmUsage } from './pricing.ts';
import type { PrivacyDirectory } from './privacy.ts';
import { SYSTEM_PROMPTS } from './prompts.ts';
import { SCHEMAS, type JsonSchema, type LlmPurpose, type PurposeOutput } from './schemas.ts';

export const LLM_PROVIDERS = ['mock', 'anthropic', 'openai_compatible'] as const;
export type LlmProviderName = (typeof LLM_PROVIDERS)[number];

export type ModelTier = 'smart' | 'fast';

/** Overridable with LLM_MODEL_SMART and LLM_MODEL_FAST. */
export const DEFAULT_MODELS: Readonly<Record<ModelTier, string>> = {
  smart: 'claude-sonnet-5-5',
  fast: 'claude-haiku-5-5',
};

export const PURPOSE_TIER: Readonly<Record<LlmPurpose, ModelTier>> = {
  verify: 'smart',
  insights: 'smart',
  shift_summary: 'smart',
  explain_rating: 'fast',
  parse_query: 'fast',
  smoke: 'fast',
};

/** Haiku thinks adaptively inside max_tokens, so its limits leave room above the short JSON answers. */
export const DEFAULT_MAX_TOKENS: Readonly<Record<LlmPurpose, number>> = {
  verify: 4000,
  insights: 8000,
  shift_summary: 3000,
  explain_rating: 1500,
  parse_query: 1500,
  smoke: 1024,
};

export const DEFAULT_TIMEOUT_MS = 45_000;
export const DEFAULT_BUDGET_USD = 4;
export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
export const ANTHROPIC_VERSION = '2023-06-01';

// ---------------------------------------------------------------------------
// messages, results, errors
// ---------------------------------------------------------------------------

export type LlmImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export type LlmContentPart =
  | { type: 'text'; text: string }
  /** Base64 without a data: prefix. Photos arrive compressed by the client (≤1600 px); never resize here. */
  | { type: 'image'; media_type: LlmImageMediaType; data: string };

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string | LlmContentPart[];
}

export interface LlmCallRequest<P extends LlmPurpose> {
  purpose: P;
  messages: LlmMessage[];
  /** Defaults to the model of the purpose's tier. */
  model?: string;
  /** Defaults to SYSTEM_PROMPTS[purpose]. */
  system?: string;
  /** Defaults to SCHEMAS[purpose]. */
  schema?: JsonSchema;
  maxTokens?: number;
}

export interface LlmResult<T> {
  /** Parsed JSON, rehydrated (pseudonyms → short names). */
  data: T;
  usage: LlmUsage;
  model: string;
  provider: LlmProviderName;
  latencyMs: number;
  costUsd: number;
  stopReason: string | null;
}

export const LLM_ERROR_CODES = [
  'BUDGET_EXCEEDED',
  'TIMEOUT',
  'HTTP',
  'NETWORK',
  'REFUSAL',
  'MAX_TOKENS',
  'BAD_RESPONSE',
  'CONFIG',
] as const;
export type LlmErrorCode = (typeof LLM_ERROR_CODES)[number];

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly status: number | null;
  readonly model: string | null;
  /** Tokens billed before the failure (refusal, max_tokens, unparsable answer). */
  readonly usage: LlmUsage | null;

  constructor(
    code: LlmErrorCode,
    message: string,
    extra: { status?: number | null; model?: string | null; usage?: LlmUsage | null } = {},
  ) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.status = extra.status ?? null;
    this.model = extra.model ?? null;
    this.usage = extra.usage ?? null;
  }
}

export function isLlmError(e: unknown, code?: LlmErrorCode): e is LlmError {
  return e instanceof LlmError && (code === undefined || e.code === code);
}

// ---------------------------------------------------------------------------
// audit and config
// ---------------------------------------------------------------------------

export interface LlmAuditRequest {
  purpose: LlmPurpose;
  model: string;
  /** What the provider receives: redacted text, images replaced by a size note. */
  request_redacted: unknown;
}

export interface LlmAuditResponse extends LlmAuditRequest {
  response_redacted: unknown;
  latency_ms: number;
  cost_usd: number;
}

/** llm_audit in Edge Functions, a JSON ledger in scripts. Failures of the sink never fail the call. */
export interface LlmAuditSink {
  /** Called before the provider; returns a row id for finish(). */
  start?(row: LlmAuditRequest): Promise<number | string | null> | number | string | null;
  finish(id: number | string | null, row: LlmAuditResponse): Promise<void> | void;
}

export interface LlmConfig {
  /** Default mock. */
  provider?: LlmProviderName;
  /** ANTHROPIC_API_KEY for anthropic; an optional bearer key for openai_compatible. */
  apiKey?: string;
  /** anthropic: defaults to https://api.anthropic.com. openai_compatible: LLM_BASE_URL (required). */
  baseUrl?: string;
  models?: Partial<Record<ModelTier, string>>;
  /** LLM_BUDGET_USD, default 4. */
  budgetUsd?: number;
  /** Money already spent (llm_audit in Edge Functions, .secrets/llm-ledger.json in scripts). Required for anthropic. */
  spentUsd?: () => number | Promise<number>;
  audit?: LlmAuditSink;
  privacy?: PrivacyDirectory;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => Date;
  onWarning?: (message: string) => void;
}

export interface Llm {
  readonly provider: LlmProviderName;
  modelFor(purpose: LlmPurpose): string;
  call<P extends LlmPurpose>(req: LlmCallRequest<P>): Promise<LlmResult<PurposeOutput[P]>>;
}

/** Builds the config from environment variables (Deno.env.get or process.env). */
export function llmConfigFromEnv(get: EnvGetter): LlmConfig {
  const raw = (get('LLM_PROVIDER') ?? '').trim() || 'mock';
  const provider = LLM_PROVIDERS.find((p) => p === raw);
  if (!provider) throw new LlmError('CONFIG', `CONFIG: unknown LLM_PROVIDER «${raw}»`);
  const budget = Number(get('LLM_BUDGET_USD') ?? DEFAULT_BUDGET_USD);
  const smart = get('LLM_MODEL_SMART')?.trim();
  const fast = get('LLM_MODEL_FAST')?.trim();
  const baseUrl = (
    provider === 'openai_compatible' ? get('LLM_BASE_URL') : get('ANTHROPIC_BASE_URL')
  )?.trim();
  const apiKey = provider === 'anthropic' ? get('ANTHROPIC_API_KEY') : get('LLM_API_KEY');
  return {
    provider,
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    models: { ...(smart ? { smart } : {}), ...(fast ? { fast } : {}) },
    budgetUsd: Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_BUDGET_USD,
  };
}

// ---------------------------------------------------------------------------
// anthropic request and response
// ---------------------------------------------------------------------------

export interface AnthropicModelProfile {
  thinking: 'between_tools' | null;
  effort: boolean;
}

/** Sonnet 5.5 takes between_tools; other models get no thinking field. Haiku 4.5 and older reject effort. */
export function anthropicModelProfile(model: string): AnthropicModelProfile {
  const id = model.replace(/^.*?(claude-)/, '$1');
  if (id.startsWith('claude-sonnet-5-5')) return { thinking: 'between_tools', effort: true };
  if (/^claude-(haiku-4|sonnet-4-5|3)/.test(id)) return { thinking: null, effort: false };
  return { thinking: null, effort: true };
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: LlmImageMediaType; data: string } };

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] }[];
  output_config: { effort?: 'low'; format: { type: 'json_schema'; schema: JsonSchema } };
  thinking?: { type: 'between_tools' };
}

export interface AnthropicRequestInput {
  model: string;
  system: string;
  messages: LlmMessage[];
  schema: JsonSchema;
  maxTokens: number;
}

export function buildAnthropicRequest(input: AnthropicRequestInput): AnthropicRequestBody {
  const profile = anthropicModelProfile(input.model);
  const body: AnthropicRequestBody = {
    model: input.model,
    max_tokens: input.maxTokens,
    system: input.system,
    messages: input.messages.map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string'
          ? m.content
          : m.content.map((p): AnthropicContentBlock =>
              p.type === 'text'
                ? { type: 'text', text: p.text }
                : {
                    type: 'image',
                    source: { type: 'base64', media_type: p.media_type, data: p.data },
                  },
            ),
    })),
    output_config: {
      ...(profile.effort ? { effort: 'low' as const } : {}),
      format: { type: 'json_schema', schema: input.schema },
    },
  };
  if (profile.thinking) body.thinking = { type: profile.thinking };
  return body;
}

interface ParsedAnswer {
  value: unknown;
  usage: LlmUsage;
  model: string;
  stopReason: string | null;
}

function toUsage(u: unknown): LlmUsage {
  const o = (u ?? {}) as Record<string, unknown>;
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    input_tokens: n(o.input_tokens ?? o.prompt_tokens),
    output_tokens: n(o.output_tokens ?? o.completion_tokens),
    cache_creation_input_tokens: n(o.cache_creation_input_tokens),
    cache_read_input_tokens: n(o.cache_read_input_tokens),
  };
}

/** The JSON answer: the last text block that parses as an object (fences tolerated), else all text joined. */
export function extractJson(texts: readonly string[]): unknown {
  const tryParse = (t: string): unknown => {
    const s = t
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    if (!s.startsWith('{')) return undefined;
    try {
      const v = JSON.parse(s) as unknown;
      return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : undefined;
    } catch {
      return undefined;
    }
  };
  for (let i = texts.length - 1; i >= 0; i--) {
    const v = tryParse(texts[i] ?? '');
    if (v !== undefined) return v;
  }
  return tryParse(texts.join(''));
}

export function parseAnthropicResponse(json: unknown, requestedModel: string): ParsedAnswer {
  const r = (json ?? {}) as {
    model?: unknown;
    stop_reason?: unknown;
    stop_details?: { category?: unknown; explanation?: unknown } | null;
    content?: unknown;
    usage?: unknown;
  };
  const usage = toUsage(r.usage);
  const model = typeof r.model === 'string' && r.model ? r.model : requestedModel;
  const stopReason = typeof r.stop_reason === 'string' ? r.stop_reason : null;
  if (stopReason === 'refusal') {
    const category =
      typeof r.stop_details?.category === 'string' ? r.stop_details.category : 'unknown';
    throw new LlmError('REFUSAL', `REFUSAL: ${model} declined (category ${category})`, {
      model,
      usage,
    });
  }
  if (stopReason === 'max_tokens') {
    throw new LlmError(
      'MAX_TOKENS',
      `MAX_TOKENS: ${model} hit max_tokens before finishing the JSON`,
      { model, usage },
    );
  }
  const blocks = Array.isArray(r.content)
    ? (r.content as { type?: unknown; text?: unknown }[])
    : [];
  const texts = blocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string);
  const value = extractJson(texts);
  if (value === undefined) {
    throw new LlmError(
      'BAD_RESPONSE',
      `BAD_RESPONSE: no JSON text block in the answer of ${model}`,
      { model, usage },
    );
  }
  return { value, usage, model, stopReason };
}

function httpError(status: number, bodyText: string, model: string): LlmError {
  let detail = bodyText.slice(0, 300);
  try {
    const j = JSON.parse(bodyText) as {
      error?: { type?: unknown; message?: unknown } | string;
      message?: unknown;
    };
    if (j.error && typeof j.error === 'object')
      detail = `${String(j.error.type ?? 'error')}: ${String(j.error.message ?? '')}`;
    else if (typeof j.error === 'string') detail = j.error;
    else if (typeof j.message === 'string') detail = j.message;
  } catch {
    // keep the raw text
  }
  return new LlmError('HTTP', `HTTP ${status} for model ${model}: ${detail}`, { status, model });
}

async function postJson(
  fetchFn: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  model: string,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw httpError(res.status, text, model);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new LlmError('BAD_RESPONSE', `BAD_RESPONSE: the body from ${model} is not JSON`, {
        model,
      });
    }
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if (controller.signal.aborted) {
      throw new LlmError('TIMEOUT', `TIMEOUT: no answer from ${model} within ${timeoutMs} ms`, {
        model,
      });
    }
    throw new LlmError('NETWORK', `NETWORK: ${e instanceof Error ? e.message : String(e)}`, {
      model,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// openai_compatible (on-prem model behind vLLM or Ollama; untested stub in Phase 0)
// ---------------------------------------------------------------------------

export function buildOpenAiRequest(
  input: AnthropicRequestInput & { name: string },
): Record<string, unknown> {
  return {
    model: input.model,
    max_tokens: input.maxTokens,
    messages: [
      { role: 'system', content: input.system },
      ...input.messages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === 'string'
            ? m.content
            : m.content.map((p) =>
                p.type === 'text'
                  ? { type: 'text', text: p.text }
                  : {
                      type: 'image_url',
                      image_url: { url: `data:${p.media_type};base64,${p.data}` },
                    },
              ),
      })),
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: input.name, strict: true, schema: input.schema },
    },
  };
}

function parseOpenAiResponse(json: unknown, requestedModel: string): ParsedAnswer {
  const r = (json ?? {}) as { model?: unknown; choices?: unknown; usage?: unknown };
  const usage = toUsage(r.usage);
  const model = typeof r.model === 'string' && r.model ? r.model : requestedModel;
  const choice = (Array.isArray(r.choices) ? r.choices[0] : undefined) as
    { finish_reason?: unknown; message?: { content?: unknown } } | undefined;
  const stopReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null;
  if (stopReason === 'length') {
    throw new LlmError(
      'MAX_TOKENS',
      `MAX_TOKENS: ${model} hit max_tokens before finishing the JSON`,
      { model, usage },
    );
  }
  const content = choice?.message?.content;
  const value = typeof content === 'string' ? extractJson([content]) : undefined;
  if (value === undefined) {
    throw new LlmError('BAD_RESPONSE', `BAD_RESPONSE: no JSON in the answer of ${model}`, {
      model,
      usage,
    });
  }
  return { value, usage, model, stopReason };
}

// ---------------------------------------------------------------------------
// mock (deterministic, schema valid; the default in development)
// ---------------------------------------------------------------------------

function messageText(messages: readonly LlmMessage[]): string {
  return messages
    .flatMap((m) =>
      typeof m.content === 'string'
        ? [m.content]
        : m.content.map((p) => (p.type === 'text' ? p.text : '')),
    )
    .join('\n');
}

function imageCount(messages: readonly LlmMessage[]): number {
  return messages.reduce(
    (n, m) =>
      n + (typeof m.content === 'string' ? 0 : m.content.filter((p) => p.type === 'image').length),
    0,
  );
}

/** ISO 8601 in Asia/Qostanay (fixed UTC+5), seconds precision. */
function qostanayIso(d: Date): string {
  return `${new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 19)}+05:00`;
}

export function mockAnswer<P extends LlmPurpose>(
  purpose: P,
  messages: readonly LlmMessage[],
  now: Date,
): PurposeOutput[P] {
  const text = messageText(messages);
  const answers: { [K in LlmPurpose]: () => PurposeOutput[K] } = {
    smoke: () => ({ ok: true, echo: 'Рота готова' }),
    verify: () => {
      const photo = imageCount(messages) > 0;
      const code = /[МЭГПС]-0\d/u.exec(text)?.[0] ?? 'Г-01';
      return {
        work_match: {
          verdict: 'full',
          explanation: 'Тестовый режим ИИ: работы соответствуют описанию проблемы.',
        },
        code_consistent: true,
        suggested_code: code,
        materials_logic: {
          verdict: 'ok',
          explanation: 'Тестовый режим ИИ: материалы соответствуют виду работ.',
        },
        photo: photo
          ? {
              after_present: true,
              same_equipment: 'yes',
              problem_resolved: 'yes',
              quality_issues: [],
              score_1_5: 4,
              explanation: 'Тестовый режим ИИ: фото не анализировалось.',
            }
          : {
              after_present: false,
              same_equipment: 'unsure',
              problem_resolved: 'not_applicable',
              quality_issues: [],
              score_1_5: 1,
              explanation: 'Фото после работ нет.',
            },
        confidence: photo ? 0.8 : 0.7,
        feedback_worker: {
          good: ['Работы описаны понятно.'],
          improve: [
            photo ? 'Снимайте узел крупно и при хорошем свете.' : 'Прикладывайте фото после работ.',
          ],
        },
        summary_master:
          'Тестовый режим ИИ: ответ сформирован без модели. Проверьте наряд по правилам и фото.',
      };
    },
    insights: () => ({
      cards: [
        {
          kind: 'top_equipment',
          severity: 'critical',
          title: 'Конвейер К-3: частые внеплановые остановки',
          body: 'Конвейер К-3: 7 внеплановых остановок за 30 дней, 5 из них шифр М-02 (подшипник).',
          recommendation: 'Проверить соосность привода и включить в план ППР.',
          evidence: {
            order_ids: [],
            stats: [
              { key: 'unplanned_30d', value: 7, unit: 'шт' },
              { key: 'm02_30d', value: 5, unit: 'шт' },
            ],
          },
        },
      ],
    }),
    shift_summary: () => ({
      summary: [
        'Тестовый режим ИИ: сводка сформирована без модели.',
        'Смена прошла без аварийных остановок оборудования.',
        'Все выданные наряды приняты в работу.',
        'Просроченных нарядов нет.',
        'Загрузка исполнителей равномерная.',
      ].join(' '),
      recommendations: [
        'Проверить запас подшипников на складе перед ночной сменой.',
        'Закрыть наряды, которые ждут подтверждения мастера.',
        'Назначить осмотр конвейера К-3.',
      ],
    }),
    explain_rating: () => ({
      text: 'Рейтинг поддерживает высокая доля нарядов, закрытых в срок. Снижают его наряды, возвращённые на доработку. Чтобы подняться, прикладывайте фото после работ и сверяйте материалы с нормой.',
    }),
    parse_query: () => {
      const q = text.toLowerCase();
      const area = /карьер/.test(q)
        ? 1
        : /дробл/.test(q)
          ? 2
          : /обогащ/.test(q)
            ? 3
            : /отгруз/.test(q)
              ? 4
              : null;
      const hours = /месяц/.test(q)
        ? 720
        : /недел/.test(q)
          ? 168
          : /сутк|сегодня/.test(q)
            ? 24
            : /смен/.test(q)
              ? 12
              : 0;
      const focus = (
        [
          [/оборудован/, 'top_equipment'],
          [/повтор/, 'repeat_faults'],
          [/ппр/, 'post_ppr'],
          [/ноч|час/, 'time_patterns'],
          [/материал|расход/, 'materials'],
          [/рост|тренд/, 'trend'],
        ] as const
      )
        .filter(([re]) => re.test(q))
        .map(([, kind]) => kind);
      return {
        area_id: area,
        from: hours > 0 ? qostanayIso(new Date(now.getTime() - hours * 3600_000)) : null,
        to: hours > 0 ? qostanayIso(now) : null,
        focus,
      };
    },
  };
  return answers[purpose]() as PurposeOutput[P];
}

// ---------------------------------------------------------------------------
// the client
// ---------------------------------------------------------------------------

/** Rough upper bound of input tokens: Cyrillic text runs about 2 characters per token, images at most ~2500. */
export function estimateInputTokens(
  system: string,
  messages: readonly LlmMessage[],
  schema: JsonSchema,
): number {
  let chars = system.length + JSON.stringify(schema).length;
  let images = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') chars += m.content.length;
    else
      for (const p of m.content) {
        if (p.type === 'text') chars += p.text.length;
        else images += 1;
      }
  }
  return Math.ceil(chars / 2) + images * 2500 + 50;
}

/** The request as llm_audit stores it: base64 images replaced by their size. */
function auditMessages(messages: readonly LlmMessage[]): unknown[] {
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === 'string'
        ? m.content
        : m.content.map((p) =>
            p.type === 'text'
              ? p
              : {
                  type: 'image',
                  media_type: p.media_type,
                  bytes: Math.floor((p.data.length * 3) / 4),
                },
          ),
  }));
}

export function createLlm(config: LlmConfig = {}): Llm {
  const provider = config.provider ?? 'mock';
  const fetchFn = config.fetch ?? ((input, init) => fetch(input, init));
  const now = config.now ?? (() => new Date());
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const budgetUsd = config.budgetUsd ?? DEFAULT_BUDGET_USD;
  const models: Record<ModelTier, string> = {
    smart: config.models?.smart || DEFAULT_MODELS.smart,
    fast: config.models?.fast || DEFAULT_MODELS.fast,
  };
  const privacy = config.privacy;
  const warn = (msg: string): void => config.onWarning?.(msg);

  if (provider === 'anthropic') {
    if (!config.apiKey) throw new LlmError('CONFIG', 'CONFIG: ANTHROPIC_API_KEY is not set');
    if (!config.spentUsd)
      throw new LlmError(
        'CONFIG',
        'CONFIG: the anthropic provider needs spentUsd for the budget guard',
      );
  }
  if (provider === 'openai_compatible' && !config.baseUrl) {
    throw new LlmError('CONFIG', 'CONFIG: LLM_BASE_URL is not set for openai_compatible');
  }

  const modelFor = (purpose: LlmPurpose): string => models[PURPOSE_TIER[purpose]];

  const safe = async <T>(fn: () => T | Promise<T>, what: string): Promise<T | null> => {
    try {
      return await fn();
    } catch (e) {
      warn(`llm audit ${what} failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };

  async function call<P extends LlmPurpose>(
    req: LlmCallRequest<P>,
  ): Promise<LlmResult<PurposeOutput[P]>> {
    const purpose = req.purpose;
    const model = req.model ?? modelFor(purpose);
    const schema = req.schema ?? SCHEMAS[purpose];
    const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS[purpose];
    const rawSystem = req.system ?? SYSTEM_PROMPTS[purpose];
    const system = privacy ? privacy.redact(rawSystem) : rawSystem;
    const messages: LlmMessage[] = req.messages.map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string'
          ? privacy
            ? privacy.redact(m.content)
            : m.content
          : m.content.map((p) =>
              p.type === 'text' && privacy ? { type: 'text', text: privacy.redact(p.text) } : p,
            ),
    }));

    if (provider === 'anthropic') {
      // Fail closed: when the spent sum cannot be read (llm_audit down), no paid call goes out.
      let spent: number;
      try {
        spent = Number((await config.spentUsd?.()) ?? 0);
      } catch (e) {
        throw new LlmError(
          'BUDGET_EXCEEDED',
          `BUDGET_EXCEEDED: the spent sum could not be read (${e instanceof Error ? e.message : String(e)})`,
          { model },
        );
      }
      const estimate = estimateCost(model, {
        input_tokens: estimateInputTokens(system, messages, schema),
        output_tokens: maxTokens,
      });
      if (!Number.isFinite(spent) || spent + estimate > budgetUsd) {
        throw new LlmError(
          'BUDGET_EXCEEDED',
          `BUDGET_EXCEEDED: spent ${spent.toFixed(4)} + estimate ${estimate.toFixed(4)} > budget ${budgetUsd} USD`,
          { model },
        );
      }
    }

    const request_redacted = {
      provider,
      model,
      max_tokens: maxTokens,
      system,
      messages: auditMessages(messages),
    };
    const auditId = config.audit?.start
      ? await safe(
          () => config.audit?.start?.({ purpose, model, request_redacted }) ?? null,
          'start',
        )
      : null;
    const t0 = Date.now();
    const finish = async (
      response_redacted: unknown,
      cost_usd: number,
      resultModel: string,
    ): Promise<void> => {
      const audit = config.audit;
      if (!audit) return;
      await safe(
        () =>
          audit.finish(auditId, {
            purpose,
            model: resultModel,
            request_redacted,
            response_redacted,
            latency_ms: Date.now() - t0,
            cost_usd,
          }),
        'finish',
      );
    };

    let parsed: ParsedAnswer;
    try {
      if (provider === 'mock') {
        parsed = {
          value: mockAnswer(purpose, messages, now()),
          usage: { input_tokens: 0, output_tokens: 0 },
          model: 'mock',
          stopReason: 'end_turn',
        };
      } else if (provider === 'anthropic') {
        const body = buildAnthropicRequest({ model, system, messages, schema, maxTokens });
        const base = (config.baseUrl ?? ANTHROPIC_BASE_URL).replace(/\/+$/, '');
        const json = await postJson(
          fetchFn,
          `${base}/v1/messages`,
          { 'x-api-key': config.apiKey ?? '', 'anthropic-version': ANTHROPIC_VERSION },
          body,
          timeoutMs,
          model,
        );
        parsed = parseAnthropicResponse(json, model);
      } else {
        const body = buildOpenAiRequest({
          model,
          system,
          messages,
          schema,
          maxTokens,
          name: purpose,
        });
        const base = (config.baseUrl ?? '').replace(/\/+$/, '');
        const json = await postJson(
          fetchFn,
          `${base}/chat/completions`,
          config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
          body,
          timeoutMs,
          model,
        );
        parsed = parseOpenAiResponse(json, model);
      }
    } catch (e) {
      const err =
        e instanceof LlmError
          ? e
          : new LlmError('BAD_RESPONSE', `BAD_RESPONSE: ${String(e)}`, { model });
      const cost =
        provider === 'anthropic' && err.usage ? estimateCost(err.model ?? model, err.usage) : 0;
      await finish(
        { error: err.code, message: err.message, usage: err.usage },
        cost,
        err.model ?? model,
      );
      throw err;
    }

    const latencyMs = Date.now() - t0;
    // On-prem models have no per-token price in USD.
    const costUsd = provider === 'anthropic' ? estimateCost(parsed.model, parsed.usage) : 0;
    await finish(
      {
        value: privacy ? privacy.redact(parsed.value) : parsed.value,
        usage: parsed.usage,
        stop_reason: parsed.stopReason,
      },
      costUsd,
      parsed.model,
    );
    const data = (privacy ? privacy.rehydrate(parsed.value) : parsed.value) as PurposeOutput[P];
    return {
      data,
      usage: parsed.usage,
      model: parsed.model,
      provider,
      latencyMs,
      costUsd,
      stopReason: parsed.stopReason,
    };
  }

  return { provider, modelFor, call };
}
