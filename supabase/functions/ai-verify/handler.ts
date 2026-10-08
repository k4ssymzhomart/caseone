// ai-verify request handling (CLAUDE.md §11 steps 1 to 5), with the database and the LLM config injected,
// so the whole flow runs in vitest with fakes and in Deno with supabase-js (index.ts).
//
// 1. ai_context (service role): rules, photos, already_reviewed → exit with the existing review if reviewed
// 2. photos from Storage, the message from the shared builder (_shared/verifyInput.ts, as the golden set),
//    every text part through the privacy gateway
// 3. one LLM call (verify schema), up to 3 attempts on transient errors, never on BUDGET_EXCEEDED
// 4. ai_submit scores L1 and L2, decides the verdict, writes the review once per attempt, moves the order;
//    with no usable answer it gets p_llm = null and a rules-only review asks the master to confirm
// 5. notifications go out from inside ai_submit
//
// Logs carry ids, model, latency, cost and error codes only: never the payload, never a key.

import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { createLlm, type LlmConfig, type LlmProviderName } from '../_shared/llm.ts';
import { buildDirectory, type DirectoryEmployee } from '../_shared/privacy.ts';
import { PROMPT_VERSION } from '../_shared/prompts.ts';
import type { VerifyAnswer } from '../_shared/schemas.ts';
import {
  pickVerifyPhotos,
  VERIFY_INPUT_VERSION,
  type VerifyContext,
  type VerifyContextPhoto,
  type VerifyPhoto,
  type VerifyPhotoKind,
} from '../_shared/verifyInput.ts';
import { callerFromHeaders, decideUserAccess, type VerifyUser } from './auth.ts';
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

const defaultLog = (event: Record<string, unknown>): void => console.log(JSON.stringify(event));

export function parseOrderId(body: unknown): number | null {
  const raw = (body ?? {}) as { order_id?: unknown };
  const n =
    typeof raw.order_id === 'string' && /^\d+$/.test(raw.order_id)
      ? Number(raw.order_id)
      : raw.order_id;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
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
  const source =
    typeof (body as { source?: unknown }).source === 'string'
      ? String((body as { source: string }).source).slice(0, 32)
      : caller.kind === 'service'
        ? 'service'
        : 'app';

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
      const existing = await db.review(orderId, ctx.attempt);
      if (existing) {
        log({
          fn: 'ai-verify',
          event: 'already_reviewed',
          order_id: orderId,
          attempt: ctx.attempt,
          review_id: existing.id,
          source,
        });
        return jsonResponse({ review: existing, already_reviewed: true });
      }
    }
    if (ctx.status !== 'ai_review') {
      return jsonResponse({ error: 'NOT_IN_REVIEW', status: ctx.status }, 409);
    }

    // 2. photos (shared picker: earliest before, latest after), the shared builder and the privacy gateway
    const pick = pickVerifyPhotos(ctx);
    const loaded = (
      await Promise.all([loadPhoto(db, pick.before), loadPhoto(db, pick.after)])
    ).filter((r): r is PhotoResult => r !== null);
    const photos: VerifyPhoto[] = loaded.flatMap((r) => (r.ok ? [r.photo] : []));
    const unavailable: VerifyPhotoKind[] = loaded.flatMap((r) => (r.ok ? [] : [r.kind]));
    const directory = buildDirectory(await db.employees());
    const request = buildVerifyRequest(ctx, photos, unavailable, directory);

    // 3. one LLM call, retried on transient errors
    let provider: LlmProviderName | 'none' = 'none';
    let requestedModel = 'unknown';
    let costUsd = 0;
    const outcome = await withRetries(
      async (_attempt, timeoutMs) => {
        const base = deps.llmConfig();
        const llm = createLlm({ ...base, privacy: directory, timeoutMs });
        provider = llm.provider;
        requestedModel = llm.modelFor('verify');
        const r = await llm.call({ purpose: 'verify', ...request });
        costUsd += r.costUsd;
        return { answer: normalizeVerifyAnswer(r.data), model: r.model };
      },
      deps.policy ?? DEFAULT_RETRY_POLICY,
      deps.clock ?? realClock,
      (attempt, error) =>
        log({
          fn: 'ai-verify',
          event: 'llm_retry',
          order_id: orderId,
          try: attempt,
          error: error.code,
          status: error.status,
        }),
    );

    // 4. score and store
    const common = {
      attempt: ctx.attempt,
      latency_ms: outcome.elapsedMs,
      tries: outcome.tries,
      prompt_version: PROMPT_VERSION,
      input_version: VERIFY_INPUT_VERSION,
    };
    const review = outcome.ok
      ? await submitOnce(db, orderId, outcome.value.answer, {
          ...common,
          model: outcome.value.model,
          provider,
        })
      : await submitOnce(db, orderId, null, {
          ...common,
          model: 'rules',
          llm_model: requestedModel,
          provider,
          error: errorLabelRu(outcome.error),
          error_code: outcome.error.code,
        });

    log({
      fn: 'ai-verify',
      event: outcome.ok ? 'reviewed' : 'rules_only',
      order_id: orderId,
      attempt: ctx.attempt,
      source,
      caller: caller.kind,
      provider,
      model: outcome.ok ? outcome.value.model : requestedModel,
      tries: outcome.tries,
      latency_ms: outcome.elapsedMs,
      cost_usd: costUsd,
      images: photos.length,
      images_unavailable: unavailable.length,
      ...(outcome.ok ? {} : { error: outcome.error.code, status: outcome.error.status }),
      review_id: review.id,
      verdict: review.verdict,
      score: review.score,
      needs_master_review: review.needs_master_review,
    });
    return jsonResponse({ review, ...(outcome.ok ? {} : { rules_only: true }) });
  } catch (e) {
    const status = errorStatus(e);
    const code = errorCode(e);
    log({ fn: 'ai-verify', event: 'error', order_id: orderId, source, error: code, status });
    return jsonResponse({ error: code }, status);
  }
}
