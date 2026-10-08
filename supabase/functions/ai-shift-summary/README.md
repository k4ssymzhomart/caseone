# ai-shift-summary

The AI summary of the shift report (CLAUDE.md §14). `POST {from, to, filters?, refresh?}` with a user session returns
`{summary, recommendations, source, model, cached, generated_at, reason?, unknown_numbers?, cost_usd?}`.
Deployed with `verify_jwt = true`.

1. `rpc('shift_report')` with the caller's own token: `require_staff` lets masters, managers and admins through,
   a worker gets 403.
2. A summary of the same scope stored in `ai_insights` (kind `shift_summary`) in the last 10 minutes comes back as
   is; `refresh: true` («Обновить») reuses only one younger than a minute. Rolling windows match when both ends are
   within 10 minutes.
3. The report goes out as Russian lines with every number the model may use, workers by pseudonym only
   (`_shared/reportInput.ts`), then through the privacy gateway: one Sonnet 5.5 call with the `shift_summary` schema,
   thinking `between_tools`, effort low, 40 s timeout. A worker of the workload without a pseudonym stops the call.
4. The answer is cleaned (no spaced dashes), padded to 3 recommendations, checked for numbers the report never
   wrote (`unknown_numbers`, reported, not blocking) and stored in `ai_insights` with the secret key.

The rules text (`_shared/reportText.ts`, the same writer as the mock) answers instead with `source: 'rules'` on the
mock provider (the default while no `LLM_PROVIDER` secret is set), CONFIG, BUDGET_EXCEEDED, HTTP, TIMEOUT or an
unusable answer. Calls are logged in `llm_audit`; the budget guard reads the spent sum from there.
