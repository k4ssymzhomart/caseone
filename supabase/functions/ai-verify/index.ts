// Rota · ai-verify (CLAUDE.md §11): the AI completion check of a finished order.
// POST {order_id, source?} → {review}. Deployed with verify_jwt = false and authorized in code (auth.ts):
// the project secret key in `apikey` (watchdog retry through pg_net, §9 item 5), or a user session of the
// order's assignee or of staff (master, manager, admin).
// The flow lives in handler.ts; this file only wires Deno, the environment and supabase-js.

import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { readSecretKey } from '../_shared/env.ts';
import { supabaseLedger } from '../_shared/ledger.ts';
import { llmConfigFromEnv, type LlmConfig } from '../_shared/llm.ts';
import type { DirectoryEmployee } from '../_shared/privacy.ts';
import { secretKeyCandidates } from './auth.ts';
import { DbError, handleVerifyRequest, type VerifyDb, type VerifyReview } from './handler.ts';
import type { VerifyContext } from '../_shared/verifyInput.ts';

const env = (key: string): string | undefined => Deno.env.get(key);

const SUPABASE_URL = env('SUPABASE_URL') ?? '';
const SECRET = readSecretKey(env);
const SECRETS = secretKeyCandidates(env);

const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function dbError(e: { message?: string; code?: string } | null): DbError {
  return new DbError(e?.message || 'database error', e?.code ?? null);
}

const db: VerifyDb = {
  async getUser(token) {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    const role = (data.user.app_metadata as Record<string, unknown> | undefined)?.app_role;
    return { id: data.user.id, role: typeof role === 'string' ? role : null };
  },
  async orderAssignee(orderId) {
    const { data, error } = await admin
      .from('orders')
      .select('assignee_id')
      .eq('id', orderId)
      .maybeSingle();
    if (error) throw dbError(error);
    return (data as { assignee_id: string | null } | null) ?? null;
  },
  async context(orderId) {
    const { data, error } = await admin.rpc('ai_context', { p_order_id: orderId });
    if (error) throw dbError(error);
    return (data as VerifyContext | null) ?? null;
  },
  async review(orderId, attempt) {
    const { data, error } = await admin
      .from('ai_reviews')
      .select('*')
      .eq('order_id', orderId)
      .eq('attempt', attempt)
      .maybeSingle();
    if (error) throw dbError(error);
    return (data as VerifyReview | null) ?? null;
  },
  async employees() {
    const { data, error } = await admin
      .from('employees')
      .select('full_name, short_name, tab_no, pseudonym');
    if (error) throw dbError(error);
    return (data ?? []) as DirectoryEmployee[];
  },
  async download(storagePath) {
    const { data, error } = await admin.storage.from('photos').download(storagePath);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  },
  async submit(orderId, llm, meta) {
    const { data, error } = await admin.rpc('ai_submit', {
      p_order_id: orderId,
      p_llm: llm,
      p_meta: meta,
    });
    if (error) throw dbError(error);
    return data as VerifyReview;
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
      console.warn(JSON.stringify({ fn: 'ai-verify', event: 'warning', message: m.slice(0, 200) })),
  };
}

Deno.serve((req: Request) => handleVerifyRequest(req, { db, secrets: SECRETS, llmConfig }));
