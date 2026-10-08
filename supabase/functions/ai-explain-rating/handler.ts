// ai-explain-rating request handling (CLAUDE.md §13), with the database and the LLM config injected, so the flow
// runs in vitest with fakes and in Deno with supabase-js (index.ts).
//
// 1. the caller from the access token (auth.getUser): a worker may ask about themselves only, staff about anyone
// 2. public.rating for the period with the secret key (all rows, so the worker is compared with the team)
// 3. the worker's components against the team medians, without the name; one Haiku 5.5 call (no thinking field)
//    with the explain_rating schema: three sentences, what helped, what hurt, one concrete action
// Rules text instead of the model (source 'rules', HTTP 200): no closed orders, the mock provider (the default
// while no LLM_PROVIDER secret is set), CONFIG, BUDGET_EXCEEDED, a timeout, a refusal or an unusable answer.
// Logs carry ids, model, latency, cost and error codes only.

import { bearerToken, dbErrorCode, dbErrorStatus, STAFF_ROLES } from '../_shared/caller.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { createLlm, isLlmError, type LlmConfig } from '../_shared/llm.ts';
import { buildDirectory, type DirectoryEmployee } from '../_shared/privacy.ts';
import {
  buildExplainText,
  normalizeExplanation,
  parseExplainBody,
  ratingContext,
} from '../_shared/reportInput.ts';
import {
  templateExplainRating,
  toNumberOrNull,
  type PeriodData,
  type RatingRowData,
} from '../_shared/reportText.ts';

export interface ExplainUser {
  id: string;
  /** app_metadata.app_role */
  role: string | null;
}

export interface ExplainDb {
  /** auth.getUser(token): null when the session is not valid. */
  getUser(token: string): Promise<ExplainUser | null>;
  /** public.rating(p_from, p_to, '{}') with the secret key: every worker and brigade row. */
  rating(period: PeriodData): Promise<RatingRowData[]>;
  /** The privacy directory. */
  employees(): Promise<DirectoryEmployee[]>;
}

export interface ExplainDeps {
  db: ExplainDb;
  llmConfig: () => LlmConfig;
  now?: () => Date;
  timeoutMs?: number;
  log?: (event: Record<string, unknown>) => void;
}

export interface ExplainResponse {
  text: string;
  source: 'llm' | 'rules';
  model: string;
  generated_at: string;
  /** Why the rules text: no_closed, mock, CONFIG, BUDGET_EXCEEDED, TIMEOUT, HTTP, BAD_RESPONSE … */
  reason?: string;
  cost_usd?: number;
}

const FN = 'ai-explain-rating';
/** Under the app's 20 s, so the app gets the function's own fallback instead of its timeout. */
export const EXPLAIN_LLM_TIMEOUT_MS = 17_000;
const defaultLog = (event: Record<string, unknown>): void => console.log(JSON.stringify(event));

export async function handleExplainRequest(req: Request, deps: ExplainDeps): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD' }, 405);
  const log = deps.log ?? defaultLog;
  const now = (deps.now ?? (() => new Date()))();

  const token = bearerToken(req.headers.get('authorization'));
  if (!token) return jsonResponse({ error: 'UNAUTHORIZED' }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'BAD_INPUT', message: 'JSON body {employee_id, from, to} expected' }, 400);
  }
  const parsed = parseExplainBody(body);
  if (!parsed.ok) return jsonResponse({ error: 'BAD_INPUT', message: parsed.message }, 400);
  const { employee_id: employeeId, period } = parsed.value;

  // 1. who asks
  let user: ExplainUser | null;
  try {
    user = await deps.db.getUser(token);
  } catch {
    user = null;
  }
  if (!user) return jsonResponse({ error: 'UNAUTHORIZED' }, 401);
  const staff = !!user.role && STAFF_ROLES.has(user.role);
  const self = user.role === 'worker' && user.id.toLowerCase() === employeeId;
  if (!staff && !self) return jsonResponse({ error: 'FORBIDDEN' }, 403);

  // 2. the numbers
  let rows: RatingRowData[];
  try {
    rows = await deps.db.rating(period);
  } catch (e) {
    const status = dbErrorStatus(e);
    log({ fn: FN, event: 'rating_failed', status });
    return jsonResponse({ error: dbErrorCode(status) }, status === 400 ? 500 : status);
  }
  const ctx = ratingContext(Array.isArray(rows) ? rows : [], employeeId);
  if (!ctx) return jsonResponse({ error: 'NOT_FOUND' }, 404);

  const rulesAnswer = (reason: string, extra: Record<string, unknown> = {}): Response => {
    log({ fn: FN, event: 'rules', reason, caller: staff ? 'staff' : 'self', ...extra });
    const answer: ExplainResponse = {
      text: templateExplainRating(ctx.row),
      source: 'rules',
      model: 'rules',
      generated_at: now.toISOString(),
      reason,
    };
    return jsonResponse(answer);
  };
  if (toNumberOrNull(ctx.row.score) == null) return rulesAnswer('no_closed');

  // 3. the model
  let config: LlmConfig;
  try {
    config = deps.llmConfig();
  } catch (e) {
    return rulesAnswer(isLlmError(e) ? e.code : 'CONFIG');
  }
  const provider = config.provider ?? 'mock';
  // the mock model's canned sentences would not match the worker's numbers: the rules text does
  if (provider === 'mock') return rulesAnswer('mock');

  // the message carries no name at all; the directory still redacts anything that slips in
  const employees = await deps.db.employees().catch((): DirectoryEmployee[] => []);
  if (employees.length === 0) return rulesAnswer('CONFIG', { detail: 'directory' });
  const text = buildExplainText(ctx, period);
  const t0 = Date.now();
  try {
    const llm = createLlm({
      ...config,
      privacy: buildDirectory(employees),
      timeoutMs: deps.timeoutMs ?? EXPLAIN_LLM_TIMEOUT_MS,
    });
    const r = await llm.call({ purpose: 'explain_rating', messages: [{ role: 'user', content: text }] });
    const explanation = normalizeExplanation(r.data);
    if (!explanation) return rulesAnswer('BAD_RESPONSE', { model: r.model, cost_usd: r.costUsd });
    log({
      fn: FN,
      event: 'explained',
      caller: staff ? 'staff' : 'self',
      provider,
      model: r.model,
      latency_ms: Date.now() - t0,
      cost_usd: r.costUsd,
    });
    const answer: ExplainResponse = {
      text: explanation,
      source: 'llm',
      model: r.model,
      generated_at: now.toISOString(),
      cost_usd: r.costUsd,
    };
    return jsonResponse(answer);
  } catch (e) {
    return rulesAnswer(isLlmError(e) ? e.code : 'ERROR', {
      provider,
      status: isLlmError(e) ? e.status : null,
      latency_ms: Date.now() - t0,
    });
  }
}
