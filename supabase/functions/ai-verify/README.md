# ai-verify

The AI completion check of a finished order (CLAUDE.md §11). A thin LLM caller: the rules, the scoring, the
verdict, idempotency and the status change live in SQL (`public.ai_context`, `public.ai_submit`, migration
`rota_ai_review`).

`POST {order_id, source?}` returns `{review}` (the `ai_reviews` row), plus `already_reviewed: true` when the
current attempt was reviewed before, or `rules_only: true` when the model gave no usable answer.

## Flow

1. `rpc('ai_context')` with the secret key. If the current attempt is already reviewed, return that review at once.
   If the order is not in `ai_review`, answer 409 `NOT_IN_REVIEW`.
2. Pick the earliest «до» and the latest «после» photo (`pickVerifyPhotos`), download them from the private
   bucket `photos` (one retry each), check size (≤ 3.7 MB) and type by magic bytes, send them as base64 without
   resizing. Build the message with the shared `_shared/verifyInput.ts` (the golden set uses the same builder).
   A photo that exists but cannot be sent adds one note asking the model for «не уверен» and a lower confidence.
3. Redact every text part with the privacy gateway (directory from `employees`; when the directory is empty or
   does not hold the order's worker, no call goes out and the review is rules-only, `error_code: CONFIG`), then one call through
   `createLlm`: purpose `verify`, `LLM_MODEL_SMART` (claude-sonnet-5-5), the verify JSON schema, thinking
   `between_tools`, effort low, no sampling parameters, 45 s timeout. `llm_audit` gets the redacted request and
   the cost; the budget guard reads the spent sum from there. Up to 3 attempts on network errors, 5xx, 429,
   timeouts and unparsable answers, all inside 50 s, so the function answers before the app falls back (60 s,
   `AI_VERIFY_TIMEOUT_MS`) and before the watchdog calls again (60 s); one 45 s timeout ends the stage.
   `BUDGET_EXCEEDED` (also when the spent sum cannot be read), `CONFIG`, `REFUSAL`, `MAX_TOKENS` and other 4xx
   are final.
4. `rpc('ai_submit', {p_order_id, p_llm, p_meta})`. On success `p_llm` is the answer (pseudonyms rehydrated to
   short names, numbers as returned; `score_1_5` rounded to an integer, `confidence` held to 0..1) and `p_meta` is
   `{model, provider, latency_ms, attempt, tries, prompt_version, input_version}`. On failure `p_llm` is null and
   `p_meta` is `{model: 'rules', llm_model, error: '<Russian reason>', error_code, latency_ms, attempt, tries}`:
   a rules-only review the master confirms. ai_submit puts `error` into the L1 line («не выполнено: …»), so it is
   a short Russian phrase; the code travels as `error_code`. `attempt` makes ai_submit refuse a stale answer
   after a rework (409). When the database refuses the answer itself (twice), the review is rules-only
   (`error_code: SUBMIT`); a failure while collecting the input ends rules-only as well (`error_code: INPUT`),
   so an order in `ai_review` always gets its review. Strings in the answer lose NUL and lone surrogates,
   which jsonb cannot store.
5. ai_submit applies `ai_result` and sends the notifications.

Two calls for the same attempt in one isolate (the app's retry button, the watchdog) share one check, so the
model is paid for once; a reviewed attempt never reaches the model again.

Logs carry ids, provider, model, tries, latency, cost, error codes and the verdict only; `source` is logged as
a short token (`app`, `watchdog`, …) or `other`.

## Auth (verify_jwt = false)

- The project secret key in `apikey` (or as `Authorization: Bearer`): the watchdog retry through pg_net (§9 item 5)
  and scripts. Any key in `SUPABASE_SECRET_KEYS` or the legacy `SUPABASE_SERVICE_ROLE_KEY` counts.
- Otherwise `Authorization: Bearer <user access token>`, checked with `auth.getUser`: the order's assignee, or
  `app_metadata.app_role` master, manager or admin. Another worker gets 403, no or a bad session 401.

## Environment

Provided by the platform: `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` (or `SUPABASE_SERVICE_ROLE_KEY`).
Edge secrets: `LLM_PROVIDER` (default `mock`: deterministic, schema valid, free), `ANTHROPIC_API_KEY`,
`LLM_BUDGET_USD` (default 4), `LLM_MODEL_SMART`, `LLM_BASE_URL` and `LLM_API_KEY` for `openai_compatible`.
With `LLM_PROVIDER=anthropic` and no key the check ends in a rules-only review (`error_code: CONFIG`).

## Deploy

Entrypoint `ai-verify/index.ts`. Files: `ai-verify/{index,handler,auth,input,retry}.ts` and
`_shared/{cors,env,ledger,llm,pricing,privacy,prompts,schemas,verifyInput}.ts`. supabase-js comes from
`npm:@supabase/supabase-js@2.117.3`. Tests, `test-fixtures.ts`, `deno-standin.d.ts`, `tsconfig.json` and
`golden/` are not part of the deploy.

## Test

- `npx vitest run --project supabase/functions/ai-verify`: auth, retry policy, input, the whole handler with a fake
  database (mock provider, and anthropic with a fake fetch: retries, rules-only fallback, budget, redaction).
- `npx tsc --noEmit -p supabase/functions/ai-verify`: type check against `deno-standin.d.ts` and the workspace
  supabase-js types.
- Live: `npm run ai-verify:check` (`tools/ai-verify-check.ts`) creates an order as 1001 for 2001 on equipment 20,
  completes it with an «после» photo, calls the function as the worker twice (same review), without credentials
  (401), as another worker (403) and with the secret key (same review). Free on the mock provider.
- Live, mock provider, on an order in `ai_review`:
  `curl -X POST "$SUPABASE_URL/functions/v1/ai-verify" -H "apikey: $SUPABASE_SECRET_KEY" -H 'content-type: application/json' -d '{"order_id": 123}'`.
  On an already reviewed order the same call returns the stored review and changes nothing.
