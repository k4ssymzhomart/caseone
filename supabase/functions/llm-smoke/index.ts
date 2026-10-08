// Rota · llm-smoke: proves the LLM client runs inside Edge Functions.
// Provider from env (LLM_PROVIDER, default mock). With anthropic the budget guard reads llm_audit and
// every call is logged there with the secret key. verify_jwt stays on: only signed-in users may call it.

import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { readSecretKey } from '../_shared/env.ts';
import { supabaseLedger } from '../_shared/ledger.ts';
import { createLlm, isLlmError, llmConfigFromEnv, type LlmConfig } from '../_shared/llm.ts';

const env = (key: string): string | undefined => Deno.env.get(key);

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST' && req.method !== 'GET')
    return jsonResponse({ ok: false, error: 'METHOD' }, 405);

  try {
    let config: LlmConfig = llmConfigFromEnv(env);
    if (config.provider !== 'mock') {
      const ledger = supabaseLedger({
        url: env('SUPABASE_URL') ?? '',
        secretKey: readSecretKey(env),
      });
      config = {
        ...config,
        spentUsd: ledger.spentUsd,
        audit: ledger.audit,
        onWarning: (m) => console.warn(m),
      };
    }
    const llm = createLlm(config);
    const r = await llm.call({
      purpose: 'smoke',
      messages: [{ role: 'user', content: 'Ответь JSON: ok true, echo «Рота готова»' }],
    });
    return jsonResponse({
      ...r.data,
      provider: r.provider,
      model: r.model,
      usage: r.usage,
      cost_usd: r.costUsd,
      latency_ms: r.latencyMs,
    });
  } catch (e) {
    const code = isLlmError(e) ? e.code : 'UNKNOWN';
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse(
      { ok: false, error: code, message },
      code === 'BUDGET_EXCEEDED' ? 402 : 502,
    );
  }
});
