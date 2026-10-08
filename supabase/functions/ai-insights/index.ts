// Rota · ai-insights (CLAUDE.md §15): insight cards for the analytics page and the weekly digest.
// POST {from, to, filters, query?} → {cards, scope}; POST {digest: true} with the secret key → the weekly digest.
// Deployed with verify_jwt = false and authorized in code (_shared/auth.ts): the project secret key in `apikey`
// (the Monday cron through pg_net), or a user session of a master, manager or admin.
// The flow lives in handler.ts; this file only wires Deno, the environment and supabase-js.

import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { secretKeyCandidates } from '../_shared/auth.ts';
import { readSecretKey } from '../_shared/env.ts';
import { supabaseLedger } from '../_shared/ledger.ts';
import { llmConfigFromEnv, type LlmConfig } from '../_shared/llm.ts';
import { createInsightsDb } from './db.ts';
import { handleInsightsRequest } from './handler.ts';

const env = (key: string): string | undefined => Deno.env.get(key);

const SUPABASE_URL = env('SUPABASE_URL') ?? '';
const SECRET = readSecretKey(env);
const SECRETS = secretKeyCandidates(env);

const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const db = createInsightsDb(admin);

// mock by default (no secrets set): the cards of public.insight_cards; anthropic once LLM_PROVIDER=anthropic and
// ANTHROPIC_API_KEY exist. Every call is logged in llm_audit; the budget guard reads the spent sum from there.
const ledger = supabaseLedger({ url: SUPABASE_URL, secretKey: SECRET });
function llmConfig(): LlmConfig {
  return {
    ...llmConfigFromEnv(env),
    spentUsd: ledger.spentUsd,
    audit: ledger.audit,
    onWarning: (m) =>
      console.warn(
        JSON.stringify({ fn: 'ai-insights', event: 'warning', message: m.slice(0, 200) }),
      ),
  };
}

Deno.serve((req: Request) => handleInsightsRequest(req, { db, secrets: SECRETS, llmConfig }));
