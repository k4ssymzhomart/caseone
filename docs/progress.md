# Progress

Phase briefs: `docs/PHASE_N.md`. Build order: CLAUDE.md §21. Times are Asia/Qostanay (UTC+5).

## Status

As of 2026-10-08, 23:30.

| Phase | Status | Done | Open |
| --- | --- | --- | --- |
| P0 Foundation | done, Android push blocked | Monorepo, `@rota/design`, `@rota/shared` with `MockApi`, every mobile screen on the iOS Simulator, the web panel, Supabase skeleton, LLM client and privacy gateway, `llm:smoke --vision` (0.0010 USD), README, decisions, screenshots in `docs/screenshots/` | Real FCM push on Android: EAS `projectId` is empty in `apps/mobile/app.config.ts` and `google-services.json` is missing (PHASE_0 §9 Needs you 2 and 3) |
| P1 Data core | done, live contract run open | Database built and applied by the architect; `rota_remaining.sql` and both seeds loaded; `tools/db-check.ts` passes; `SupabaseApi`, generated types, parity tests (fixtures, transitions, texts, AI rules) | `RUN_SUPABASE=1` contract suite: every scenario starts with `demo_reset()`, which fails through the API under pg-safeupdate (fix in `docs/db-requests.md`, not applied yet); migration history repair (PHASE_1 §2) only with the owner's yes |
| P2 Live loop | in progress | `createLiveSync` and the data hooks surface (lane B); live sync wired on mobile, two device loop exercised on the live project (lane A); web panel pages on `RotaApi` (lane B, branch `p0-b`, built and checked in mock mode) | Merge `p0-b` into `main`; web panel against the live project; the §7 walkthrough twice with «Сбросить демо» between runs (needs the `demo_reset` fix); Vercel deploy (Needs you 4) |
| P3 Notifications | in progress | `notify-dispatch` and `telegram-webhook` deployed (architect); channels, categories and sounds; push token registration; «Подключить Telegram» in the profile; `tools/gen-edge-env.ts` and `tools/telegram-setup.ts` | Edge secrets set and `setWebhook` run on the project; real push on Android (blocked as in P0); locked phone acceptance |
| P4 AI control | in progress | `ai-verify` Edge Function with the shared input builder, retries, rules only fallback, auth; golden set of 10 cases (`npm run golden`); live golden run 7 of 10 (`docs/golden-results.md`) | Deploy `ai-verify`; `SupabaseApi.ai.verify` still calls `ai_check_rules` (swap to `functions.invoke('ai-verify')` with the rules as fallback); golden ≥ 9 of 10 (prompt fixes listed in `docs/golden-results.md`); escalation one tap reassign on real data |
| P5 Reports and rating | not started | SQL `rating`, `shift_report`, `dashboard` (architect); web pages for them with the shared filter (lane B, mock checked) | `ai-shift-summary`, `ai-explain-rating` (both are fixed templates from the real numbers until then), PDF and Excel export, acceptance counts |
| P6 Analytics | done on the mock provider (2026-10-09), model live from scripts | Detectors, `analytics_bundle`, `insight_cards` (architect); `ai-insights` deployed (v1): Haiku reads the question, Sonnet writes cards from the detector rows, every number checked against the cited rows, rules cards for dropped cards and left out findings, cache by scope, the digest path; `ai.ask` in both APIs; `/analytics` ask box with scope chips, model card tag, mini charts; P1 to P6 within ±20% and two live runs (0.086 USD) in `docs/phase6-acceptance.md`; dashboard tiles checked | Edge secrets `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` on the project; the Monday digest cron and the `d_post_ppr` order (`docs/db-requests.md`, 2026-10-09) |
| P7 Demo hardening | not started | Landing spec `docs/LANDING.md` (lane C) | Release APK, the script three times on real phones, dataset export, architecture diagram, slides, video |

## Live project

Checked 2026-10-08, 23:25, project «rota» `wcjklkpkuhxgfdtbwbuk`.

- `npx tsx tools/db-check.ts` (publishable key, signed in as 1001): areas 4, equipment 25, employees 19, orders 559,
  7 insight cards for 92 days, the first «Конвейер К-3 ломается чаще всех». Exit 0.
- `internal.apply_action`, `internal.generate_history`, `internal.demo_reset` and `public.telegram_link_token`
  exist. `internal.demo_reset()` still has the table wide `update public.employees set on_shift = …` without a
  WHERE clause, so «Сбросить демо» from the apps fails until `docs/db-fixes/demo_reset_where_true.sql` runs.
- Edge Functions: `notify-dispatch` and `telegram-webhook` active (version 1, `verify_jwt` off). `ai-verify` is not
  deployed.
- LLM ledger: 0.1603 USD spent of the 4 USD cap (smoke 0.0010, golden live run 0.1583).

## Branches

- `main` (lane A, `~/Downloads/caseone`) holds lane B up to `b258404` and is 10 commits ahead of `p0-b`.
- `p0-b` (lane B, `~/Downloads/caseone-b`) adds the web panel (`18019f0`, `ccd3a26`) and these docs. A trial merge
  (`git merge-tree main p0-b`) has no conflicts.

## Log

### 2026-10-09

Phase 6 track (worktree branch `worktree-wf_cb013a97-1a7-3`).

- 01:00 · `ai-insights` (`1d80fa0`): scope and keyword reader, compact detector rows with refs, number grounding,
  rules fallback, cache, digest path; `_shared/auth.ts`; the insights schema now asks for `refs` instead of evidence;
  tests on fixtures exported from the live project (`tools/insights-fixtures.ts`).
- 01:20 · live runs with the local key (`54b4f5b`): 8 and 5 model cards, no invented number; prompt `i2` writes
  decimal commas. 0.086 USD for both runs.
- 01:30 · `ai.ask` in `RotaApi` (`99eae66`): SupabaseApi invokes `ai-insights` (40 s) and falls back to
  `rpc('insight_cards')`; `/analytics` ask box, scope chips, mini charts.
- 01:40 · one model call per scope in an isolate, rules cards for findings the model left out (`e3e5c41`).
- 01:52 · `ai-insights` deployed, version 1, `verify_jwt = false`, files identical to the branch;
  `tools/ai-insights-check.ts --deployed` passes; the web panel reads it as руководитель 3001.
- 02:00 · `docs/phase6-acceptance.md`, two database requests (digest cron, `d_post_ppr` order).

### 2026-10-08

Lane B (`packages/shared`, `apps/web`, `supabase/functions`, `tools`, docs). The second terminal was not started, so
the lane A session ran lane B as subagents in the worktree `~/Downloads/caseone-b` on branch `p0-b`.

- 20:42 · 0.5 contract (`ecb4a6a`): domain enums and types mirroring the database columns in snake_case, statuses,
  reasons, priorities, Russian strings (`i18n/ru.ts`), formatters for Asia/Qostanay, directory fixtures of CLAUDE.md
  §19 written by `tools/gen-fixtures.ts` with a drift test against `supabase/seed/directories.json`, the `RotaApi`
  interface and errors. Merged by lane A at 20:42.
- 20:59 · 0.8 `npm run llm:smoke -- --vision`: Haiku 5.5 and Sonnet 5.5 returned schema valid JSON for 0.0010 USD.
- 21:01 · 0.5 domain (`c6e527f`): the transition table of CLAUDE.md §6 with `applyAction` and `allowedActions`,
  worker status, notification templates with Russian plurals, verify rules R1 to R4, the rating formula, `suggest`
  scoring; the parity test against `supabase/tests/transitions.json`.
- 21:01 · 0.8 (`2175b61`): Supabase skeleton without touching the architect's files, `_shared/cors.ts`, `env.ts`,
  `llm.ts` (mock, anthropic, openai_compatible; budget guard; thinking and effort settings of CLAUDE.md §2),
  `privacy.ts` (redact and rehydrate with Russian and Kazakh case endings), `prompts.ts`, `schemas.ts`, `pricing.ts`,
  `ledger.ts`, the `llm-smoke` function and `tools/llm-smoke.ts`.
- 21:29 · 0.5 `MockApi` (`e4d7c84`): the Demo Day start state, persisted store, the state machine through `applyAction`, simulated AI check
  (2.5 s, rules plus a mock judgement), simulated watchdog every 5 s with the dedupe keys of §9, reports, rating and
  insight cards from the fixtures, latency and error injection; the shared contract suite (`api/contract.ts`).
  Merged at 21:30.
- 21:50 · Phase 1 and PHASE_2 §2.1, §2.2 (`b258404`): `database.types.ts` generated from the live project plus
  `database.extra.ts` (`telegram_link_token`, the flat `RotaDatabase` type), `SupabaseApi` for every `RotaApi`
  method with the error mapping of PHASE_1 §6 (`WRONG_PIN`, `NETWORK`, `FORBIDDEN` from 42501), `createLiveSync`
  (one channel per user, 250 ms debounce per key, resync on every subscribe, retries after 1, 2, 5 and 10 s, the shared
  query keys `qk.*`), `tools/db-check.ts`, the `RUN_SUPABASE=1` contract suite. Merged at 21:50.
- 22:17 · 0.7 web foundation (`18019f0`): Vite panel with React 19.2.3, the Rota web kit, `tokens.css`, sidebar layout,
  role guards, `/kit`, the API provider for both modes, live status, theme switch, the shared `FilterBar`.
- 23:20 · 0.7 and PHASE_2 §2.6 web pages (`ccd3a26`): `/login`, `/shift`, `/board`, `/orders/:id`, `/equipment/:id`,
  `/dashboard`, `/reports/shift`, `/reports/rating`, `/analytics`, `/admin/directories`, `/admin/settings`,
  `/admin/ai`, `/demo`. Checked in mock mode in the browser at 375 px and on desktop; not yet against the live project.
- 23:30 · 0.10 docs: `README.md`, this file, `docs/decisions.md`.

Checks on `p0-b` at 23:30: `npx tsc --noEmit -p packages/shared` clean; `npx vitest run` 436 passed, 1 skipped
(`packages/shared` 353 and 1 skipped, `packages/design` 6, `supabase/functions/_shared` 77; the skipped one is the
live contract suite without `RUN_SUPABASE=1`); `npm run build -w apps/web` clean; `npm run check` (tokens up to
date, typecheck of every workspace, tests, web build) exit 0.

Other lanes the same day, for context (on `main`): monorepo, design tokens, Expo app, mobile kit and every screen,
screenshots (lane A); live sync wiring and the Phase 2 audit fixes, Telegram link, `ai-verify` and the golden set
(Phases 2 to 4); database, seeds and Edge Functions for dispatch and Telegram (architect); landing spec (lane C).
