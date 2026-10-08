# ai-insights

Insight cards for the analytics page and the weekly digest (CLAUDE.md §15). The numbers come from the
architect's detectors (`public.analytics_bundle`, migration `rota_detectors`); the model only writes the words.
`public.insight_cards` is the fallback and the reference.

## Requests

`POST {from, to, filters?, query?}` from a signed-in master, manager or admin (or the secret key) returns
`{cards, scope}`. `from` and `to` are the FilterBar period (ISO, `to` exclusive; default the last 30 days),
`filters` the shared report filter (`area_id`, `equipment_id`, `assignee_id`, `brigade_id`), `query` the question
of the ask box (at most 300 characters).

`POST {digest: true}` with the secret key only: the cards for the 7 local days before today, then
`weekly_digest` to every master and manager. Returns `{cards, scope, digest: {recipients, notified}}`.

`scope`: `from`, `to`, `label` («30 дней»), `filters`, `area_name`, `focus` (detector kinds), `query`,
`parsed_by` (`llm`, `rules`, null without a question), `source` (`llm`, `rules`, `mixed`), `cached`, `model`.
Each card is an `ai_insights` row: `id`, `created_at`, `scope`, `kind`, `severity`, `title`, `body`,
`recommendation`, `evidence: {order_ids, stats}`.

## Flow

1. The question: Haiku 5.5 (`parse_query`: no thinking field, effort low, 10 s) reads it into
   `{area_id, from, to, focus}` against the areas table and the clock (`scope.ts`). The keyword reader covers the
   mock provider and a failed call. A named period replaces the FilterBar period; a named area replaces its area.
2. Cards of the same scope (period length, rolling or fixed end, filters, focus; not the wording) made within the
   cache window come back as they are: model cards for a tenth of the period, at most 6 h; rules cards for at
   most 10 min. `fresh: true` (secret key only) skips the cache.
3. `analytics_bundle` for the scope. Nothing found: no cards, no call. Otherwise Sonnet 5.5 (`insights`: thinking
   `between_tools`, effort low, no sampling parameters) gets the compact rows (`cards.ts`): a `ref` per row
   («top_equipment.0»), no order ids or uuids, pseudonyms instead of names (the privacy gateway redacts the rest
   and rehydrates the answer), shares as whole percents and the counts it would otherwise compute.
4. Every card names its rows in `refs`; its evidence (order ids and the row's numbers) is copied from them. Every
   number in the title, body and recommendation must come from those rows, the period or the detector windows
   (5 days after ППР, 7 days for a repeat, 6 weeks of trend, a 3 hour peak, the 08:00 and 20:00 shift change),
   rounded or as a percent. A card with any other number, or without a known ref, is dropped and the rules card
   of its kind takes its place (`source: mixed`). No usable card at all, a failed call, `BUDGET_EXCEEDED`, no key
   or the mock provider: the cards of `insight_cards` (filtered to the focus, if any).
5. The cards go into `ai_insights` with the scope (plus `key`, `batch`, `prompt_version`).

The whole ask stays inside 36 s (the app falls back to `rpc('insight_cards')` after 40 s); the digest inside 50 s
(pg_net waits 60 s). Logs carry the caller kind, provider, model, counts, cost, latency and error codes; never the
question, the card text or a key.

## Weekly digest

`docs/db-requests.md` asks the architect for the Monday 03:00 UTC cron (08:00 Asia/Qostanay) that posts
`{digest: true, source: 'cron'}` here through pg_net with the Vault secrets, like the watchdog calls ai-verify.
The function stores the week's cards once (`key = digest|{monday}`) and inserts one notification per master and
manager with `dedupe_key = digest:{monday}` (on conflict do nothing), so a second run sends nothing.
Text: «Сводка ИИ за неделю: 7 выводов. Главное: {title of the first card}.», url `/analytics`, severity info.
No cards, no notification.

## Auth (verify_jwt = false)

The digest needs the secret key, which is not a JWT, so the gateway check is off and the function decides
(`_shared/auth.ts`): the secret key in `apikey` (or as a Bearer token), or a user access token checked with
`auth.getUser` whose `app_metadata.app_role` is master, manager or admin. Workers get 403, no or a bad session 401.
The digest path is the secret key only.

## Environment

As ai-verify: `LLM_PROVIDER` (default `mock`), `ANTHROPIC_API_KEY`, `LLM_BUDGET_USD` (default 4),
`LLM_MODEL_SMART`, `LLM_MODEL_FAST`; `SUPABASE_URL` and the secret key come from the platform. Costs go to
`llm_audit`, which the budget guard reads.

## Deploy

Entrypoint `ai-insights/index.ts`. Files: `ai-insights/{index,handler,db,scope,cards,digest}.ts` and
`_shared/{auth,cors,env,ledger,llm,pricing,privacy,prompts,schemas}.ts`. Tests, fixtures, `deno-standin.d.ts`
and `tsconfig.json` are not part of the deploy.

## Test

- `npx vitest run --project supabase/functions/ai-insights`: scope and keyword reader, compaction, number
  grounding and fallbacks on the live fixtures, the whole handler with a fake database (mock provider; anthropic
  with a fake fetch: requests, privacy, mixed cards, budget, cache; the digest).
- `npx tsc --noEmit -p supabase/functions/ai-insights`.
- `npx tsx tools/insights-fixtures.ts` refreshes `fixtures/` from the live project (read only).
- Live: `npx tsx tools/ai-insights-check.ts` (see the file header): the deployed function as a signed-in master
  and manager, 401 and 403, and with `--live` one run of this handler with the local key for 92 days and one for
  «покажи проблемы участка дробления за месяц», every card checked against the bundle.
