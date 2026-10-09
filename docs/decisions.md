# Decisions

Newest first. Each entry: what we decided, why, and what follows from it. Spec: CLAUDE.md; phase briefs in
`docs/PHASE_N.md`.

## 2026-10-09 · Real platform logos instead of plain names, at the owner's request

**Decision.** Where the app, the panel or the site names a platform or a service, the real mark stands beside the
name: Telegram on the profile's Telegram row, Android, Apple or the browser on the push row, Claude beside the model
and in the «Вывод ИИ» header of the master's AI report and on «Что видит ИИ», Windows, Apple and Chrome on the admin
screen that sends people to the web panel. The marks come from `packages/design/src/brand/platforms.ts` and are drawn
only through `PlatformLogo`.

**Why.** The owner found platforms named in text only and asked for their logos throughout the app and the website.
This overrides the «no icon packs» rule for brand logos only; every other icon stays banned.

**Follows.** `docs/design.md` §10 lists the sizes, the tones, the placements and the limits (one row of logos per
block, the name stays visible, status is still a dot plus a word). The Claude mark shows only on reviews Claude wrote,
so a rules only or mock review never carries it. Screens import single logos, never the whole map, to keep the
bundles small.

## 2026-10-08 · Lane B run as subagents by the lane A session

**Decision.** Lane B (`packages/shared`, `apps/web`, `supabase/functions`, `tools`, these docs) ran as subagents
started by the lane A session, each working only in the worktree `~/Downloads/caseone-b` on branch `p0-b`, instead of
in a second Claude Code terminal.

**Why.** Terminal 2 of PHASE_0 §3 was never started, and the lanes were meant to run in parallel.

**Follows.** The lane rules stay the same: lane B never writes into `~/Downloads/caseone` (lane A's checkout of
`main`), never edits the root `package.json`, the architect's database files or the two architect Edge Functions, and
commits only its own paths. Lane A merges `p0-b` into `main`. The subagents report back to lane A, and the user sees
their results through lane A.

## 2026-10-08 · Entity types mirror the database columns in snake_case

**Decision.** Entity and view types in `@rota/shared` use the database column names exactly (`orders.assignee_id`,
`v_orders.board_column`, `ai_reviews.feedback_worker`). RPC input types use the jsonb keys the SQL functions read
(`create_order`: `type`, `priority`, `area_id`, `equipment_id`, `assignee_id`, `due_in_min`, `allow_off_shift` …;
`order_action`: `reason`, `works_done`, `fault_code`, `materials [{material_id, qty}]`, `final_verdict`,
`pause_current` …). `RotaApi` method names stay camelCase.

**Why.** `SupabaseApi` passes rows through without a mapping layer, so there is no mapper to drift from the schema,
and `MockApi` produces the same shapes, so a screen built on the mock works unchanged on the database. Binding for
every agent.

**Follows.** UI code reads snake_case fields. `database.types.ts` is generated from the live project and
regenerated whenever a migration lands; `database.extra.ts` adds what the generator misses (`telegram_link_token`)
and exports one flat `RotaDatabase` type, because a plain intersection of the two broke the typing of `.update()`.

## 2026-10-08 · Fixed templates for the AI texts until Phases 5 and 6

**Decision.** In supabase mode `ai.shiftSummary` and `ai.explainRating` write fixed template text from the real
report numbers, and the analytics ask box uses the mock's keyword parser in front of `insight_cards`.

**Why.** The Edge Functions `ai-shift-summary`, `ai-explain-rating` and `ai-insights` belong to Phases 5 and 6. The
screens needed real content now, and the deterministic text never contradicts the numbers next to it.

**Follows.** Phases 5 and 6 swap in the functions behind the same `RotaApi` methods; the templates can stay as the
fallback when the LLM is off or over budget (for analytics that fallback is `insight_cards`).

## 2026-10-08 · Sign out is per device; an offline cold start keeps the last person

**Decision.** `auth.signOut()` ends the session on this device only and unregisters the push token this device
registered. The signed in person (name, role, tab number) is cached; a cold start that cannot refresh the token
offline keeps that person instead of dropping to the login screen. Fixed directories are cached in memory; equipment,
employees and settings are fetched on every call.

**Why.** A master is signed in on a phone and in the web panel at once, and signing out of one must not end the
other. In the pit and the plant the signal drops often, and a worker in gloves should not retype a PIN for it.
`is_stopped`, `on_shift` and the demo settings change during the demo, so they cannot be cached.

**Follows.** Calls made while offline fail with `NETWORK` and the UI shows «Нет связи»; the session refreshes when
the connection returns.

## 2026-10-08 · The architect applies the Phase 1 database directly to Supabase

**Decision.** The architect writes the schema, RLS, state machine, watchdog, reports, detectors, AI scoring and seed
generator, tests them on a local Postgres and applies them to the project «rota» in parallel with Phase 0, then drops
the same SQL into `supabase/migrations/`, `supabase/seed/` and `supabase/manual/`.

**Why.** Phase 0 could build the apps on the mock while the database was being built, and the database logic lives in
one place with its own SQL tests.

**Follows.** Claude Code does not write migrations or run `supabase db push`, `db reset`, `migration repair` or
`link` without the owner. Changes the apps need go to `docs/db-requests.md`. The remote migration history does not
match the files until the repair in PHASE_1 §2 runs.

## 2026-10-08 · The web panel is a separate Vite app

**Decision.** Masters, the руководитель and the admin get a Vite and React panel in `apps/web`, hosted on Vercel, that
shares `@rota/shared` (the same `RotaApi`, `MockApi` and `SupabaseApi`) and `@rota/design` (`tokens.css`) with the
mobile app.

**Why.** Reports, rating, analytics, PDF and Excel need a wide screen and desktop libraries (recharts, pdfmake,
exceljs). A separate app keeps the Expo bundle small and lets each side use its own platform's components.

**Follows.** React is exactly 19.2.3 in both apps (root `overrides`, `npm ls react` shows one version). The web
build type checks the shared sources too, so they pass `verbatimModuleSyntax`, `erasableSyntaxOnly` and the unused
checks.

## 2026-10-08 · Push through the Expo push service over FCM V1

**Decision.** The mobile app registers an Expo push token; `notify-dispatch` posts to the Expo push service, which
delivers through FCM V1 on Android. Telegram is the second channel. Android channels `orders`, `emergency` (siren,
MAX) and `reminders`.

**Why.** One API for both platforms, receipts that tell us which tokens are dead, and the FCM V1 credentials stay in
EAS rather than in Supabase.

**Follows.** Real remote push needs an EAS project id, `google-services.json` and the FCM key uploaded to EAS. iOS
remote push would need a paid APNs key and is not planned; the iOS Simulator uses `xcrun simctl push` with the same
payload shape.

## 2026-10-08 · Development builds, not Expo Go; SDK 57 pinned

**Decision.** The app runs only as an Expo development build (`expo-dev-client`) and stays on SDK 57 (React Native
0.86, React 19.2.3) for the whole hackathon.

**Why.** Notifications with custom sounds, the camera and bundled fonts need native modules that Expo Go does not
carry. SDK 58 sits on the `next` tag; an upgrade mid hackathon risks the live loop.

**Follows.** `npm run ios` and `npm run android` build the client; `tools/patch-native.mjs` keeps SDK 57 building on
Xcode 26.3 (Swift 6.2).

## 2026-10-08 · LLM budget guard at 4 USD

**Decision.** Every LLM call goes through `_shared/llm.ts`, which sums the spent cost (`llm_audit` in functions, the
ledger file in scripts) and throws `BUDGET_EXCEEDED` above `LLM_BUDGET_USD` (default 4). The default provider is
`mock`.

**Why.** The Anthropic account holds 5 USD for the whole hackathon, including Demo Day. A runaway loop must not spend
it.

**Follows.** Over the cap the AI check falls back to the rules and asks the master to confirm. Golden runs and smoke
tests are run sparingly and print their cost.

## 2026-10-08 · Mock API first

**Decision.** Phase 0 builds every screen on `MockApi`, which implements `RotaApi` with the same state machine,
errors, notifications, simulated AI check and watchdog as the database. Phase 1 swaps in `SupabaseApi` behind the
same interface.

**Why.** The apps and the database were built at the same time, and the mock lets one device walk an order from
«Выдан» to «Закрыт» before the backend exists.

**Follows.** The shared contract suite runs against the mock always and against the live project with
`RUN_SUPABASE=1`. Mock mode stays the mode of the unit tests.

## 2026-10-08 · Dark by default, full light theme

**Decision.** Both apps start dark and have a complete light theme from the same tokens.

**Why.** Night shifts and dim plant floors favour a dark canvas; bright sunlight in the pit needs a light theme.

**Follows.** Every color comes from `@rota/design`; screenshots are taken in both themes.

## 2026-10-08 · Inter as the SF Pro stand-in

**Decision.** Interface text uses Inter (with Geist Mono for numbers, codes and timers) on both platforms.

**Why.** Rota's rules call for SF Pro, which cannot be bundled into an Android app. Inter is an open font close to it,
with full Cyrillic, and one family keeps both platforms identical.

**Follows.** Fonts load through `@expo-google-fonts` on mobile and `@fontsource` on the web.

## 2026-10-08 · No icon packs

**Decision.** No icon libraries. Text labels, the brand images (mark, mascots) and a glyph allowlist
(`› ‹ → ← ↑ ↓ ✓ ✕ + − · • ● ○ … №`).

**Why.** Rota's rules. A label leaves nothing to guess on a noisy plant floor, and there is no extra dependency.

**Follows.** Status is always a dot plus a word, never color alone.

## 2026-10-08 · The Rota design system reused, Rota read only

**Decision.** The apps use the Rota design system: tokens regenerated from Rota's `variables.json`, the web
components, the logo and the 24 mascots, adapted for the plant in `docs/design.md`. `~/Downloads/rota` and the Rota
pages in Figma are never modified.

**Why.** A finished, consistent system saves days and scores on UX; the industrial status colors are an extension,
not a fork.

**Follows.** `npm run tokens` must reproduce Rota's generated files; hackathon designs live only on the Figma page
«QOSTANAI».

## 2026-10-08 · iOS Simulator for daily work, Android for push and the APK

**Decision.** Daily development runs on the Xcode iOS Simulator. Android (a Google Play emulator or USB phones) is for
FCM push tests, the APK and Demo Day.

**Why.** The owner's choice: the simulator is fast and always available. The case requires an Android app and the
demo phones are Android.

**Follows.** Simulator gaps have workarounds: the «после» photo falls back to the library in development, remote push
is simulated with `xcrun simctl push`, haptics are skipped. Every screen must also work on Android.

## 2026-10-08 · React Native with Expo instead of a PWA

**Decision.** The mobile app is React Native with Expo, installed as an APK.

**Why.** The owner's choice. It gives a native feel, reliable push with sounds and a full screen emergency alert,
camera access with EXIF, and simulator development. The case allows a native app.

**Follows.** One codebase builds Android and iOS. The web panel is separate (see above).
