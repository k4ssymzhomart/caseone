// npx tsx tools/phase5-check.ts [--live] [--deployed] [--shift-from <iso> --shift-to <iso>]
// Phase 5 acceptance on the live project (docs/phase5-acceptance.md), signed in as master 1001/1111 with the
// publishable key, the way the web panel reads it:
//  a) rating for the last 30 and 92 days: Сериков Д. (2006) on first time fix (F) against the team median, his rank
//     by score and by F (PATTERNS.md P2 says he ranks low on F);
//  b) shift_report counts for the current shift (compare them with the manual SQL count of the acceptance doc);
//  c) --live (or --live-summary, --live-explain for one of them): the ai-shift-summary and ai-explain-rating handlers run here with the local Anthropic key
//     (.secrets/anthropic.env, never printed): one Sonnet call for the current shift, one Haiku call for Сериков
//     over 30 days; costs go to .secrets/llm-ledger.json and the run is capped at 0.05 USD by the budget guard.
//     Nothing is written to the database (the cache lives in memory here);
//  --deployed: calls the deployed functions with the master's and a worker's session (free while the project runs
//     the mock provider: both answer with the rules text from the real numbers).
// ROTA_SECRETS_DIR points at the main checkout's .secrets/ when this runs in a git worktree.

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { accountEmail, accountPassword, periodFor } from '@rota/shared';
import { handleExplainRequest } from '../supabase/functions/ai-explain-rating/handler.ts';
import { handleSummaryRequest, type SummaryEmployee } from '../supabase/functions/ai-shift-summary/handler.ts';
import { jsonFileLedger } from '../supabase/functions/_shared/ledger.ts';
import { llmConfigFromEnv, type LlmConfig } from '../supabase/functions/_shared/llm.ts';
import type { CachedSummaryRow, SummaryInsightRow } from '../supabase/functions/_shared/reportInput.ts';
import { median } from '../supabase/functions/_shared/reportInput.ts';
import type { RatingRowData, ShiftReportData } from '../supabase/functions/_shared/reportText.ts';
import { readSecrets, secretsDir } from './lib/env.ts';

const RUN_CAP_USD = 0.05;
const DAY = 86_400_000;
const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const opt = (name: string): string | undefined =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;

const supa = readSecrets('supabase');
const url = process.env.SUPABASE_URL || supa.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY || supa.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY missing in .secrets/supabase.env');
  process.exit(1);
}

interface Session {
  client: SupabaseClient;
  id: string;
  token: string;
}

async function signIn(tabNo: string, pin: string): Promise<Session> {
  const client = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: accountEmail(tabNo),
    password: accountPassword(pin),
  });
  if (error || !data.session) throw new Error(`sign in ${tabNo}: ${error?.message ?? 'no session'}`);
  return { client, id: data.session.user.id, token: data.session.access_token };
}

async function rpc<T>(s: Session, fn: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await s.client.rpc(fn, params);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

const pct = (x: number | null | undefined): string => (x == null ? '·' : `${(x * 100).toFixed(1)}%`);

// ---------------------------------------------------------------------------
// a) rating
// ---------------------------------------------------------------------------

async function ratingCheck(master: Session, days: number, now: Date): Promise<void> {
  const period = { from: new Date(now.getTime() - days * DAY).toISOString(), to: now.toISOString() };
  const rows = await rpc<RatingRowData[]>(master, 'rating', {
    p_from: period.from,
    p_to: period.to,
    p_filters: {},
  });
  const workers = rows.filter((r) => r.kind === 'worker' && r.score != null);
  const byF = [...workers].sort((a, b) => Number(a.f) - Number(b.f));
  const serikov = workers.find((r) => r.name.startsWith('Сериков'));
  const fs = workers.map((r) => Number(r.f));
  console.log(`\na) rating, last ${days} days (${workers.length} workers with closed orders)`);
  if (!serikov) {
    console.log('   Сериков Д.: no closed orders in the window');
    return;
  }
  const fRank = byF.findIndex((r) => r.id === serikov.id) + 1;
  console.log(
    `   Сериков Д.: closed ${serikov.closed}, F ${pct(serikov.f)}, team median F ${pct(median(fs))}, ` +
      `team mean F ${pct(fs.reduce((s, x) => s + x, 0) / fs.length)}`,
  );
  console.log(
    `   rank by score ${serikov.rank} of ${workers.length} (score ${serikov.score}); ` +
      `rank by F ${workers.length - fRank + 1} of ${workers.length} (lowest F = ${workers.length}); lowest F: ${byF
        .slice(0, 3)
        .map((r) => `${r.name} ${pct(r.f)}`)
        .join(', ')}`,
  );
  console.log(
    `   Q ${pct(serikov.q)} T ${pct(serikov.t)} V ${pct(serikov.v)} D ${pct(serikov.d)}`,
  );
}

// ---------------------------------------------------------------------------
// b) shift report counts
// ---------------------------------------------------------------------------

async function shiftCounts(master: Session, from: string, to: string): Promise<ShiftReportData> {
  const report = await rpc<ShiftReportData>(master, 'shift_report', { p_from: from, p_to: to, p_filters: {} });
  console.log(`\nb) shift_report ${from} .. ${to}`);
  console.log(`   counts ${JSON.stringify(report.counts)}`);
  console.log(`   rejected_reasons ${JSON.stringify(report.rejected_reasons)}`);
  return report;
}

// ---------------------------------------------------------------------------
// c) the handlers with the local key
// ---------------------------------------------------------------------------

function post(body: unknown, token: string): Request {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

async function employees(s: Session): Promise<SummaryEmployee[]> {
  const { data, error } = await s.client.from('employees').select('id, full_name, short_name, tab_no, pseudonym');
  if (error) throw new Error(`employees: ${error.message}`);
  return (data ?? []) as SummaryEmployee[];
}

async function live(master: Session, from: string, to: string, now: Date): Promise<number> {
  const anthropic = readSecrets('anthropic');
  const get = (k: string): string | undefined =>
    k === 'LLM_PROVIDER' ? 'anthropic' : process.env[k] || anthropic[k] || undefined;
  const base = llmConfigFromEnv(get);
  if (!base.apiKey) {
    console.error('ANTHROPIC_API_KEY is missing in .secrets/anthropic.env');
    return 1;
  }
  const ledgerPath = resolve(secretsDir(), 'llm-ledger.json');
  const ledger = jsonFileLedger({
    read: async () => (existsSync(ledgerPath) ? readFile(ledgerPath, 'utf8') : null),
    write: async (text) => writeFile(ledgerPath, text, { mode: 0o600 }),
  });
  const spentBefore = await ledger.spentUsd();
  const config: LlmConfig = {
    ...base,
    budgetUsd: Math.min(base.budgetUsd ?? 4, spentBefore + RUN_CAP_USD),
    spentUsd: () => ledger.spentUsd(),
    audit: ledger.audit,
    onWarning: (m) => console.warn(`warning: ${m}`),
  };
  console.log(`\nc) live calls; ledger before ${spentBefore.toFixed(6)} USD, run cap ${RUN_CAP_USD} USD`);
  const dir = await employees(master);
  const saved: SummaryInsightRow[] = [];
  const logs: Record<string, unknown>[] = [];
  const log = (e: Record<string, unknown>): void => void logs.push(e);

  let ok = true;
  if (!flag('--live-explain')) {
    const summaryRes = await handleSummaryRequest(post({ from, to, filters: {} }, master.token), {
      db: {
        shiftReport: async (_t, scope) =>
          rpc<ShiftReportData>(master, 'shift_report', {
            p_from: scope.from,
            p_to: scope.to,
            p_filters: scope.filters,
          }),
        employees: async () => dir,
        filterNames: async () => ({}),
        recentSummaries: async (): Promise<CachedSummaryRow[]> => [],
        saveSummary: async (row) => void saved.push(row),
      },
      llmConfig: () => config,
      log,
    });
    const summary = (await summaryRes.json()) as Record<string, unknown>;
    console.log(`   ai-shift-summary: HTTP ${summaryRes.status}, source ${String(summary.source)}, model ${String(summary.model)}`);
    console.log(`   cost ${String(summary.cost_usd ?? 0)} USD, unknown numbers ${JSON.stringify(summary.unknown_numbers ?? [])}`);
    console.log(`   summary: ${String(summary.summary)}`);
    for (const r of (summary.recommendations as string[] | undefined) ?? []) console.log(`   · ${r}`);
    ok &&= summary.source === 'llm';
  }

  if (!flag('--live-summary')) {
    const serikov = dir.find((e) => e.tab_no === '2006');
    if (!serikov) throw new Error('employee 2006 not found');
    const period = { from: new Date(now.getTime() - 30 * DAY).toISOString(), to: now.toISOString() };
    const explainRes = await handleExplainRequest(post({ employee_id: serikov.id, ...period }, master.token), {
      db: {
        getUser: async () => ({ id: master.id, role: 'master' }),
        rating: async (p) =>
          rpc<RatingRowData[]>(master, 'rating', { p_from: p.from, p_to: p.to, p_filters: {} }),
        employees: async () => dir,
      },
      llmConfig: () => config,
      log,
    });
    const explain = (await explainRes.json()) as Record<string, unknown>;
    console.log(
      `   ai-explain-rating (Сериков Д., 30 days): HTTP ${explainRes.status}, source ${String(explain.source)}, ` +
        `model ${String(explain.model)}, cost ${String(explain.cost_usd ?? 0)} USD`,
    );
    console.log(`   text: ${String(explain.text)}`);
    ok &&= explain.source === 'llm';
  }
  const spentAfter = await ledger.spentUsd();
  console.log(`   ledger after ${spentAfter.toFixed(6)} USD (this run ${(spentAfter - spentBefore).toFixed(6)} USD)`);
  console.log(`   logs ${JSON.stringify(logs)}`);
  return ok ? 0 : 1;
}

// ---------------------------------------------------------------------------
// --deployed
// ---------------------------------------------------------------------------

async function deployed(master: Session, from: string, to: string, now: Date): Promise<number> {
  const call = async (fn: string, body: unknown, token: string | null) => {
    const t0 = performance.now();
    const res = await fetch(`${url}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: key!,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, ms: Math.round(performance.now() - t0), body: text };
  };
  const worker = await signIn('2006', '1234');
  const period = { from: new Date(now.getTime() - 30 * DAY).toISOString(), to: now.toISOString() };
  let failed = false;
  const check = (ok: boolean, label: string, detail: string): void => {
    if (!ok) failed = true;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}  ${detail}`);
  };
  console.log('\n--deployed');
  const a = await call('ai-shift-summary', { from, to, filters: {} }, master.token);
  check(a.status === 200, 'ai-shift-summary as master', `HTTP ${a.status}, ${a.ms} ms, ${a.body.slice(0, 160)}`);
  const b = await call('ai-shift-summary', { from, to, filters: {} }, worker.token);
  check(b.status === 403, 'ai-shift-summary as worker 2006', `HTTP ${b.status}, ${b.body.slice(0, 80)}`);
  const c = await call('ai-shift-summary', { from, to }, null);
  check(c.status === 401, 'ai-shift-summary without a session', `HTTP ${c.status}, ${c.body.slice(0, 80)}`);
  const d = await call('ai-explain-rating', { employee_id: worker.id, ...period }, worker.token);
  check(d.status === 200, 'ai-explain-rating, worker 2006 about himself', `HTTP ${d.status}, ${d.ms} ms, ${d.body.slice(0, 200)}`);
  const e = await call('ai-explain-rating', { employee_id: master.id, ...period }, worker.token);
  check(e.status === 403, 'ai-explain-rating, worker about someone else', `HTTP ${e.status}, ${e.body.slice(0, 80)}`);
  const f = await call('ai-explain-rating', { employee_id: worker.id, ...period }, master.token);
  check(f.status === 200, 'ai-explain-rating as master', `HTTP ${f.status}, ${f.ms} ms`);
  return failed ? 1 : 0;
}

// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const now = new Date();
  const master = await signIn('1001', '1111');
  console.log(`signed in as 1001; now ${now.toISOString()}`);
  const shift = periodFor('shift', now);
  const from = opt('--shift-from') ?? shift.from;
  const to = opt('--shift-to') ?? new Date((Math.floor(now.getTime() / 60_000) + 1) * 60_000).toISOString();

  await ratingCheck(master, 30, now);
  await ratingCheck(master, 92, now);
  await shiftCounts(master, from, to);
  let code = 0;
  if (flag('--live') || flag('--live-summary') || flag('--live-explain'))
    code = Math.max(code, await live(master, from, to, now));
  if (flag('--deployed')) code = Math.max(code, await deployed(master, from, to, now));
  return code;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
