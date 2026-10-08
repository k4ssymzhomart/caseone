// Rota · ai-explain-rating (CLAUDE.md §13): POST {employee_id, from, to} → {text, source, model, generated_at}.
// Deployed with verify_jwt = true: only signed-in users reach it; handler.ts lets a worker ask about themselves
// and staff about anyone, then reads public.rating with the secret key to compare the worker with the team.
// The flow lives in handler.ts; this file only wires Deno, the environment and supabase-js.

import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { DbError, roleOf } from '../_shared/caller.ts';
import { readSecretKey } from '../_shared/env.ts';
import { supabaseLedger } from '../_shared/ledger.ts';
import { llmConfigFromEnv, type LlmConfig } from '../_shared/llm.ts';
import type { DirectoryEmployee } from '../_shared/privacy.ts';
import type { RatingRowData } from '../_shared/reportText.ts';
import { handleExplainRequest, type ExplainDb } from './handler.ts';

const env = (key: string): string | undefined => Deno.env.get(key);

const SUPABASE_URL = env('SUPABASE_URL') ?? '';
const SECRET = readSecretKey(env);

const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function dbError(e: { message?: string; code?: string } | null): DbError {
  return new DbError(e?.message || 'database error', e?.code ?? null);
}

const db: ExplainDb = {
  async getUser(token) {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, role: roleOf(data.user.app_metadata) };
  },
  async rating(period) {
    const { data, error } = await admin.rpc('rating', {
      p_from: period.from,
      p_to: period.to,
      p_filters: {},
    });
    if (error) throw dbError(error);
    return (data ?? []) as RatingRowData[];
  },
  async employees() {
    const { data, error } = await admin
      .from('employees')
      .select('full_name, short_name, tab_no, pseudonym');
    if (error) throw dbError(error);
    return (data ?? []) as DirectoryEmployee[];
  },
};

// mock by default (no secrets set); anthropic once LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY exist.
const ledger = supabaseLedger({ url: SUPABASE_URL, secretKey: SECRET });
function llmConfig(): LlmConfig {
  return {
    ...llmConfigFromEnv(env),
    spentUsd: ledger.spentUsd,
    audit: ledger.audit,
    onWarning: (m) =>
      console.warn(JSON.stringify({ fn: 'ai-explain-rating', event: 'warning', message: m.slice(0, 200) })),
  };
}

Deno.serve((req: Request) => handleExplainRequest(req, { db, llmConfig }));
