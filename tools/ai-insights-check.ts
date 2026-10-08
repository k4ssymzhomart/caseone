// npx tsx tools/ai-insights-check.ts [--patterns] [--deployed] [--sessions] [--live]
// Live checks of ai-insights (CLAUDE.md §15, §21 P6). Never prints keys or tokens.
//
//   --patterns  (read only, free) public.analytics_bundle and public.insight_cards for the 92 day history and for
//               «участок дробления за 30 дней», compared with the answer key tools/seed/PATTERNS.md (±20%).
//   --deployed  (free while the project runs the mock provider) the deployed function with the secret key (the
//               caller the cron uses): 92 days, the demo question, the cache on a second call; no credentials and
//               the publishable key alone 401, a broken session 401. Never the digest: that sends notifications.
//   --sessions  the user paths, signed in with the seeded test accounts: master 1001 and manager 3001 get cards,
//               worker 2001 gets 403, a manager asking for the digest 403.
//   --live      (paid, about 0.05 USD a run) this repo's handler with the local Anthropic key
//               (.secrets/anthropic.env), the project database through the secret key and the JSON ledger
//               .secrets/llm-ledger.json as the budget guard: the 92 day history and «покажи проблемы участка
//               дробления за месяц», fresh (no cache). Every card's numbers are checked against the whole bundle.
//               The cards land in ai_insights like any other run. Stops before a run when the ledger has grown
//               by RUN_CAP_USD since the start.
// Without a flag: --patterns and --deployed.
// Reads SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY from .secrets/supabase.env.
// Exit codes: 0 every check passed, 1 a check failed.

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { accountEmail, accountPassword } from '@rota/shared';
import { secretKeyCandidates } from '../supabase/functions/_shared/auth.ts';
import { jsonFileLedger } from '../supabase/functions/_shared/ledger.ts';
import { llmConfigFromEnv } from '../supabase/functions/_shared/llm.ts';
import {
  collectNumbers,
  numberForms,
  numbersIn,
  scopeNumbers,
  type AnalyticsBundle,
  type Row,
} from '../supabase/functions/ai-insights/cards.ts';
import { createInsightsDb } from '../supabase/functions/ai-insights/db.ts';
import {
  handleInsightsRequest,
  type InsightsBody,
} from '../supabase/functions/ai-insights/handler.ts';
import { readSecrets } from './lib/env.ts';

const RUN_CAP_USD = 0.15;
const DEMO_QUERY = 'покажи проблемы участка дробления за месяц';
/** The generated history: 92 local days ending at the local midnight of 2026-10-08. */
const HISTORY = { from: '2026-07-07T19:00:00.000Z', to: '2026-10-07T19:00:00.000Z' };

const args = new Set(process.argv.slice(2));
const any =
  args.has('--patterns') || args.has('--deployed') || args.has('--sessions') || args.has('--live');
const doPatterns = args.has('--patterns') || !any;
const doDeployed = args.has('--deployed') || !any;
const doSessions = args.has('--sessions');
const doLive = args.has('--live');

const root = resolve(import.meta.dirname, '..');
const supa = readSecrets('supabase');
const url = process.env.SUPABASE_URL || supa.SUPABASE_URL;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY || supa.SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY || supa.SUPABASE_SECRET_KEY;
if (!url || !publishable || !secret) {
  console.error(
    'SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY or SUPABASE_SECRET_KEY missing in .secrets/supabase.env',
  );
  process.exit(1);
}
const fnUrl = `${url}/functions/v1/ai-insights`;
const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

let failed = false;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
}

async function rpc<T>(fn: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, params);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

const rows = (b: AnalyticsBundle, k: string): Row[] => (Array.isArray(b[k]) ? (b[k] as Row[]) : []);
const num = (v: unknown): number => Number(v);

// ---------------------------------------------------------------------------
// --patterns: the answer key
// ---------------------------------------------------------------------------

interface PatternRow {
  pattern: string;
  measure: string;
  expected: number;
  found: number | null;
  /** Exact counts (planted schedules) must match; magnitudes get ±20%. */
  exact?: boolean;
}

function within(r: PatternRow): boolean {
  if (r.found === null) return false;
  if (r.exact) return r.found === r.expected;
  return Math.abs(r.found - r.expected) <= 0.2 * Math.abs(r.expected);
}

async function patterns(): Promise<void> {
  console.log('\n== patterns: analytics_bundle against tools/seed/PATTERNS.md (92 days) ==');
  const p = { p_from: HISTORY.from, p_to: HISTORY.to, p_filters: {} };
  const b = await rpc<AnalyticsBundle>('analytics_bundle', p);
  const cards = await rpc<{ kind: string; title: string; body: string }[]>('insight_cards', p);
  const now = new Date();
  const month = {
    p_from: new Date(now.getTime() - 30 * 86_400_000).toISOString(),
    p_to: now.toISOString(),
    p_filters: { area_id: 2 },
  };
  const b30 = await rpc<AnalyticsBundle>('analytics_bundle', month);
  const cards30 = await rpc<{ kind: string; body: string }[]>('insight_cards', month);

  const k3 = rows(b, 'top_equipment').find((r) => r.name === 'Конвейер К-3');
  const k3codes = (k3?.top_codes as Row[] | undefined) ?? [];
  const k3m02 = k3codes.find((c) => c.code === 'М-02');
  const k3top = rows(b, 'top_equipment')[0];
  const maxDowntime = Math.max(...rows(b, 'top_equipment').map((r) => num(r.downtime_h)));
  const k3month = rows(b30, 'top_equipment').find((r) => r.name === 'Конвейер К-3');
  const k3monthM02 = ((k3month?.top_codes as Row[] | undefined) ?? []).find(
    (c) => c.code === 'М-02',
  );
  const serikov = rows(b, 'worker_repeats').find((r) => r.pseudonym === 'E06');
  const kmd2 = rows(b, 'post_ppr').find((r) => r.name === 'Дробилка КМД-1750 №2');
  const night = rows(b, 'time_patterns').find((r) => r.area_id === 3 && r.group === 'Э');
  const litol = rows(b, 'materials').find(
    (r) => r.kind === 'brigade' && r.name === 'Бригада 1' && r.code === 'С-01',
  );
  const pump = rows(b, 'trend').find((r) => r.name === 'Насос водоотлива ЦНС-300 №2');
  const v = (x: unknown): number | null => (x === undefined || x === null ? null : num(x));

  const table: PatternRow[] = [
    {
      pattern: 'P1',
      measure: 'К-3 unplanned failures, 92 days',
      expected: 21,
      found: v(k3?.unplanned),
      exact: true,
    },
    {
      pattern: 'P1',
      measure: 'К-3 ratio to the fleet median',
      expected: 3,
      found: v(k3?.ratio_to_median),
    },
    {
      pattern: 'P1',
      measure: 'К-3 failures with М-02',
      expected: 15,
      found: v(k3m02?.count),
      exact: true,
    },
    { pattern: 'P1', measure: 'К-3 unplanned downtime, h', expected: 95, found: v(k3?.downtime_h) },
    {
      pattern: 'P1',
      measure: 'К-3 failures, участок дробления, 30 days',
      expected: 7,
      found: v(k3month?.unplanned),
      exact: true,
    },
    {
      pattern: 'P1',
      measure: 'of them М-02, 30 days',
      expected: 5,
      found: v(k3monthM02?.count),
      exact: true,
    },
    {
      pattern: 'P2',
      measure: 'Сериков Д. repeat failure share',
      expected: 0.41,
      found: v(serikov?.repeat_share),
    },
    {
      pattern: 'P2',
      measure: 'team repeat failure share',
      expected: 0.14,
      found: v(serikov?.team_share),
    },
    {
      pattern: 'P2',
      measure: 'Сериков Д. rework share',
      expected: 0.35,
      found: v(serikov?.rework_share),
    },
    {
      pattern: 'P3',
      measure: 'КМД-1750 №2 ППР in 92 days',
      expected: 13,
      found: v(kmd2?.planned),
      exact: true,
    },
    {
      pattern: 'P3',
      measure: 'share followed by a failure within 5 days',
      expected: 0.62,
      found: v(kmd2?.followed_by_failure),
    },
    {
      pattern: 'P3',
      measure: 'same unit outside those windows',
      expected: 0.17,
      found: v(kmd2?.unit_base),
    },
    {
      pattern: 'P3',
      measure: 'ППР by бригада 3',
      expected: 3,
      found: v(kmd2?.brigade_id),
      exact: true,
    },
    {
      pattern: 'P4',
      measure: 'обогащение Э failures at night',
      expected: 13,
      found: v(night?.night),
      exact: true,
    },
    {
      pattern: 'P4',
      measure: 'обогащение Э failures by day',
      expected: 5,
      found: v(night?.day),
      exact: true,
    },
    {
      pattern: 'P4',
      measure: 'night to day ratio (2.2 to 2.6)',
      expected: 2.4,
      found: v(night?.night_to_day),
    },
    {
      pattern: 'P4',
      measure: 'peak window starts at (h)',
      expected: 2,
      found: night ? Number(String(night.peak_from).slice(0, 2)) : null,
      exact: true,
    },
    {
      pattern: 'P5',
      measure: 'бригада 1 Литол-24 on С-01, × norm',
      expected: 2.2,
      found: v(litol?.ratio),
    },
    { pattern: 'P5', measure: 'orders behind it', expected: 57, found: v(litol?.orders) },
    {
      pattern: 'P6',
      measure: 'ЦНС-300 №2 slope per week',
      expected: 0.5,
      found: v(pump?.slope_per_week),
    },
    {
      pattern: 'P6',
      measure: 'failures in the last 2 weeks',
      expected: 5,
      found: v(pump?.last_2_weeks),
      exact: true,
    },
    {
      pattern: 'P6',
      measure: 'failures in the first 2 weeks',
      expected: 1,
      found: v(pump?.first_2_weeks),
      exact: true,
    },
  ];
  console.log('| Pattern | Measure | Expected | Found | Within |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const r of table) {
    const ok = within(r);
    if (!ok) failed = true;
    console.log(
      `| ${r.pattern} | ${r.measure} | ${r.expected} | ${r.found ?? 'missing'} | ${ok ? 'yes' : 'NO'} |`,
    );
  }
  console.log(
    `P1 is the top unit: ${k3top?.name === 'Конвейер К-3'}; К-3 has the most downtime: ${num(k3?.downtime_h) === maxDowntime}`,
  );
  console.log(`P6 weekly: ${JSON.stringify(pump?.weekly)}`);
  console.log('\ninsight_cards, 92 days:');
  for (const c of cards) console.log(`  [${c.kind}] ${c.title}`);
  console.log('insight_cards, участок дробления, 30 days:');
  for (const c of cards30) console.log(`  [${c.kind}] ${c.body}`);
}

// ---------------------------------------------------------------------------
// --deployed: the function the way the apps call it
// ---------------------------------------------------------------------------

async function signIn(tabNo: string, pin: string): Promise<string> {
  const client = createClient(url!, publishable!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: accountEmail(tabNo),
    password: accountPassword(pin),
  });
  if (error || !data.session)
    throw new Error(`sign in ${tabNo}: ${error?.message ?? 'no session'}`);
  return data.session.access_token;
}

async function callFn(body: unknown, headers: Record<string, string>) {
  const t0 = performance.now();
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: (InsightsBody & { error?: string }) | null = null;
  try {
    json = JSON.parse(text) as InsightsBody & { error?: string };
  } catch {
    json = null;
  }
  return { status: res.status, body: json, ms: Math.round(performance.now() - t0) };
}

/** The cards path, for any caller that may ask: 92 days, the demo question, then the cache. */
async function askAs(headers: Record<string, string>, who: string): Promise<void> {
  const plain = await callFn({ ...HISTORY, filters: {} }, headers);
  check(
    plain.status === 200 && Array.isArray(plain.body?.cards),
    `${who}, 92 days`,
    `${plain.status}, ${plain.ms} ms`,
  );
  if (plain.body?.scope) {
    const s = plain.body.scope;
    console.log(
      `     scope: ${s.label}, source ${s.source}, cached ${s.cached}, ${plain.body.cards.length} cards`,
    );
    for (const c of plain.body.cards) console.log(`     [${c.kind}] ${c.title}`);
    check(plain.body.cards.length >= 5, 'at least 5 cards for 92 days');
    check(
      plain.body.cards.every((c) => typeof c.id === 'number'),
      'cards stored in ai_insights',
    );
  }

  const asked = await callFn(
    {
      from: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      to: new Date().toISOString(),
      query: DEMO_QUERY,
    },
    headers,
  );
  check(asked.status === 200, `${who}, the demo question`, `${asked.status}, ${asked.ms} ms`);
  const s = asked.body?.scope;
  if (s) {
    console.log(
      `     scope: ${s.label}, ${s.area_name}, parsed by ${s.parsed_by}, source ${s.source}`,
    );
    check(
      s.area_name === 'Участок дробления' && s.label === '30 дней',
      'the question sets area and period',
    );
    // the rules card says «7 внеплановых остановок за 30 дней, 5 из них шифр М-02»; a model card may say it its way
    const k3 = asked.body?.cards.find((c) => /К-3/.test(`${c.title} ${c.body}`));
    const text = k3 ? `${k3.title} ${k3.body}` : '';
    check(
      /(^|\D)7(\D|$)/.test(text) && /(^|\D)5(\D|$)/.test(text) && /М-02/.test(text),
      'К-3: 7 stops, 5 of them М-02',
      k3?.body ?? 'no card',
    );
  }

  const again = await callFn({ ...HISTORY, filters: {} }, headers);
  check(
    again.status === 200 && again.body?.scope.cached === true,
    `${who}, the same scope again comes from the cache`,
    `${again.ms} ms`,
  );
}

async function deployed(): Promise<void> {
  console.log('\n== deployed ai-insights, secret key ==');
  await askAs({ apikey: secret! }, 'secret key');
  // past the cache: the provider the project runs (mock until LLM_PROVIDER=anthropic is set) answers
  const week = {
    from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    to: new Date().toISOString(),
    fresh: true,
  };
  const fresh = await callFn(week, { apikey: secret! });
  check(
    fresh.status === 200 && fresh.body?.scope.cached === false,
    'a fresh call computes cards',
    `${fresh.status}, ${fresh.ms} ms, source ${fresh.body?.scope.source}, ${fresh.body?.cards.length} cards, ${fresh.body?.scope.label}`,
  );
  check((await callFn({}, {})).status === 401, 'no credentials: 401');
  check((await callFn({}, { apikey: publishable! })).status === 401, 'publishable key alone: 401');
  check(
    (await callFn({}, { apikey: publishable!, authorization: 'Bearer not-a-session' })).status ===
      401,
    'a broken session: 401',
  );
}

async function sessions(): Promise<void> {
  console.log('\n== deployed ai-insights, test accounts ==');
  const as = (token: string) => ({ apikey: publishable!, authorization: `Bearer ${token}` });
  const master = await signIn('1001', '1111');
  const manager = await signIn('3001', '3333');
  const worker = await signIn('2001', '1234');
  await askAs(as(master), 'master');
  await askAs(as(manager), 'manager');
  check((await callFn({}, as(worker))).status === 403, 'worker: 403');
  check((await callFn({ digest: true }, as(manager))).status === 403, 'digest as a manager: 403');
}

// ---------------------------------------------------------------------------
// --live: the handler with the local key
// ---------------------------------------------------------------------------

function allBundleNumbers(b: AnalyticsBundle): Set<string> {
  const nums: number[] = [];
  for (const k of Object.keys(b)) {
    if (k === 'period' || k === 'area') continue;
    for (const r of rows(b, k)) {
      collectNumbers(r, nums);
      // the derived percents and counts the model sees (cards.ts compactRow)
      for (const s of [
        'share',
        'followed_by_failure',
        'unit_base',
        'repeat_share',
        'team_share',
        'rework_share',
        'team_rework_share',
        'peak_share',
      ])
        if (r[s] !== undefined) nums.push(Math.round(num(r[s]) * 100));
      if (r.followed_by_failure !== undefined)
        nums.push(Math.round(num(r.followed_by_failure) * num(r.planned)));
      if (r.peak_share !== undefined) nums.push(Math.round(num(r.peak_share) * num(r.count)));
      for (const c of (r.top_codes as Row[] | undefined) ?? [])
        nums.push(Math.round(num(c.share) * 100));
    }
  }
  return numberForms(nums);
}

async function live(): Promise<void> {
  console.log('\n== live: the handler with the local Anthropic key ==');
  const anthropic = readSecrets('anthropic');
  if (!anthropic.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is missing in .secrets/anthropic.env');
    process.exit(1);
  }
  const ledgerPath = resolve(root, '.secrets', 'llm-ledger.json');
  const ledger = jsonFileLedger({
    read: async () => (existsSync(ledgerPath) ? readFile(ledgerPath, 'utf8') : null),
    write: async (text) => writeFile(ledgerPath, text, { mode: 0o600 }),
  });
  const start = await ledger.spentUsd();
  const env = (k: string): string | undefined =>
    (({ LLM_PROVIDER: 'anthropic', ...anthropic }) as Record<string, string | undefined>)[k] ??
    process.env[k];
  const db = createInsightsDb(admin as never);
  const secrets = secretKeyCandidates((k) => (k === 'SUPABASE_SECRET_KEY' ? secret : undefined));

  const runs = [
    { name: '92 days of history', body: { ...HISTORY, filters: {}, fresh: true } },
    {
      name: `«${DEMO_QUERY}»`,
      body: {
        from: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        to: new Date().toISOString(),
        query: DEMO_QUERY,
        fresh: true,
      },
    },
  ];
  for (const r of runs) {
    const spent = (await ledger.spentUsd()) - start;
    if (spent >= RUN_CAP_USD) {
      check(false, `run cap ${RUN_CAP_USD} USD reached before ${r.name}`, spent.toFixed(4));
      break;
    }
    const logs: Record<string, unknown>[] = [];
    const t0 = performance.now();
    const res = await handleInsightsRequest(
      new Request(fnUrl, {
        method: 'POST',
        headers: { apikey: secret!, 'content-type': 'application/json' },
        body: JSON.stringify(r.body),
      }),
      {
        db,
        secrets,
        llmConfig: () => ({
          ...llmConfigFromEnv(env),
          spentUsd: () => ledger.spentUsd(),
          audit: ledger.audit,
        }),
        askBudgetMs: 90_000,
        log: (e) => logs.push(e),
      },
    );
    const body = (await res.json()) as InsightsBody;
    const ms = Math.round(performance.now() - t0);
    const log = logs.find((l) => l.event === 'insights') ?? {};
    console.log(
      `\n-- ${r.name}: ${res.status}, ${ms} ms, source ${body.scope?.source}, parsed by ${body.scope?.parsed_by}, ${body.cards?.length} cards, cost ${log.cost_usd} USD, dropped ${log.dropped}, replaced ${log.replaced}${log.error ? `, error ${log.error}` : ''}${log.parse_error ? `, parse error ${log.parse_error}` : ''}`,
    );
    check(
      res.status === 200 && body.scope?.source !== 'rules',
      `${r.name}: model cards`,
      `${body.scope?.label}, ${body.scope?.area_name ?? 'все участки'}`,
    );
    const bundle = await rpc<AnalyticsBundle>('analytics_bundle', {
      p_from: body.scope.from,
      p_to: body.scope.to,
      p_filters: body.scope.filters,
    });
    const allowed = allBundleNumbers(bundle);
    for (const n of scopeNumbers(body.scope)) for (const f of numberForms([n])) allowed.add(f);
    for (const c of body.cards) {
      const origin = (c.evidence.stats as Row).refs ? 'llm' : 'rules';
      const text = `${c.title}\n${c.body}\n${c.recommendation}`;
      const nums = numbersIn(text);
      const bad = nums.filter((x) => !allowed.has(String(Math.round(Math.abs(x) * 100) / 100)));
      console.log(`   [${c.kind} · ${c.severity} · ${origin}] ${c.title}`);
      console.log(`      ${c.body}`);
      console.log(`      → ${c.recommendation}`);
      console.log(
        `      numbers ${JSON.stringify(nums)}; orders ${c.evidence.order_ids.length}; refs ${JSON.stringify((c.evidence.stats as Row).refs ?? null)}`,
      );
      check(
        bad.length === 0,
        `      every number is in the bundle`,
        bad.length ? JSON.stringify(bad) : '',
      );
    }
  }
  const total = (await ledger.spentUsd()) - start;
  console.log(
    `\nlive cost ${total.toFixed(6)} USD (cap ${RUN_CAP_USD}); ledger total ${(await ledger.spentUsd()).toFixed(6)} USD`,
  );
  check(total < RUN_CAP_USD, 'under the run cap');
}

if (doPatterns) await patterns();
if (doDeployed) await deployed();
if (doSessions) await sessions();
if (doLive) await live();
process.exit(failed ? 1 : 0);
