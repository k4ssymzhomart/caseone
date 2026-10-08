// ai-insights request handling (CLAUDE.md §15), with the database and the LLM config injected, so the whole flow
// runs in vitest with fakes, in Node scripts (tools/ai-insights-check.ts) and in Deno with supabase-js (index.ts).
//
// POST {from, to, filters, query?}   signed-in master, manager or admin, or the secret key
//   1. the question, if any: Haiku 5.5 (parse_query) reads it into {area_id, from, to, focus}; the keyword
//      reader (scope.ts) covers the mock provider and a failed call
//   2. cards of the same scope made within the cache window come back as they are (no second model call)
//   3. public.analytics_bundle for the scope; Sonnet 5.5 writes the cards from the compact rows (cards.ts); a card
//      with a number the rows do not hold is dropped and the rules card of its kind takes its place
//   4. no model (mock provider, no key, BUDGET_EXCEEDED, any failure, nothing found): public.insight_cards
//   5. the cards go into ai_insights with the scope; the answer is {cards, scope}
// POST {digest: true}                 the secret key only (the Monday cron through pg_net)
//   the same for the 7 local days before today, then weekly_digest to every master and manager, once per week.
//
// Logs carry the caller kind, provider, model, cost, latency, counts and error codes only: never the question,
// the card text or a key.

import { callerFromHeaders, isStaff, type AuthUser } from '../_shared/auth.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { createLlm, isLlmError, type Llm, type LlmConfig } from '../_shared/llm.ts';
import {
  buildDirectory,
  type DirectoryEmployee,
  type PrivacyDirectory,
} from '../_shared/privacy.ts';
import { INSIGHTS_PROMPT_VERSION } from '../_shared/prompts.ts';
import {
  assembleCards,
  collectRefs,
  focusCards,
  hasFindings,
  insightsMessage,
  mergeWithRules,
  normalizeRuleCard,
  type AnalyticsBundle,
  type Card,
  type Dropped,
} from './cards.ts';
import { digestNotifications, type DigestNotification } from './digest.ts';
import {
  cacheKey,
  cacheTtlMs,
  digestPeriod,
  localDay,
  parseQueryMessage,
  readingFromAnswer,
  requestPeriod,
  resolveScope,
  ruleReading,
  sanitizeFilters,
  sanitizeQuery,
  type Area,
  type InsightFilters,
  type ParsedBy,
  type QueryReading,
  type Scope,
} from './scope.ts';

export type CardSource = 'llm' | 'rules' | 'mixed';

/** A row of public.ai_insights. */
export interface StoredInsight {
  id: number;
  created_at: string;
  scope: Record<string, unknown>;
  kind: string;
  severity: string | null;
  title: string | null;
  body: string | null;
  recommendation: string | null;
  evidence: Card['evidence'] | null;
}

export type NewInsight = Omit<StoredInsight, 'id' | 'created_at'>;

export interface InsightsDb {
  /** auth.getUser(token): null when the session is not valid. */
  getUser(token: string): Promise<AuthUser | null>;
  areas(): Promise<Area[]>;
  /** public.analytics_bundle(p_from, p_to, p_filters). */
  bundle(from: string, to: string, filters: InsightFilters): Promise<AnalyticsBundle>;
  /** public.insight_cards(p_from, p_to, p_filters). */
  ruleCards(from: string, to: string, filters: InsightFilters): Promise<unknown[]>;
  employees(): Promise<DirectoryEmployee[]>;
  /** ai_insights rows with scope.key = key created at or after `since`, oldest first. */
  cached(key: string, since: string): Promise<StoredInsight[]>;
  /** Inserts the rows, returns them with id and created_at. */
  store(rows: NewInsight[]): Promise<StoredInsight[]>;
  /** Ids of every master and manager. */
  digestRecipients(): Promise<string[]>;
  /** Inserts notifications on conflict (recipient_id, dedupe_key) do nothing; returns how many were new. */
  notify(rows: DigestNotification[]): Promise<number>;
}

export interface InsightsDeps {
  db: InsightsDb;
  /** Values of the project secret key (secretKeyCandidates). */
  secrets: readonly string[];
  /** The LLM config from the environment with the ledger attached. May throw CONFIG. */
  llmConfig: () => LlmConfig;
  now?: () => number;
  newId?: () => string;
  /** Wall clock of one ask: the app gives up after 40 s and falls back to rpc insight_cards. */
  askBudgetMs?: number;
  /** Wall clock of the digest: pg_net waits 60 s. */
  digestBudgetMs?: number;
  log?: (event: Record<string, unknown>) => void;
}

/** What the answer says about its scope; also stored (with key, batch and version) in ai_insights.scope. */
export interface ResponseScope extends Scope {
  source: CardSource;
  cached: boolean;
  model: string | null;
  digest?: true;
}

export interface InsightsBody {
  cards: (Card & { id?: number; created_at?: string; scope?: Record<string, unknown> })[];
  scope: ResponseScope;
  digest?: { recipients: number; notified: number };
}

const FN = 'ai-insights';
const defaultLog = (event: Record<string, unknown>): void => console.log(JSON.stringify(event));

export const ASK_BUDGET_MS = 36_000;
export const DIGEST_BUDGET_MS = 50_000;
const PARSE_TIMEOUT_MS = 10_000;
const INSIGHTS_TIMEOUT_MS = 45_000;
/** No insights call starts with less time than this left: a cut off answer is paid for and thrown away. */
const MIN_INSIGHTS_MS = 15_000;
/** Cards of the model answer the same scope for up to 6 hours, rules cards for 10 minutes. */
export const LLM_CACHE_MS = 6 * 3_600_000;
export const RULES_CACHE_MS = 10 * 60_000;
const DIGEST_CACHE_MS = 7 * 86_400_000;

// ---------------------------------------------------------------------------
// the LLM, if any
// ---------------------------------------------------------------------------

interface LlmSetup {
  base: LlmConfig;
  privacy: PrivacyDirectory;
  provider: string;
}

/** The paid path needs the config and a privacy directory; anything missing means rules only. */
async function llmSetup(
  deps: InsightsDeps,
  log: (e: Record<string, unknown>) => void,
): Promise<{ setup: LlmSetup | null; error: string | null }> {
  let base: LlmConfig;
  try {
    base = deps.llmConfig();
  } catch (e) {
    return { setup: null, error: isLlmError(e) ? e.code : 'CONFIG' };
  }
  const provider = base.provider ?? 'mock';
  if (provider === 'mock') return { setup: null, error: null };
  try {
    createLlm(base); // throws CONFIG for a missing key or ledger
  } catch (e) {
    return { setup: null, error: isLlmError(e) ? e.code : 'CONFIG' };
  }
  try {
    const employees = await deps.db.employees();
    const privacy = buildDirectory(employees);
    if (privacy.entries.length === 0) return { setup: null, error: 'CONFIG' };
    return { setup: { base, privacy, provider }, error: null };
  } catch (e) {
    log({ fn: FN, event: 'directory_failed', error: e instanceof Error ? e.name : 'unknown' });
    return { setup: null, error: 'CONFIG' };
  }
}

function llmFor(setup: LlmSetup, timeoutMs: number): Llm {
  return createLlm({ ...setup.base, privacy: setup.privacy, timeoutMs });
}

const errorCode = (e: unknown): string => (isLlmError(e) ? e.code : 'INTERNAL');

// ---------------------------------------------------------------------------
// one answer
// ---------------------------------------------------------------------------

interface Computed {
  cards: Card[];
  source: CardSource;
  model: string | null;
  costUsd: number;
  dropped: Dropped[];
  replaced: number;
  error: string | null;
}

async function rulesOnly(deps: InsightsDeps, scope: Scope): Promise<Card[]> {
  const raw = await deps.db.ruleCards(scope.from, scope.to, scope.filters);
  const cards = (Array.isArray(raw) ? raw : [])
    .map(normalizeRuleCard)
    .filter((c): c is Card => c !== null);
  return focusCards(cards, scope.focus);
}

async function computeCards(
  deps: InsightsDeps,
  scope: Scope,
  setup: LlmSetup | null,
  deadline: number,
  now: () => number,
): Promise<Computed> {
  const empty = { dropped: [] as Dropped[], replaced: 0 };
  if (!setup) {
    return {
      cards: await rulesOnly(deps, scope),
      source: 'rules',
      model: null,
      costUsd: 0,
      ...empty,
      error: null,
    };
  }
  const bundle = await deps.db.bundle(scope.from, scope.to, scope.filters);
  if (!hasFindings(bundle)) {
    return { cards: [], source: 'rules', model: null, costUsd: 0, ...empty, error: null };
  }
  const left = deadline - now();
  if (left < MIN_INSIGHTS_MS) {
    return {
      cards: await rulesOnly(deps, scope),
      source: 'rules',
      model: null,
      costUsd: 0,
      ...empty,
      error: 'TIMEOUT',
    };
  }
  const refs = collectRefs(bundle, scope.focus, scope);
  let costUsd = 0;
  try {
    const llm = llmFor(setup, Math.min(INSIGHTS_TIMEOUT_MS, left - 1_000));
    const r = await llm.call({
      purpose: 'insights',
      messages: [{ role: 'user', content: insightsMessage(scope, refs) }],
    });
    costUsd = r.costUsd;
    const assembled = assembleCards(r.data, refs, scope);
    const needRules =
      assembled.cards.length === 0 ||
      assembled.dropped.some((d) => d.reason === 'ungrounded' || d.reason === 'no_refs');
    const rules = needRules ? await rulesOnly(deps, scope) : [];
    if (assembled.cards.length === 0) {
      return {
        cards: rules,
        source: 'rules',
        model: r.model,
        costUsd,
        dropped: assembled.dropped,
        replaced: 0,
        error: 'NO_CARDS',
      };
    }
    const merged = mergeWithRules(assembled, rules);
    return {
      cards: merged.cards,
      source: merged.replaced > 0 ? 'mixed' : 'llm',
      model: r.model,
      costUsd,
      dropped: assembled.dropped,
      replaced: merged.replaced,
      error: null,
    };
  } catch (e) {
    return {
      cards: await rulesOnly(deps, scope),
      source: 'rules',
      model: null,
      costUsd,
      ...empty,
      error: errorCode(e),
    };
  }
}

function fromStored(rows: readonly StoredInsight[]): InsightsBody['cards'] {
  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    scope: r.scope,
    kind: r.kind,
    severity: r.severity === 'critical' || r.severity === 'warning' ? r.severity : 'info',
    title: r.title ?? '',
    body: r.body ?? '',
    recommendation: r.recommendation ?? '',
    evidence: r.evidence ?? { order_ids: [], stats: {} },
  }));
}

/** The newest batch among cached rows, if it is still fresh for its source. */
function freshBatch(
  rows: readonly StoredInsight[],
  now: number,
  rulesTtl: number,
): StoredInsight[] {
  if (rows.length === 0) return [];
  const last = rows[rows.length - 1]!;
  const batch = last.scope.batch;
  const picked = rows.filter((r) => r.scope.batch === batch);
  const source = last.scope.source;
  if (source === 'rules' && now - Date.parse(last.created_at) > rulesTtl) return [];
  return picked;
}

interface RunResult {
  body: InsightsBody;
  computed: Computed | null;
}

async function run(
  deps: InsightsDeps,
  scope: Scope,
  opts: {
    key: string;
    ttlMs: number;
    rulesTtlMs: number;
    fresh: boolean;
    digest: boolean;
    deadline: number;
  },
  setup: LlmSetup | null,
  log: (e: Record<string, unknown>) => void,
): Promise<RunResult> {
  const now = deps.now ?? (() => Date.now());
  if (!opts.fresh) {
    try {
      const rows = freshBatch(
        await deps.db.cached(opts.key, new Date(now() - opts.ttlMs).toISOString()),
        now(),
        opts.rulesTtlMs,
      );
      if (rows.length > 0) {
        const source = rows[0]!.scope.source;
        const model = rows[0]!.scope.model;
        return {
          body: {
            cards: fromStored(rows),
            scope: {
              ...scope,
              source: source === 'llm' || source === 'mixed' ? source : 'rules',
              cached: true,
              model: typeof model === 'string' ? model : null,
              ...(opts.digest ? { digest: true as const } : {}),
            },
          },
          computed: null,
        };
      }
    } catch (e) {
      log({ fn: FN, event: 'cache_failed', error: e instanceof Error ? e.name : 'unknown' });
    }
  }

  const computed = await computeCards(deps, scope, setup, opts.deadline, now);
  const responseScope: ResponseScope = {
    ...scope,
    source: computed.source,
    cached: false,
    model: computed.model,
    ...(opts.digest ? { digest: true as const } : {}),
  };
  const stored: Record<string, unknown> = {
    ...responseScope,
    key: opts.key,
    batch: (deps.newId ?? (() => crypto.randomUUID()))(),
    prompt_version: INSIGHTS_PROMPT_VERSION,
  };
  delete stored.cached;
  let cards: InsightsBody['cards'] = computed.cards.map((c) => ({ ...c, scope: stored }));
  if (computed.cards.length > 0) {
    try {
      const rows = await deps.db.store(
        computed.cards.map((c) => ({
          scope: stored,
          kind: c.kind,
          severity: c.severity,
          title: c.title,
          body: c.body,
          recommendation: c.recommendation,
          evidence: c.evidence,
        })),
      );
      if (rows.length === computed.cards.length) cards = fromStored(rows);
    } catch (e) {
      log({ fn: FN, event: 'store_failed', error: e instanceof Error ? e.name : 'unknown' });
    }
  }
  return { body: { cards, scope: responseScope }, computed };
}

// ---------------------------------------------------------------------------
// the request
// ---------------------------------------------------------------------------

function bodyObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export async function handleInsightsRequest(req: Request, deps: InsightsDeps): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD' }, 405);

  const log = deps.log ?? defaultLog;
  const now = deps.now ?? (() => Date.now());
  const started = now();
  const caller = callerFromHeaders(req.headers, deps.secrets);
  if (caller.kind === 'none') return jsonResponse({ error: 'UNAUTHORIZED' }, 401);

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    body = bodyObject(text.trim() ? JSON.parse(text) : {});
  } catch {
    return jsonResponse({ error: 'BAD_INPUT', message: 'JSON body expected' }, 400);
  }
  const digest = body.digest === true;
  const fresh = body.fresh === true && caller.kind === 'service';

  try {
    if (caller.kind === 'user') {
      const user = await deps.db.getUser(caller.token);
      if (!user) return jsonResponse({ error: 'UNAUTHORIZED' }, 401);
      if (!isStaff(user)) return jsonResponse({ error: 'FORBIDDEN' }, 403);
      if (digest) return jsonResponse({ error: 'FORBIDDEN' }, 403);
    }

    const { setup, error: setupError } = await llmSetup(deps, log);
    const areas = await deps.db.areas();

    if (digest) {
      const period = digestPeriod(started);
      const scope = resolveScope({
        period,
        filters: {},
        query: null,
        reading: null,
        parsedBy: null,
        areas,
      });
      const weekStart = localDay(period.from);
      const result = await run(
        deps,
        scope,
        {
          key: `digest|${weekStart}`,
          ttlMs: DIGEST_CACHE_MS,
          rulesTtlMs: DIGEST_CACHE_MS,
          fresh,
          digest: true,
          deadline: started + (deps.digestBudgetMs ?? DIGEST_BUDGET_MS),
        },
        setup,
        log,
      );
      const recipients = await deps.db.digestRecipients();
      const rows = digestNotifications(recipients, result.body.cards, weekStart);
      const notified = rows.length > 0 ? await deps.db.notify(rows) : 0;
      log({
        fn: FN,
        event: 'digest',
        caller: caller.kind,
        provider: setup?.provider ?? 'mock',
        source: result.body.scope.source,
        cached: result.body.scope.cached,
        cards: result.body.cards.length,
        recipients: recipients.length,
        notified,
        cost_usd: result.computed?.costUsd ?? 0,
        latency_ms: now() - started,
        ...(result.computed?.error || setupError
          ? { error: result.computed?.error ?? setupError }
          : {}),
      });
      return jsonResponse({ ...result.body, digest: { recipients: recipients.length, notified } });
    }

    const base = requestPeriod(body, started);
    const filters = sanitizeFilters(body.filters);
    const query = sanitizeQuery(body.query);
    const deadline = started + (deps.askBudgetMs ?? ASK_BUDGET_MS);

    // 1. the question
    let reading: QueryReading | null = null;
    let parsedBy: ParsedBy | null = null;
    let parseCost = 0;
    let parseError: string | null = null;
    if (query) {
      if (setup) {
        try {
          const llm = llmFor(
            setup,
            Math.min(PARSE_TIMEOUT_MS, Math.max(1_000, deadline - now() - MIN_INSIGHTS_MS)),
          );
          const r = await llm.call({
            purpose: 'parse_query',
            messages: [{ role: 'user', content: parseQueryMessage(query, started, areas) }],
          });
          parseCost = r.costUsd;
          reading = readingFromAnswer(r.data, started, areas);
          parsedBy = 'llm';
        } catch (e) {
          parseError = errorCode(e);
        }
      }
      if (!reading) {
        reading = ruleReading(query, started, areas);
        parsedBy = 'rules';
      }
    }
    const scope = resolveScope({ period: base, filters, query, reading, parsedBy, areas });

    // 2 to 5
    const result = await run(
      deps,
      scope,
      {
        key: cacheKey(scope, started, INSIGHTS_PROMPT_VERSION),
        ttlMs: cacheTtlMs(scope, LLM_CACHE_MS),
        rulesTtlMs: cacheTtlMs(scope, RULES_CACHE_MS),
        fresh,
        digest: false,
        deadline,
      },
      setup,
      log,
    );
    const c = result.computed;
    log({
      fn: FN,
      event: 'insights',
      caller: caller.kind,
      provider: setup?.provider ?? 'mock',
      parsed_by: scope.parsed_by,
      focus: scope.focus.length,
      source: result.body.scope.source,
      cached: result.body.scope.cached,
      model: result.body.scope.model,
      cards: result.body.cards.length,
      dropped: c?.dropped.length ?? 0,
      replaced: c?.replaced ?? 0,
      cost_usd: Math.round(((c?.costUsd ?? 0) + parseCost) * 1e6) / 1e6,
      latency_ms: now() - started,
      ...(parseError ? { parse_error: parseError } : {}),
      ...(c?.error || setupError ? { error: c?.error ?? setupError } : {}),
    });
    return jsonResponse(result.body);
  } catch (e) {
    log({
      fn: FN,
      event: 'error',
      caller: caller.kind,
      digest,
      error: e instanceof Error ? e.name : 'unknown',
    });
    return jsonResponse({ error: 'INTERNAL' }, 500);
  }
}
