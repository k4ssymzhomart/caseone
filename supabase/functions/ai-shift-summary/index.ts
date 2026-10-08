// Rota · ai-shift-summary (CLAUDE.md §14): POST {from, to, filters?, refresh?} → {summary, recommendations, source,
// model, cached, generated_at}. Deployed with verify_jwt = true: only signed-in users reach it, and the report RPC
// runs with the caller's own token, so require_staff decides (masters, managers, admins).
// The flow lives in handler.ts; this file only wires Deno, the environment and supabase-js.

import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { DbError } from '../_shared/caller.ts';
import { readPublishableKey, readSecretKey } from '../_shared/env.ts';
import { supabaseLedger } from '../_shared/ledger.ts';
import { llmConfigFromEnv, type LlmConfig } from '../_shared/llm.ts';
import type { CachedSummaryRow } from '../_shared/reportInput.ts';
import type { ShiftReportData } from '../_shared/reportText.ts';
import { handleSummaryRequest, type SummaryDb, type SummaryEmployee } from './handler.ts';

const env = (key: string): string | undefined => Deno.env.get(key);

const SUPABASE_URL = env('SUPABASE_URL') ?? '';
const SECRET = readSecretKey(env);
const PUBLIC_KEY = readPublishableKey(env);
const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

const admin = createClient(SUPABASE_URL, SECRET, { auth: NO_SESSION });

/** A client that calls the API as the signed-in user (RLS and the RPC role checks apply). */
function asUser(token: string) {
  return createClient(SUPABASE_URL, PUBLIC_KEY, {
    auth: NO_SESSION,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function dbError(e: { message?: string; code?: string } | null): DbError {
  return new DbError(e?.message || 'database error', e?.code ?? null);
}

async function nameOf(table: 'areas' | 'equipment' | 'brigades', id: number | undefined) {
  if (id == null) return null;
  const { data } = await admin.from(table).select('name').eq('id', id).maybeSingle();
  return (data as { name?: string } | null)?.name ?? null;
}

const db: SummaryDb = {
  async shiftReport(token, scope) {
    const { data, error } = await asUser(token).rpc('shift_report', {
      p_from: scope.from,
      p_to: scope.to,
      p_filters: scope.filters,
    });
    if (error) throw dbError(error);
    return data as ShiftReportData;
  },
  async employees() {
    const { data, error } = await admin
      .from('employees')
      .select('id, full_name, short_name, tab_no, pseudonym');
    if (error) throw dbError(error);
    return (data ?? []) as SummaryEmployee[];
  },
  async filterNames(filters) {
    const [area, equipment, brigade] = await Promise.all([
      nameOf('areas', filters.area_id),
      nameOf('equipment', filters.equipment_id),
      nameOf('brigades', filters.brigade_id),
    ]);
    return { area, equipment, brigade };
  },
  async recentSummaries(sinceIso) {
    const { data, error } = await admin
      .from('ai_insights')
      .select('id, created_at, scope, body, recommendation, evidence')
      .eq('kind', 'shift_summary')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw dbError(error);
    return (data ?? []) as CachedSummaryRow[];
  },
  async saveSummary(row) {
    const { error } = await admin.from('ai_insights').insert(row);
    if (error) throw dbError(error);
  },
};

// mock by default (no secrets set); anthropic once LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY exist.
// Every call is logged in llm_audit (redacted request, cost); the budget guard reads the spent sum from there.
const ledger = supabaseLedger({ url: SUPABASE_URL, secretKey: SECRET });
function llmConfig(): LlmConfig {
  return {
    ...llmConfigFromEnv(env),
    spentUsd: ledger.spentUsd,
    audit: ledger.audit,
    onWarning: (m) =>
      console.warn(JSON.stringify({ fn: 'ai-shift-summary', event: 'warning', message: m.slice(0, 200) })),
  };
}

Deno.serve((req: Request) => handleSummaryRequest(req, { db, llmConfig }));
