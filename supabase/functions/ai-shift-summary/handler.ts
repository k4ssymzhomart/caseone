// ai-shift-summary request handling (CLAUDE.md §14), with the database and the LLM config injected, so the whole
// flow runs in vitest with fakes and in Deno with supabase-js (index.ts).
//
// 1. rpc shift_report with the caller's own JWT: RLS and require_staff decide who may read it (403 otherwise)
// 2. a summary of the same scope stored in ai_insights within 10 minutes (60 s with refresh) is returned as is
// 3. the report as Russian lines, workers by pseudonym (privacy gateway on top), one Sonnet 5.5 call with the
//    shift_summary schema: 5 to 8 sentences and 3 recommendations from the given numbers only
// 4. the answer is stored in ai_insights (kind shift_summary, scope {from, to, filters}) with the secret key
// Rules text instead of the model (source 'rules', HTTP 200): the mock provider (the default while no
// LLM_PROVIDER secret is set), CONFIG, BUDGET_EXCEEDED, a timeout, a refusal or an unusable answer.
// Logs carry the scope size, model, latency, cost and error codes only: never the report, never a key.

import { bearerToken, dbErrorCode, dbErrorStatus } from '../_shared/caller.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { createLlm, isLlmError, type LlmConfig } from '../_shared/llm.ts';
import { buildDirectory, type DirectoryEmployee } from '../_shared/privacy.ts';
import {
  buildShiftSummaryText,
  matchCachedSummary,
  normalizeShiftSummary,
  parseSummaryBody,
  SUMMARY_CACHE_TTL_MS,
  SUMMARY_REFRESH_TTL_MS,
  summaryInsightRow,
  unknownNumbers,
  workloadCovered,
  type CachedSummaryRow,
  type FilterNames,
  type SummaryInsightRow,
  type SummaryScope,
} from '../_shared/reportInput.ts';
import {
  templateShiftSummary,
  type ReportFiltersData,
  type ShiftReportData,
  type ShiftSummaryText,
} from '../_shared/reportText.ts';

export interface SummaryEmployee extends DirectoryEmployee {
  id: string;
}

export interface SummaryDb {
  /** public.shift_report(p_from, p_to, p_filters) called with the caller's access token. */
  shiftReport(token: string, scope: SummaryScope): Promise<ShiftReportData>;
  /** The privacy directory with ids (secret key). */
  employees(): Promise<SummaryEmployee[]>;
  /** Names of the filter's area, equipment and brigade (not personal data). */
  filterNames(filters: ReportFiltersData): Promise<FilterNames>;
  /** ai_insights rows of kind shift_summary created at or after `sinceIso`, newest first. */
  recentSummaries(sinceIso: string): Promise<CachedSummaryRow[]>;
  saveSummary(row: SummaryInsightRow): Promise<void>;
}

export interface SummaryDeps {
  db: SummaryDb;
  /** The LLM config from the environment with the llm_audit ledger attached. May throw CONFIG. */
  llmConfig: () => LlmConfig;
  now?: () => Date;
  /** The model's timeout. Longer than the app's 20 s on purpose: a late answer still lands in the cache. */
  timeoutMs?: number;
  log?: (event: Record<string, unknown>) => void;
}

export interface SummaryResponse extends ShiftSummaryText {
  source: 'llm' | 'rules';
  /** The model id, or 'rules'. */
  model: string;
  cached: boolean;
  generated_at: string;
  /** Why the rules text: mock, CONFIG, BUDGET_EXCEEDED, TIMEOUT, HTTP, BAD_RESPONSE … */
  reason?: string;
  /** Numbers of the answer that the report never wrote (a hint for the master, see unknownNumbers). */
  unknown_numbers?: string[];
  cost_usd?: number;
}

const FN = 'ai-shift-summary';
export const SUMMARY_LLM_TIMEOUT_MS = 40_000;
const defaultLog = (event: Record<string, unknown>): void => console.log(JSON.stringify(event));

function filtersCount(f: ReportFiltersData): number {
  return Object.values(f).filter((v) => v != null).length;
}

/** Steps 3 and 4. Never throws: every failure ends in the rules text. */
async function summarize(
  report: ShiftReportData,
  scope: SummaryScope,
  deps: SummaryDeps,
  now: Date,
): Promise<SummaryResponse> {
  const log = deps.log ?? defaultLog;
  const rules = templateShiftSummary(report);
  const rulesAnswer = (reason: string, extra: Record<string, unknown> = {}): SummaryResponse => {
    log({ fn: FN, event: 'rules', reason, filters: filtersCount(scope.filters), ...extra });
    return { ...rules, source: 'rules', model: 'rules', cached: false, generated_at: now.toISOString(), reason };
  };

  let config: LlmConfig;
  try {
    config = deps.llmConfig();
  } catch (e) {
    return rulesAnswer(isLlmError(e) ? e.code : 'CONFIG');
  }
  const provider = config.provider ?? 'mock';
  // the mock model's canned sentences would contradict the real numbers: the rules text says them instead
  if (provider === 'mock') return rulesAnswer('mock');

  let employees: SummaryEmployee[];
  try {
    employees = await deps.db.employees();
  } catch {
    return rulesAnswer('CONFIG', { detail: 'directory' });
  }
  const directory = buildDirectory(employees);
  const pseudonyms = new Map(
    employees.filter((e) => e.id && e.pseudonym).map((e) => [e.id, e.pseudonym] as const),
  );
  // the privacy gateway must know every worker the report names, else nothing goes out
  if (directory.entries.length === 0 || !workloadCovered(report, pseudonyms)) {
    return rulesAnswer('CONFIG', { detail: 'directory' });
  }
  const names = await deps.db.filterNames(scope.filters).catch((): FilterNames => ({}));
  if (scope.filters.assignee_id) names.assignee = pseudonyms.get(scope.filters.assignee_id) ?? null;
  const text = buildShiftSummaryText(report, { scope, now, names, pseudonyms });

  const t0 = Date.now();
  let costUsd = 0;
  try {
    const llm = createLlm({
      ...config,
      privacy: directory,
      timeoutMs: deps.timeoutMs ?? SUMMARY_LLM_TIMEOUT_MS,
    });
    const r = await llm.call({ purpose: 'shift_summary', messages: [{ role: 'user', content: text }] });
    costUsd = r.costUsd;
    const answer = normalizeShiftSummary(r.data, rules);
    if (!answer) return rulesAnswer('BAD_RESPONSE', { model: r.model, cost_usd: costUsd });
    const unknown = unknownNumbers(`${answer.summary} ${answer.recommendations.join(' ')}`, text);
    try {
      await deps.db.saveSummary(
        summaryInsightRow(scope, answer, report, { model: r.model, unknown_numbers: unknown }),
      );
    } catch {
      log({ fn: FN, event: 'cache_write_failed' });
    }
    log({
      fn: FN,
      event: 'summarized',
      provider,
      model: r.model,
      latency_ms: Date.now() - t0,
      cost_usd: costUsd,
      unknown_numbers: unknown.length,
      filters: filtersCount(scope.filters),
    });
    return {
      ...answer,
      source: 'llm',
      model: r.model,
      cached: false,
      generated_at: now.toISOString(),
      unknown_numbers: unknown,
      cost_usd: costUsd,
    };
  } catch (e) {
    return rulesAnswer(isLlmError(e) ? e.code : 'ERROR', {
      provider,
      status: isLlmError(e) ? e.status : null,
      latency_ms: Date.now() - t0,
    });
  }
}

/** Summaries running in this isolate, by scope: two tabs asking at once pay for one call. */
const inflight = new Map<string, Promise<SummaryResponse>>();

export async function handleSummaryRequest(req: Request, deps: SummaryDeps): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD' }, 405);
  const log = deps.log ?? defaultLog;

  const token = bearerToken(req.headers.get('authorization'));
  if (!token) return jsonResponse({ error: 'UNAUTHORIZED' }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'BAD_INPUT', message: 'JSON body {from, to, filters} expected' }, 400);
  }
  const parsed = parseSummaryBody(body);
  if (!parsed.ok) return jsonResponse({ error: 'BAD_INPUT', message: parsed.message }, 400);
  const { scope, refresh } = parsed.value;

  // 1. the numbers, as the caller may see them
  let report: ShiftReportData;
  try {
    report = await deps.db.shiftReport(token, scope);
  } catch (e) {
    const status = dbErrorStatus(e);
    log({ fn: FN, event: 'report_failed', status });
    return jsonResponse({ error: dbErrorCode(status) }, status === 400 ? 500 : status);
  }
  if (!report || typeof report !== 'object' || !report.counts) {
    log({ fn: FN, event: 'report_failed', status: 500 });
    return jsonResponse({ error: 'INTERNAL' }, 500);
  }
  const now = (deps.now ?? (() => new Date()))();

  // 2. the cache
  try {
    const since = new Date(now.getTime() - SUMMARY_CACHE_TTL_MS).toISOString();
    const hit = matchCachedSummary(
      await deps.db.recentSummaries(since),
      scope,
      now,
      refresh ? SUMMARY_REFRESH_TTL_MS : SUMMARY_CACHE_TTL_MS,
    );
    if (hit) {
      log({ fn: FN, event: 'cached', model: hit.model, refresh });
      const answer: SummaryResponse = {
        summary: hit.summary,
        recommendations: hit.recommendations,
        source: 'llm',
        model: hit.model,
        cached: true,
        generated_at: hit.created_at,
      };
      return jsonResponse(answer);
    }
  } catch {
    log({ fn: FN, event: 'cache_read_failed' });
  }

  // 3 and 4, shared with a request for the same scope that is already running here
  const key = JSON.stringify(scope);
  let job = inflight.get(key);
  if (!job) {
    const started = summarize(report, scope, deps, now);
    const forget = (): void => {
      if (inflight.get(key) === started) inflight.delete(key);
    };
    started.then(forget, forget);
    inflight.set(key, started);
    job = started;
  }
  return jsonResponse(await job);
}
