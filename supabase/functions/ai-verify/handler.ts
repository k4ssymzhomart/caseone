// ai-verify request handling (CLAUDE.md §11 steps 1 to 5), with the database and the LLM config injected,
// so the whole flow runs in vitest with fakes and in Deno with supabase-js (index.ts).
//
// 1. ai_context (service role): rules, photos, already_reviewed → exit with the existing review if reviewed
// 2. photos from Storage, the message from the shared builder (_shared/verifyInput.ts, as the golden set),
//    every text part through the privacy gateway; a directory that does not know the worker means no LLM call
// 3. one LLM call (verify schema), up to 3 attempts on transient errors, never on BUDGET_EXCEEDED
// 4. ai_submit scores L1 and L2, decides the verdict, writes the review once per attempt, moves the order;
//    with no usable answer (or an answer the database refused) it gets p_llm = null and a rules-only review
//    asks the master to confirm
// 5. notifications go out from inside ai_submit
//
// Once the order is in ai_review, every failure after step 1 still ends in ai_submit, so the order never waits
// for the watchdog without a review. Concurrent calls for the same attempt in one isolate share one check
// (the retry button of the app, the watchdog), so the model is paid for once.
// Logs carry ids, model, latency, cost and error codes only: never the payload, never a key, never free text.

import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import {
  createLlm,
  isLlmError,
  LlmError,
  type LlmConfig,
  type LlmProviderName,
} from '../_shared/llm.ts';
import {
  buildDirectory,
  type DirectoryEmployee,
  type PrivacyDirectory,
} from '../_shared/privacy.ts';
import { PROMPT_VERSION } from '../_shared/prompts.ts';
import type { VerifyAnswer } from '../_shared/schemas.ts';
import {
  pickVerifyPhotos,
  VERIFY_INPUT_VERSION,
  type VerifyContext,
  type VerifyContextPhoto,
  type VerifyMessages,
  type VerifyPhoto,
  type VerifyPhotoKind,
} from '../_shared/verifyInput.ts';
import { callerFromHeaders, decideUserAccess, type Caller, type VerifyUser } from './auth.ts';
import {
  buildVerifyRequest,
  normalizeVerifyAnswer,
  photoFromBytes,
  type PhotoResult,
} from './input.ts';
import {
  DEFAULT_RETRY_POLICY,
  errorLabelRu,
  realClock,
  withRetries,
  type RetryClock,
  type RetryPolicy,
} from './retry.ts';

/** A row of public.ai_reviews as ai_submit returns it. */
export interface VerifyReview {
  id: number;
  order_id: number;
  attempt: number;
  verdict: string;
  score: number;
  needs_master_review: boolean;
  model: string | null;
  [key: string]: unknown;
}

/** A database error; `message` holds the RPC error code (BAD_TRANSITION, BAD_INPUT, FORBIDDEN …). */
export class DbError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'DbError';
    this.code = code;
  }
}

export interface VerifyDb {
  /** auth.getUser(token): null when the session is not valid. */
  getUser(token: string): Promise<VerifyUser | null>;
  orderAssignee(orderId: number): Promise<{ assignee_id: string | null } | null>;
  /** public.ai_context(p_order_id); null when the order does not exist. */
  context(orderId: number): Promise<VerifyContext | null>;
  review(orderId: number, attempt: number): Promise<VerifyReview | null>;
  employees(): Promise<DirectoryEmployee[]>;
  /** Bucket `photos`; null when the object cannot be read. */
  download(storagePath: string): Promise<Uint8Array | null>;
  /** public.ai_submit(p_order_id, p_llm, p_meta). */
  submit(
    orderId: number,
    llm: VerifyAnswer | null,
    meta: Record<string, unknown>,
  ): Promise<VerifyReview>;
}

export interface VerifyDeps {
  db: VerifyDb;
  /** Values of the project secret key (secretKeyCandidates). */
  secrets: readonly string[];
  /** The LLM config from the environment with the llm_audit ledger attached. May throw CONFIG. */
  llmConfig: () => LlmConfig;
  policy?: RetryPolicy;
  clock?: RetryClock;
  log?: (event: Record<string, unknown>) => void;
}

const FN = 'ai-verify';
const defaultLog = (event: Record<string, unknown>): void => console.log(JSON.stringify(event));

export function parseOrderId(body: unknown): number | null {
  const raw = (body ?? {}) as { order_id?: unknown };
  const n =
    typeof raw.order_id === 'string' && /^\d+$/.test(raw.order_id)
      ? Number(raw.order_id)
      : raw.order_id;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** `source` as the logs carry it: a short token from the body (app, watchdog, check …), never free text. */
export function parseSource(body: unknown, caller: Caller['kind']): string {
  const raw = (body as { source?: unknown } | null)?.source;
  if (typeof raw === 'string') return /^[a-z0-9_-]{1,32}$/i.test(raw) ? raw : 'other';
  return caller === 'service' ? 'service' : 'app';
}

function errorStatus(e: unknown): number {
  const m = e instanceof Error ? e.message : '';
  if (m.startsWith('BAD_TRANSITION')) return 409;
  if (m.startsWith('BAD_INPUT')) return 404;
  if (m.startsWith('FORBIDDEN')) return 403;
  return 500;
}

function errorCode(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  const known = /^(BAD_TRANSITION|BAD_INPUT|FORBIDDEN|MISSING_REASON)/.exec(m);
  return known?.[1] ?? 'INTERNAL';
}

/** Downloads a picked photo (one retry) and checks it; null when the order has no photo of that kind. */
async function loadPhoto(
  db: VerifyDb,
  meta: VerifyContextPhoto | null,
): Promise<PhotoResult | null> {
  if (!meta?.storage_path) return null;
  const path = meta.storage_path;
  let bytes = await db.download(path).catch(() => null);
  if (!bytes) bytes = await db.download(path).catch(() => null);
  return photoFromBytes(meta, bytes);
}

async function submitOnce(
  db: VerifyDb,
  orderId: number,
  llm: VerifyAnswer | null,
  meta: Record<string, unknown>,
): Promise<VerifyReview> {
  try {
    return await db.submit(orderId, llm, meta);
  } catch (e) {
    // a rule or transition error is final; a dropped connection gets one more try
    if (errorStatus(e) !== 500) throw e;
    return await db.submit(orderId, llm, meta);
  }
}

// ---------------------------------------------------------------------------
// the check of one attempt
// ---------------------------------------------------------------------------

/** Why there is no usable answer: the code for the logs, the Russian phrase for the L1 line of the review. */
interface Failure {
  code: string;
  label: string;
  status: number | null;
}

function failureOf(e: unknown): Failure {
  if (isLlmError(e)) return { code: e.code, label: errorLabelRu(e), status: e.status };
  return { code: 'INPUT', label: errorLabelRu(e), status: null };
}

const SUBMIT_FAILURE: Failure = { code: 'SUBMIT', label: 'ответ ИИ не сохранён', status: null };

/**
 * The privacy gateway must know the worker of the order: their names in the free text are redacted only through
 * the directory entry, so without it no call goes out (CONFIG, «ИИ не настроен»). An empty directory fails too.
 */
export function directoryCovers(
  directory: PrivacyDirectory,
  ctx: Pick<VerifyContext, 'worker'>,
): boolean {
  const pseudonym = ctx.worker?.pseudonym;
  return !!pseudonym && directory.entries.some((e) => e.pseudonym === pseudonym);
}

interface Prepared {
  request: VerifyMessages;
  directory: PrivacyDirectory;
  images: number;
  unavailable: number;
}

/** Step 2: the directory and both photos in parallel, then the redacted request. */
async function prepare(db: VerifyDb, ctx: VerifyContext): Promise<Prepared> {
  const pick = pickVerifyPhotos(ctx);
  const [employees, ...results] = await Promise.all([
    db.employees(),
    loadPhoto(db, pick.before),
    loadPhoto(db, pick.after),
  ]);
  const directory = buildDirectory(employees);
  if (!directoryCovers(directory, ctx)) {
    throw new LlmError('CONFIG', 'CONFIG: the privacy directory does not cover the worker');
  }
  const loaded = results.filter((r): r is PhotoResult => r !== null);
  const photos: VerifyPhoto[] = loaded.flatMap((r) => (r.ok ? [r.photo] : []));
  const unavailable: VerifyPhotoKind[] = loaded.flatMap((r) => (r.ok ? [] : [r.kind]));
  return {
    request: buildVerifyRequest(ctx, photos, unavailable, directory),
    directory,
    images: photos.length,
    unavailable: unavailable.length,
  };
}

interface CheckResult {
  review: VerifyReview;
  rulesOnly: boolean;
}

/** Steps 2 to 4 for an order in ai_review. Ends in ai_submit whatever fails before it. */
async function runCheck(
  orderId: number,
  ctx: VerifyContext,
  deps: VerifyDeps,
  who: { source: string; caller: Caller['kind'] },
): Promise<CheckResult> {
  const db = deps.db;
  const log = deps.log ?? defaultLog;
  let failure: Failure | null = null;

  // 2. inputs; any failure here ends in a rules-only review, never in a call without the privacy gateway
  let prepared: Prepared | null = null;
  try {
    prepared = await prepare(db, ctx);
  } catch (e) {
    failure = failureOf(e);
  }

  // 3. one LLM call, retried on transient errors
  let provider: LlmProviderName | 'none' = 'none';
  let requestedModel = 'unknown';
  let costUsd = 0;
  let answer: VerifyAnswer | null = null;
  let answerModel = '';
  let tries = 0;
  let elapsedMs = 0;
  if (prepared) {
    const input = prepared;
    const outcome = await withRetries(
      async (_attempt, timeoutMs) => {
        const base = deps.llmConfig();
        const llm = createLlm({ ...base, privacy: input.directory, timeoutMs });
        provider = llm.provider;
        requestedModel = llm.modelFor('verify');
        const r = await llm.call({ purpose: 'verify', ...input.request });
        costUsd += r.costUsd;
        return { answer: normalizeVerifyAnswer(r.data, ctx.order), model: r.model };
      },
      deps.policy ?? DEFAULT_RETRY_POLICY,
      deps.clock ?? realClock,
      (attempt, error) =>
        log({
          fn: FN,
          event: 'llm_retry',
          order_id: orderId,
          try: attempt,
          error: error.code,
          status: error.status,
        }),
    );
    tries = outcome.tries;
    elapsedMs = outcome.elapsedMs;
    if (outcome.ok) {
      answer = outcome.value.answer;
      answerModel = outcome.value.model;
    } else {
      failure = failureOf(outcome.error);
    }
  }

  // 4. score and store
  const common = {
    attempt: ctx.attempt,
    latency_ms: elapsedMs,
    tries,
    prompt_version: PROMPT_VERSION,
    input_version: VERIFY_INPUT_VERSION,
  };
  const rulesMeta = (f: Failure): Record<string, unknown> => ({
    ...common,
    model: 'rules',
    llm_model: requestedModel,
    provider,
    error: f.label,
    error_code: f.code,
  });
  let review: VerifyReview;
  if (answer) {
    try {
      review = await submitOnce(db, orderId, answer, { ...common, model: answerModel, provider });
    } catch (e) {
      if (errorStatus(e) !== 500) throw e;
      // the database refused the answer twice: the rules still give the order its review
      log({
        fn: FN,
        event: 'submit_fallback',
        order_id: orderId,
        attempt: ctx.attempt,
        error: e instanceof DbError ? e.code : null,
      });
      answer = null;
      failure = SUBMIT_FAILURE;
      review = await submitOnce(db, orderId, null, rulesMeta(failure));
    }
  } else {
    review = await submitOnce(db, orderId, null, rulesMeta(failure ?? failureOf(null)));
  }
  // a rules-only submit returns the stored review when another call got there first
  const rulesOnly = answer === null && review.model === 'rules';

  log({
    fn: FN,
    event: answer ? 'reviewed' : 'rules_only',
    order_id: orderId,
    attempt: ctx.attempt,
    source: who.source,
    caller: who.caller,
    provider,
    model: answer ? answerModel : requestedModel,
    tries,
    latency_ms: elapsedMs,
    cost_usd: costUsd,
    images: prepared?.images ?? 0,
    images_unavailable: prepared?.unavailable ?? 0,
    ...(failure ? { error: failure.code, status: failure.status } : {}),
    review_id: review.id,
    verdict: review.verdict,
    score: review.score,
    needs_master_review: review.needs_master_review,
  });
  return { review, rulesOnly };
}

/** Checks running in this isolate, by `${order_id}:${attempt}`. */
const inflight = new Map<string, Promise<CheckResult>>();

// ---------------------------------------------------------------------------
// the request
// ---------------------------------------------------------------------------

export async function handleVerifyRequest(req: Request, deps: VerifyDeps): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD' }, 405);

  const log = deps.log ?? defaultLog;
  const db = deps.db;
  const caller = callerFromHeaders(req.headers, deps.secrets);
  if (caller.kind === 'none') return jsonResponse({ error: 'UNAUTHORIZED' }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'BAD_INPUT', message: 'JSON body {order_id} expected' }, 400);
  }
  const orderId = parseOrderId(body);
  if (orderId === null)
    return jsonResponse({ error: 'BAD_INPUT', message: 'order_id expected' }, 400);
  const source = parseSource(body, caller.kind);

  try {
    if (caller.kind === 'user') {
      const user = await db.getUser(caller.token);
      const order = user ? await db.orderAssignee(orderId) : null;
      const access = decideUserAccess(user, order);
      if (!access.ok) return jsonResponse({ error: access.error }, access.status);
    }

    // 1. context
    const ctx = await db.context(orderId);
    if (!ctx) return jsonResponse({ error: 'NOT_FOUND' }, 404);
    if (ctx.already_reviewed) {
      // never a second model call for a reviewed attempt: ai_submit hands back the stored row as well
      const existing =
        (await db.review(orderId, ctx.attempt)) ??
        (await db.submit(orderId, null, { attempt: ctx.attempt }));
      log({
        fn: FN,
        event: 'already_reviewed',
        order_id: orderId,
        attempt: ctx.attempt,
        review_id: existing.id,
        source,
      });
      return jsonResponse({ review: existing, already_reviewed: true });
    }
    if (ctx.status !== 'ai_review') {
      return jsonResponse({ error: 'NOT_IN_REVIEW', status: ctx.status }, 409);
    }

    // 2 to 4, shared with a call for the same attempt that is already running here
    const key = `${orderId}:${ctx.attempt}`;
    let job = inflight.get(key);
    if (job) {
      log({ fn: FN, event: 'joined', order_id: orderId, attempt: ctx.attempt, source });
    } else {
      const started = runCheck(orderId, ctx, deps, { source, caller: caller.kind });
      const forget = (): void => {
        if (inflight.get(key) === started) inflight.delete(key);
      };
      started.then(forget, forget);
      inflight.set(key, started);
      job = started;
    }
    const result = await job;
    return jsonResponse({
      review: result.review,
      ...(result.rulesOnly ? { rules_only: true } : {}),
    });
  } catch (e) {
    const status = errorStatus(e);
    const code = errorCode(e);
    log({ fn: FN, event: 'error', order_id: orderId, source, error: code, status });
    return jsonResponse({ error: code }, status);
  }
}
