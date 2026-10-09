# Rota · development guide

Everything a developer needs to set up, run, seed, deploy and debug Rota. The project overview is the
[README](../README.md); the engineering spec is [`CLAUDE.md`](../CLAUDE.md); status is in [`progress.md`](progress.md).
Commands run from the repository root unless a step says `cd`.

- [Prerequisites](#prerequisites) · [Setup](#setup) · [API modes](#api-modes) · [Run](#run) · [Database](#database) ·
  [Edge Functions](#edge-functions) · [Test accounts](#test-accounts) · [Scripts](#scripts) · [Demo Day](#demo-day) ·
  [Troubleshooting](#troubleshooting) · [Security and privacy](#security-and-privacy)

## Prerequisites

- Node 22.13+ or 24.3+ (root `engines`; development runs on Node 24) and npm
- Xcode with an iPhone simulator runtime (Xcode → Settings → Components) and CocoaPods (`brew install cocoapods`).
  `xcrun simctl list devices available` should list iPhones. Daily development runs on the iOS Simulator.
- Android Studio with a Google Play emulator image (Pixel, API 35, the image that says Google Play) or an Android
  phone with USB debugging. Needed for real push (FCM), the APK and Demo Day.
- An Expo account: `npx expo login`; `npx eas-cli whoami` prints your username
- For the database and Edge Functions: access to the Supabase project «rota» (`wcjklkpkuhxgfdtbwbuk`, eu-central-1)

## Setup

```sh
git clone https://github.com/k4ssymzhomart/caseone.git && cd caseone
npm install                 # postinstall runs tools/patch-native.mjs (see Troubleshooting)
npm run assets              # icons, splash, notification icon and sounds; once, before the first native build
```

Secrets live in `.secrets/` at the repo root. The folder is git ignored; ask the owner for the files.

| File | Keys |
| --- | --- |
| `.secrets/supabase.env` | `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL` and the legacy JWT keys |
| `.secrets/anthropic.env` | `ANTHROPIC_API_KEY`, `LLM_BUDGET_USD=4` |
| `.secrets/telegram.env` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` |
| `.secrets/firebase-adminsdk.json` | FCM V1 service account (uploaded to EAS, never to Supabase) |
| `.secrets/llm-ledger.json` | written by the scripts: every LLM cost, read by the budget guard |

App env files hold public values only (they ship inside the apps). Never put a secret key into an `EXPO_PUBLIC_*` or
`VITE_*` variable.

```sh
cp apps/mobile/.env.example apps/mobile/.env
cp apps/web/.env.example apps/web/.env.local
```

| Purpose | `apps/mobile/.env` | `apps/web/.env.local` |
| --- | --- | --- |
| API mode | `EXPO_PUBLIC_API_MODE=mock` or `supabase` | `VITE_API_MODE=mock` or `supabase` |
| Project URL | `EXPO_PUBLIC_SUPABASE_URL=https://wcjklkpkuhxgfdtbwbuk.supabase.co` | `VITE_SUPABASE_URL` (same) |
| Publishable key | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`SUPABASE_PUBLISHABLE_KEY` from `.secrets/supabase.env`) | `VITE_SUPABASE_PUBLISHABLE_KEY` (same) |
| Demo account chips on the login screen | `EXPO_PUBLIC_DEMO_ACCOUNTS=true` | `VITE_DEMO_ACCOUNTS=true` |
| Optional | `EXPO_PUBLIC_WEB_URL` (web panel link on the admin screen), `EXPO_PUBLIC_TELEGRAM_BOT` (bot username for «Подключить Telegram») | |

## API modes

Both apps talk to one interface, `RotaApi` from `@rota/shared`, and pick the implementation at start.

- `mock`: `MockApi` on this device only, persisted in AsyncStorage or localStorage. The same state machine and errors
  as the database, a simulated AI check 2.5 s after «Исполнено» and a simulated watchdog every 5 s. Two devices do
  not share it. The default, and the mode of the unit tests.
- `supabase`: `SupabaseApi` on the real project with Realtime. Status changes reach the other devices in under 5 s.
  Without a URL or key the apps fall back to `mock` (the web panel logs a warning).

Expo inlines `EXPO_PUBLIC_*` at bundle time and Vite reads `.env.local` at start: restart Metro with a cleared cache
(`npx expo start --dev-client -c` in `apps/mobile`) or the Vite server after a change. The EAS profiles
`development` and `preview` build with `EXPO_PUBLIC_API_MODE=supabase`.

## Run

### Mobile

```sh
npm run ios                 # expo run:ios: builds the dev client into the booted iPhone simulator and starts Metro
npm run android             # the same on an Android emulator or USB phone
npm run dev:mobile          # later sessions: Metro only, for an installed dev client
```

Never Expo Go: notifications, camera and fonts need the development build (package and bundle id `kz.rota.app`,
scheme `rota`). Simulator gaps: no camera (the «после» photo falls back to the library in development), no remote
push, no haptics. Simulate a remote push with:

```sh
xcrun simctl push booted kz.rota.app tools/push/emergency.apns   # or tools/push/order.apns
```

Two devices on one Mac: boot a second simulator (`xcrun simctl boot "iPhone 16"`) and run
`npx expo run:ios --device "iPhone 16"` in `apps/mobile`; both connect to the same Metro. Or use one simulator plus the
web panel as the master.

### Web panel

```sh
npm run dev:web             # http://localhost:5173
npm run build:web           # production build into apps/web/dist
```

After sign in a master lands on `/shift`, the руководитель on `/dashboard`, the admin on `/admin/directories`. Workers
use the mobile app; the panel tells them so and signs them out. `/kit` shows the Rota web components. Hosting: the
Vercel project `caseone` (https://caseone-one.vercel.app) builds every push to `main` from the repository root: the
root `vercel.json` runs `deploy/vercel/ci-build.sh` (landing and panel at `/`, the phone app at `/app/`). Its project
variables hold the public values only: `VITE_API_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_DEMO_ACCOUNTS`, `EXPO_PUBLIC_API_MODE=supabase`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`EXPO_PUBLIC_DEMO_ACCOUNTS`, `EXPO_PUBLIC_TELEGRAM_BOT`. Netlify (`deploy/netlify/deploy.sh`) ships the same build
from a local checkout to https://rota-naryad.netlify.app.

## Database

The schema, RLS, state machine, watchdog, reports, detectors and AI scoring are in `supabase/migrations/` (written and
tested by the architect). On the hackathon project «rota» the migrations are applied; the pieces the Supabase
connector could not run, the test accounts and the history are loaded by hand, in this order, each pasted whole into
Dashboard → SQL Editor → Run:

1. `supabase/manual/rota_remaining.sql`: reference data, the transition engine, the history generator and
   `demo_reset`, the Telegram link token. One transaction; once.
2. `supabase/seed/01_people.sql`: 19 test accounts and the employee directory. Idempotent by tab number.
3. `supabase/seed/02_history.sql`: wipes every order, generates 92 days of history ending yesterday with the planted
   patterns (`tools/seed/PATTERNS.md`), then writes the Demo Day start state. Run it again to rebuild the history
   relative to today.

Check the result the way the apps see it (publishable key only, signs in as 1001):

```sh
npx tsx tools/db-check.ts
# ok   areas         4 (expected 4)
# ok   equipment    25 (expected 25)
# ok   employees    19 (expected 19)
# ok   orders      559 (about 560 after the seed)
# ok   insight    7 cards for 92 days, first: Конвейер К-3 ломается чаще всех
```

The orders count is the whole table: 540 history orders plus the 19 orders of the Demo Day start state make 559, and
every order created since adds one until the next «Сбросить демо». Exit code 2 means the accounts are not there yet
(run steps 1 to 3); 1 means a count or the connection failed.

On a fresh project (a new cloud project or self-hosted Supabase on the plant's servers) run the 13 migrations in order
instead of step 1, then steps 2 and 3, and store `project_url` and `secret_key` in Vault for the cron and pg_net calls.
On the hackathon project never run `supabase db push`, `db reset` or `migration repair` without the owner: the remote
migration history does not match the files (`docs/PHASE_1.md` §2 has the repair commands).

Database changes the apps need go to `docs/db-requests.md` for the architect. Types:
`packages/shared/src/api/database.types.ts` is generated from the live project
(`npx supabase gen types typescript --project-id wcjklkpkuhxgfdtbwbuk --schema public`);
`database.extra.ts` adds what the generator misses and exports `RotaDatabase` for `createClient<RotaDatabase>`.

### Edge Functions

Deployed on «rota»:

| Function | What it does | Auth |
| --- | --- | --- |
| `notify-dispatch` | Expo push and Telegram (no names) for every new notification | secret key, `verify_jwt` off |
| `telegram-webhook` | links a Telegram chat through `/start <token>` | Telegram secret header |
| `ai-verify` | the AI completion check: SQL rules, one Sonnet 5.5 call with the photos, rules only fallback ([README](../supabase/functions/ai-verify/README.md)) | user session or secret key |
| `ai-shift-summary` | 5 to 8 sentences and 3 recommendations from `shift_report` (Sonnet 5.5) | staff session |
| `ai-explain-rating` | three sentences on a worker's rating (Haiku 5.5) | the worker or staff |
| `ai-insights` | ask box: Haiku reads the question, Sonnet writes cards from the detectors, every number checked; weekly digest | staff session or secret key |

AI accuracy: the golden set of 10 cases scores 10 из 10 with Sonnet 5.5 ([results](golden-results.md)).
Acceptance of reports and analytics: [`docs/phase5-acceptance.md`](phase5-acceptance.md),
[`docs/phase6-acceptance.md`](phase6-acceptance.md). Architecture: [`docs/architecture.md`](architecture.md).

Pending database changes for the owner to paste once: [`docs/db-fixes/2026-10-09_apply_all.sql`](db-fixes/2026-10-09_apply_all.sql).

After `npx supabase login`:

```sh
npx tsx tools/gen-edge-env.ts                                                   # builds .secrets/edge.env, prints no values
npx supabase secrets set --env-file .secrets/edge.env --project-ref wcjklkpkuhxgfdtbwbuk
npx supabase functions deploy ai-verify --project-ref wcjklkpkuhxgfdtbwbuk
npx tsx tools/telegram-setup.ts                                                 # one time setWebhook for the bot
```

`LLM_PROVIDER` is `mock` unless set: deterministic, schema valid answers, no cost.

## Test accounts

Sign in with the табельный номер and a 4 digit ПИН. All people are synthetic.

| Табельный номер | ПИН | Role | Who |
| --- | --- | --- | --- |
| 1001 | 1111 | мастер, day shift | Жумабаев Н. (phone A on Demo Day, web panel) |
| 1002 | 2222 | мастер, night shift | Ковалёв А. |
| 2001 | 1234 | исполнитель | Ахметов Е., слесарь 5, brigade 1 leader (phone B, the demo hero) |
| 2002 | 1234 | исполнитель | Иванов С., слесарь 4 (phone C) |
| 2003 to 2015 | 1234 | исполнители | the rest of brigades 1 to 3 |
| 3001 | 3333 | руководитель | Тлеубаев М., главный механик |
| 9001 | 9999 | admin | Садыкова А. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run ios` / `npm run android` | build and run the development client |
| `npm run dev:mobile` | Metro for an installed development client |
| `npm run dev:web` / `npm run build:web` | web panel dev server / production build |
| `npm run tokens` | regenerate the Rota tokens from `packages/design/source/variables.json` |
| `npm run assets` | app icons, splash, notification icon and sounds |
| `npm run typecheck` | TypeScript in every workspace, `tools` and the Edge Function code |
| `npm test` | vitest: `packages/shared`, `packages/design`, `supabase/functions/_shared` and the other projects in `vitest.config.ts` |
| `npm run check` | tokens up to date, typecheck, tests, web build: the gate at the end of every phase |
| `npm run llm:smoke -- --vision` | Haiku 5.5 and Sonnet 5.5 with vision against the JSON schema; capped at 0.02 USD (`--mock` costs nothing) |
| `npm run golden` | the AI check golden set: mock by default, `-- --reference` must be 10 of 10, `-- --live` calls Sonnet (about 0.16 USD a run) |
| `npm run push:test -- <ExponentPushToken[...]> [--emergency]` | a test push through the Expo push service (Android) |
| `npx tsx tools/db-check.ts` | live database check (above) |
| `npx tsx tools/gen-fixtures.ts` | rewrite the `@rota/shared` fixtures from `supabase/seed/directories.json` |
| `npx tsx tools/gen-readme-assets.ts [--only logos,badges,banner,loop,stats,screens,arch,film]` | the README banner, loop strip, number cards, gallery frames, architecture picture, film poster, badges and platform logos in `docs/readme/` (headless Chrome; the poster needs `npm run stills -- out/poster 2.5 47 90 136 --scale=0.5` in `video/` first) |
| `RUN_SUPABASE=1 npx vitest run --project packages/shared src/api/supabase` | the `RotaApi` contract suite against the live project; every scenario starts with `demo_reset()` |

Every LLM call checks the budget first: the account holds 5 USD and `LLM_BUDGET_USD` (default 4) caps the summed cost
in `.secrets/llm-ledger.json` (scripts) or `llm_audit` (Edge Functions).

## Demo Day

The script is CLAUDE.md §20: phones A (master 1001), B (worker 2001, in gloves), C (worker 2002), the web panel on
the laptop with scrcpy mirroring. «Демо» (mobile and web) switches «Демо режим» (the «1 мин» deadline, the tap
counter, the accelerated norm), «Ускорение времени ×10» (only to show an escalation) and «Сбросить демо», which
rebuilds the start state: 9 workers on shift, Ахметов the only free слесарь, 7 active orders, 12 closed this shift.

## Troubleshooting

- **Metro shows stale code or env values:** `cd apps/mobile && npx expo start --dev-client -c`.
- **iOS pods out of date** after adding a native module: `cd apps/mobile && npx pod-install`, then `npm run ios`.
  `apps/mobile/ios` and `apps/mobile/android` are generated (git ignored); `npx expo prebuild --clean` rebuilds them.
- **Xcode 26.3 (Swift 6.2) fails in expo-modules-jsi** with «cannot be annotated with either SWIFT_RETURNS_RETAINED»
  or «sending 'resultPtr' risks causing data races»: the package targets Swift 6.3. `tools/patch-native.mjs` runs on
  every `npm install` and patches it on Swift below 6.3 (drops the annotation from two constructors, builds that
  package in Swift 5 mode with the Swift 6 features it needs). If the error appears, run `node tools/patch-native.mjs`,
  then `npm run ios` again. It is idempotent and does nothing on Swift 6.3 or later.
- **Android build fails after a native change:** `cd apps/mobile/android && ./gradlew clean`, then `npm run android`.
- **`JAVA_HOME` not set or the wrong JDK:**
  `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`.
- **Push sound or importance did not change on Android:** channel settings freeze once a channel exists on a device;
  create a new channel id (`emergency_v2`) or reinstall the app.
- **Sign in says «Неверный табельный номер или ПИН» in supabase mode:** the accounts are missing; run the database
  steps above and `npx tsx tools/db-check.ts`.
- **«Сбросить демо» fails with «UPDATE requires a WHERE clause»:** Supabase's pg-safeupdate blocks the two table wide
  updates in `internal.demo_reset()` when it runs through the API. The fix is in `docs/db-requests.md` and
  `docs/db-fixes/demo_reset_where_true.sql`; run it once in the SQL Editor.
- **Two React copies at runtime:** `npm ls react` must show only `react@19.2.3` (the root `package.json` overrides it).

## Security and privacy

- Login by табельный номер and ПИН; roles come from the JWT (`app_metadata.app_role`) and every table has RLS. All
  order changes go through security definer RPCs; the client never updates `orders` directly.
- Secrets never enter git or the app bundles. The apps carry only the project URL and the publishable key.
- Every LLM request goes through `supabase/functions/_shared/privacy.ts`: names, табельные номера and phones become
  pseudonyms (`E01`, `M01`, `R01`, `A01`), the redacted request is logged in `llm_audit` (web panel `/admin/ai`, «Что видит ИИ»),
  and Telegram messages carry no names. Production runs self-hosted Supabase on the plant's servers or in a KZ cloud
  (Law 94-V), with the LLM behind the gateway or a local model (`LLM_PROVIDER=openai_compatible`).
- Integration with 1С and ТОиР: PostgREST plus the `integration_outbox` table (`order.created`, `order.closed`).
