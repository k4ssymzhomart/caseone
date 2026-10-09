# Progress

Phase briefs: `docs/PHASE_N.md`. Build order: CLAUDE.md §21. Times are Asia/Qostanay (UTC+5).

## Status

As of 2026-10-09, 02:45.

| Phase | Status | Done | Open |
| --- | --- | --- | --- |
| P0 Foundation | done | Monorepo, `@rota/design`, `@rota/shared` with `MockApi`, every mobile screen, the web panel, Supabase skeleton, LLM client and privacy gateway, `llm:smoke --vision`, README, decisions, screenshots | Real FCM push on Android needs Firebase (`google-services.json` + the FCM V1 key in EAS) |
| P1 Data core | done | Database by the architect, seeds loaded (559 orders), `SupabaseApi`, types, parity tests, `tools/db-check.ts` passes | `RUN_SUPABASE=1` contract suite waits for the `demo_reset` fix; migration history repair only with the owner's yes |
| P2 Live loop | done, walkthrough repeat open | Both apps in Supabase mode; live loop on two simulators against the real database (issue → red screen in under 3 s → accept, start, close with photo → AI check → master close); photo pipeline to Storage; web panel on real data | The §7 walkthrough twice with «Сбросить демо» between runs (the reset now works: `RUN_SUPABASE=1` contract suite 7 of 7) |
| P3 Notifications | done except Android push | `notify-dispatch`, `telegram-webhook` (architect); channels, categories, sounds, siren screen, in-app toasts with the body; simulated APNs push opens the red screen; «Подключить Telegram» in the profile; Edge secrets set; Telegram `setWebhook` to `telegram-webhook` (bot @rota_case1_bot, no errors) | Firebase for Android push (`google-services.json`, FCM V1 key in EAS); locked phone acceptance on a real phone |
| P4 AI control | done, live on Sonnet 5.5 | `ai-verify` v4 deployed (rules in SQL, one Sonnet call, rules only fallback, auth, idempotent); golden set **10 из 10** live (`docs/golden-results.md`, 0.16 USD); `ai.verify` calls the function with the rules as fallback; escalation link opens the reassign sheet | none |
| P5 Reports and rating | done | `ai-shift-summary` (Sonnet) and `ai-explain-rating` (Haiku) deployed; PDF and Excel export; Сериков last on first time fix (64.7% vs team 91.3%, 92 days); `shift_report` equals the manual SQL count in five windows (`docs/phase5-acceptance.md`) | none (workload fix applied 2026-10-09) |
| P6 Analytics | done | `ai-insights` deployed: Haiku reads the question, Sonnet writes cards, numbers checked against the data, rules fallback, cache, digest path; ask box, scope chips, mini charts; P1 to P6 within ±20% (`docs/phase6-acceptance.md`) | none (digest cron and `d_post_ppr` order applied 2026-10-09) |
| P7 Demo hardening | in progress | Landing at `/` (`docs/LANDING.md`); Android APK built on EAS (preview profile); presentation screenshots in `docs/screenshots/presentation/`; `docs/architecture.md` | The script three times on real phones, dataset export, slides, video, VM deploy (`docs/DEPLOY_VM.md`) |

## Live project

Checked 2026-10-09, 01:50, project «rota» `wcjklkpkuhxgfdtbwbuk`.

- `npx tsx tools/db-check.ts`: areas 4, equipment 25, employees 19, orders 559 plus test orders, 7 insight cards for 92 days.
- Edge Functions: `notify-dispatch`, `telegram-webhook` (architect), `ai-verify` v4, `ai-shift-summary`, `ai-explain-rating`, `ai-insights`. Edge secrets set 2026-10-09: the AI functions call Claude (`llm_audit` after the checks: claude-sonnet-5-5 verify and insights, claude-haiku-5-5 parse_query, no mock).
- `docs/db-fixes/2026-10-09_apply_all.sql` applied by the owner (demo_reset, shift_report, d_post_ppr, weekly digest cron).
- `RUN_SUPABASE=1` contract suite: 7 of 7 against the live project (each scenario starts with `demo.reset()`).
- `npm run ai-verify:check`: Sonnet 5.5 judged the after photo, 200 in 9 s, idempotent, 401/403 as expected. `tools/ai-insights-check.ts --deployed`: 8 model cards for 92 days, the demo question parsed by Haiku as участок дробления, 30 days; the К-3 card has 7 stops, 5 of them М-02.
- LLM ledger: about 0.42 USD of the 4 USD cap.
- Web (Netlify, 2026-10-09): https://rota-naryad.netlify.app (`deploy/netlify/deploy.sh`; the Vercel account was out of free daily deployments). Checked signed in as master, manager and admin.
- APK (EAS preview, 2026-10-09): https://expo.dev/artifacts/eas/TlD9ou-FgpTX4RRfRIUjpkPEHCZDq6WKPXv5lNiAxJ0.apk

## Branches

- `main` holds every lane: `p0-b` (lane B), the P5, P6 and landing worktree branches, all merged 2026-10-09.

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

### 2026-10-09

- 00:00 to 02:00. Release build retakes of every presentation screen on real data (`docs/screenshots/presentation/`, indexed). Live loop on two simulators against the real database, including demo step 7 (no photo, 6 bearings → rework with both reasons).
- Phase 4 finished: prompt p0.2 and code consistency cleanup, golden 10 из 10 live, `ai-verify` v4 deployed and checked.
- Phase 5 and Phase 6 built in worktrees, deployed, accepted, merged. Landing merged.
- EAS project linked (`de6b8e43-…`), preview APK built in the cloud.
- 02:30. Owner applied the SQL bundle and set the Edge secrets. Telegram webhook set; live checks pass on the real models; contract suite 7 of 7.
- 03:10. Web panel and landing live on Netlify: https://rota-naryad.netlify.app.
