# Phase 0 · Foundation

Rota for the Qostanai Industry Hackathon 2026, Case 1 «НарядAI» (АО «Костанайские Минералы»).
Owner: Kassymzhomart (`k4ssymzhomart`). Executor: Claude Code. Written 2026-10-08, revision 2 (iOS Simulator, SDK 57 fixes).

One brief for the whole phase. Read `CLAUDE.md` first (product and engineering spec), then this file top to bottom. Work in the order below unless section 3 gives you a parallel lane. Commit at every green step. Stop only at the "Needs you" points in section 9, and keep working on every step that does not depend on them.

---

## 0. Launch

The user starts the session like this:

```sh
cd ~/Downloads/caseone
claude --add-dir ~/Downloads/rota/rota
```

First message: `Read CLAUDE.md and docs/PHASE_0.md. Execute Phase 0 completely.`

`~/Downloads/rota/rota` is the Rota design system repository. It is a read only source: copy from it, never write into it.

**Platforms.** Daily development runs on the **Xcode iOS Simulator** (the user's choice). Android stays the delivery target: the case requires an Android app, the APK is a deliverable, and real remote push is tested on Android (FCM). Expo builds both from one codebase, so every screen must work on both. Where the simulator lacks hardware (camera, haptics, remote push), this brief says what to do instead.

**Backend.** The Supabase project exists (`.secrets/supabase.env`). The architect is applying the Phase 1 database (schema, RLS, state machine, seed) directly to it, in parallel with this phase, and drops the migration files into `supabase/migrations/`. You do not write or run migrations in Phase 0.

---

## 1. What Phase 0 delivers

Phase 0 builds the apps, the design system and the shared domain on a mock API. Phase 1 then swaps the mock for Supabase behind the same interface, and every later phase plugs real data into screens that already exist and already look right.

### Definition of done

All of these must be true at the end:

1. Git repository `k4ssymzhomart/caseone` lives in `~/Downloads/caseone`, no secrets tracked, pushed to `origin main`.
2. npm workspaces monorepo with `apps/mobile`, `apps/web`, `packages/design`, `packages/shared`, `supabase`, `tools`, `docs`. `npm run check` passes: tokens up to date, typecheck of every workspace, tests, web build.
3. `packages/design` regenerates the Rota tokens from Rota's `variables.json` with output identical to Rota's generated files, adds the industrial status colors, exposes a typed theme for React Native and `tokens.css` for the web, and carries the logo and all 24 mascots as data.
4. `packages/shared` holds the domain model, the full transition table of CLAUDE.md §6 with tests, Russian strings, formatters, the directory fixtures of CLAUDE.md §19, the demo start state of §20, and a working `MockApi` (state machine, simulated AI check, simulated watchdog).
5. `apps/mobile` is an Expo development build running on the iOS Simulator, in dark and light: fonts, theme, the full mobile UI kit, the `/kit` gallery, and a screen shell for every route of every role, all driven by `MockApi`. In mock mode one device can take an order from «Выдан» to «Закрыт». It also builds for Android (`npm run android`) once an emulator or phone is available.
6. Notifications foundation: Android channels (orders, emergency with siren, reminders), iOS sounds, permission onboarding, local test notifications that open the right screen, and simulated remote pushes on the iOS Simulator with `xcrun simctl push`. A real remote push over FCM is proven on Android once the Firebase steps (section 9) are done.
7. `apps/web` is a Vite panel with the Rota web components, a sidebar layout, `/kit`, and a shell for every panel page, driven by the same `MockApi`.
8. `supabase/` is initialised (without touching the architect's migrations) with Edge Function skeletons. `_shared/llm.ts` (mock, anthropic and openai_compatible providers, budget guard) and `_shared/privacy.ts` exist with tests. `npm run llm:smoke -- --vision` returns schema-valid JSON from Haiku 5.5 and Sonnet 5.5 for less than 0.02 USD in total.
9. Docs: `README.md` with run instructions, `docs/design.md`, `docs/progress.md`, `docs/decisions.md`, and kit screenshots in both themes in `docs/screenshots/`.

### Out of scope

SQL migrations and RLS (the architect, Phase 1), the seed history generator (Phase 1), Supabase client calls and `SupabaseApi` (Phase 1), the real watchdog and AI check (Phase 4), Telegram (Phase 3), offline mode, QR and voice (step 2). If you notice something these need, write it under Questions in the report.

### Time

About 3 to 3.5 hours with two parallel sessions (section 3), about 5 hours with one.

---

## 2. Context to keep in mind

- **The product.** A master issues наряды from a phone. A worker accepts, queues, rejects, starts, pauses and closes them on a phone. AI watches deadlines, checks every closed order (photos, materials, text, time), rates workers and finds anomalies in the history. Masters, the руководитель and the admin also use a web panel.
- **The jury** (CLAUDE.md §0): live loop on phones 25, AI quality 25, analytics 15, UX for master and worker 15, enterprise fit 10, demo 10. UX is 15 points and the users wear work gloves, so the kit is not decoration.
- **The name.** The product is **Rota** («рота» in Russian, a duty roster in English). The case name «НарядAI» appears only where we cite the case. In UI copy the slogan is «Наряд выдан, ИИ на контроле» (no dash).
- **What later phases need from you:**
  - Phase 1 swaps `MockApi` for `SupabaseApi` behind the same `RotaApi` interface and checks that the SQL transitions match your `transitions.ts`; enum and status names must stay identical to CLAUDE.md §5.
  - Phase 2 fills the shells with real data and realtime.
  - Phase 3 needs the channels, the permission flow and the push token registration.
  - Phase 4 needs `llm.ts`, `privacy.ts`, the verify rules and the report screens.
  - Phases 5 and 6 need the web panel shells, the filter bar and the chart styling.
  - Phase 7 needs the demo screen, the tap counter and the reset hook.

---

## 3. Lanes

Steps 0.1 to 0.3 run in one session (A), about 30 minutes. Then two sessions run in parallel:

| Lane | Steps | Owns |
| --- | --- | --- |
| A: mobile and design | 0.4 → 0.6 → 0.9 → `docs/design.md` → mobile part of 0.11 | `apps/mobile`, `packages/design`, `tools/gen-assets.ts`, `tools/push-test.ts`, `tools/push/`, `docs/design.md`, `docs/screenshots/`, the root `package.json` and `package-lock.json` |
| B: shared, web, backend | 0.5 → 0.8 → 0.7 → 0.10 → web part of 0.11 | `packages/shared`, `apps/web`, `supabase/functions`, the rest of `tools/`, `README.md`, `docs/progress.md`, `docs/decisions.md` |

- **Worktree for lane B.** Lane A runs `git worktree add ../caseone-b -b p0-b`, then `ln -s ~/Downloads/caseone/.secrets ../caseone-b/.secrets`. The `.gitignore` already lists `.secrets` without a slash, which is what makes git ignore the symlink. The user starts the second session with `cd ~/Downloads/caseone-b && claude --add-dir ~/Downloads/rota/rota` and the message `Read CLAUDE.md and docs/PHASE_0.md. You are lane B of Phase 0.`
- **Contract first.** Lane B commits `packages/shared/src/domain/*`, `src/api/RotaApi.ts` and `src/fixtures/*` within its first 30 minutes and tells the user. Lane A builds the kit meanwhile.
- **Merges.** `main` is checked out in lane A's folder, so lane A does the merging: `git merge p0-b` at three points (contracts landed, MockApi done, end of phase). Lane B runs `git merge main` in its worktree before step 0.7 (it needs `@rota/design`) and before `npm run llm:smoke -- --vision` (it needs `app-icon-256.png`).
- **Root files.** Only lane A edits the root `package.json`; lane B asks in its report for any root change. On a `package-lock.json` conflict, take `main`'s copy and run `npm install`.
- **Never edit the other lane's folders.** If you need a change there, write it in your report.
- **One session instead:** run every step in order. Same result, slower.

---

## 4. Inputs

### From the Rota repository (read only)

| Copy from `~/Downloads/rota/rota` | To `~/Downloads/caseone` | Note |
| --- | --- | --- |
| `design/figma/variables.json` | `packages/design/source/variables.json` | Figma export of the Rota tokens, the source of truth |
| `scripts/build-tokens.mjs` | `packages/design/scripts/build-tokens.mjs` | adapt the outputs (step 0.4) |
| `apps/web/src/styles/tokens.css`, `tokens.ts` | compare only | your regenerated files must match |
| `apps/web/src/components/Logo/logo.generated.ts` | `packages/design/src/brand/logo.ts` | logo path data |
| `apps/web/src/components/Mascot/mascots.generated.ts` | `packages/design/src/brand/mascots.ts` | 24 poses, path data by layer role |
| `brand/logo/*.svg` | `packages/design/assets/logo/` | mark red, ink, white; lockups |
| `brand/app-icon/app-icon-1024.png`, `app-icon.svg`, `icon-composer/*.svg` | `packages/design/assets/app-icon/` | |
| `brand/mascots/*.svg`, `brand/mascots/dark/*.svg` | `packages/design/assets/mascots/` | web panel and docs |
| `brand/wallpaper/rota-wallpaper.jpg` | `packages/design/assets/wallpaper.jpg` | web login backdrop |
| `apps/web/src/components/{Button,Controls,Keycap,Logo,Mascot,Hud}` | `apps/web/src/components/rota/` | web kit; fix imports (step 0.7) |
| `apps/web/src/pages/Kit.tsx`, `Kit.module.css` | `apps/web/src/pages/` | adapt (step 0.7) |
| `apps/web/src/styles/global.css` | `apps/web/src/styles/global.css` | adapt fonts (step 0.7) |
| `design/reference/*.png` | `docs/design/reference/` | visual reference |

Read, do not copy: `brand/README.md` (mascot layer colors, which pose where, brand rules), `design/README.md` (token pipeline, fonts, semantic colors), `AGENTS.md` section "Design and copy".

### Figma

File `GLRFuWwhmuXArmiCgHz9Wr` is the Rota design source. Its pages «Design Book» and «Components» belong to another product: never modify them. If you have the Figma tools, you may read them. Hackathon designs, if any, live only on the page «QOSTANAI». If `docs/design/qostanai/*.png` appear in the repo, treat them as the visual target for the shells; otherwise sections 6 and 7 are the target.

### In `~/Downloads/caseone`

- `CLAUDE.md`: the spec.
- `Кейс №1 Костанайские минералы рус.pdf`: the case. Move it in step 0.2.
- `.secrets/` (git ignored): `anthropic.env` (`ANTHROPIC_API_KEY`, `LLM_BUDGET_USD=4`; the account holds 5 USD in total), `supabase.env` (project ref, URL, publishable and secret keys, DB password), `telegram.env` (bot token). Read them when a step needs them; never print their values; never copy them into tracked files.
- `.gitignore`: already written. Keep every line, add to it if needed.
- `supabase/migrations/` and `supabase/seed/`: written by the architect while you work. Do not edit, rename or delete these files, and never run `supabase db push`, `db reset` or `migration repair`. When they appear, commit them as they are in their own commit, `Add database migrations from the architect`.
- Any `uki_*.png` left over from an abandoned idea: move them to `_archive/uki/` (git ignored). Never delete them.

---

## 5. Steps

### 0.1 Preflight (lane A, 10 min)

Run each check and print a table of results:

```sh
node -v                         # ^22.13.0 or ^24.3.0 (Vitest 5 needs 22.12+)
npm -v
git --version
git config user.name; git config user.email
xcodebuild -version             # Xcode for the iOS Simulator
xcrun simctl list devices available | grep -i iphone | head -5
pod --version                   # CocoaPods, used by expo run:ios
watchman --version              # optional
java -version                   # JDK 17, only for Android builds
echo $ANDROID_HOME              # only for Android builds
python3 --version               # Phase 1 seed generator
```

- No CocoaPods: tell the user `brew install cocoapods`.
- No iPhone simulator: Xcode → Settings → Components → install the latest iOS runtime.
- Android tooling is optional today and required before Phase 3 (push) and Phase 7 (APK). If it is missing, add Needs you 1b to the report and move on.
- Never edit the user's shell profile. If an environment variable is missing, give the user the line to add.

### 0.2 Repository bootstrap (lane A, 10 min)

```sh
cd ~/Downloads/caseone
git init -b main
git remote add origin https://github.com/k4ssymzhomart/caseone.git
git fetch origin || true
# If origin/main exists, bring it in: git pull --rebase origin main
```

- Move `Кейс №1 Костанайские минералы рус.pdf` to `docs/case/case1-kostanai-minerals-ru.pdf`.
- `git config user.name` must be `k4ssymzhomart`; set it locally if it differs. Keep the user's email.
- `git status` must show no `.secrets` and nothing from `_archive/`.
- Commit: `Initialize Rota repo with spec and case`.

### 0.3 Monorepo skeleton (lane A, 20 min)

Root `package.json`:

```json
{
  "name": "rota",
  "private": true,
  "description": "Rota: work orders with AI control for Kostanai Minerals. Qostanai Industry Hackathon 2026.",
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": "^22.13.0 || ^24.3.0" },
  "overrides": { "react": "19.2.3", "react-dom": "19.2.3" },
  "scripts": {
    "dev:mobile": "npm run start --workspace apps/mobile",
    "ios": "npm run ios --workspace apps/mobile",
    "android": "npm run android --workspace apps/mobile",
    "dev:web": "npm run dev --workspace apps/web",
    "build:web": "npm run build --workspace apps/web",
    "tokens": "node packages/design/scripts/build-tokens.mjs",
    "assets": "tsx tools/gen-assets.ts",
    "typecheck": "npm run typecheck --workspaces && tsc --noEmit -p tools && tsc --noEmit -p supabase/functions/_shared",
    "test": "vitest run",
    "check": "npm run tokens && test -z \"$(git status --porcelain -- packages/design/src/generated packages/design/web)\" && npm run typecheck && npm test && npm run build:web",
    "llm:smoke": "tsx tools/llm-smoke.ts",
    "push:test": "tsx tools/push-test.ts"
  }
}
```

- React is pinned to the exact version Expo SDK 57 expects (19.2.3 at the time of writing). After step 0.6, confirm with `cd apps/mobile && npx expo install --check`; if Expo wants another exact version, change the override and both apps together.
- Root dev dependencies: `typescript@~6.0.3` (everywhere, the version SDK 57 uses), `@types/node@^22`, `vitest`, `tsx`, `prettier`, `@resvg/resvg-js`, `ajv`.
- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`, `noUnusedParameters`, `moduleResolution: "bundler"`, `module: "esnext"`, `jsx: "react-jsx"`, `skipLibCheck`. TypeScript 6 defaults `types` to `[]`: add `"types": ["node"]` only in configs that need Node (tools, app config).
- Every workspace defines `"typecheck": "tsc --noEmit -p ."`. `tools/tsconfig.json` and `supabase/functions/_shared/tsconfig.json` extend the base with `allowImportingTsExtensions` and `noEmit` (Deno needs `.ts` on relative imports, so `_shared` writes them).
- Workspaces import each other by package name (`@rota/design`, `@rota/shared`), never by relative paths across packages.
- `vitest.config.ts` at the root with `projects` for `packages/shared`, `packages/design` and `supabase/functions/_shared`.
- `.prettierrc` (printWidth 100, singleQuote, trailingComma all), `.editorconfig`, `.nvmrc` with `22`.
- Typecheck is the gate. Lint stays light: the Expo template's ESLint config in `apps/mobile`, nothing heavier.
- Commit: `Add monorepo skeleton`.

### 0.4 `packages/design` (lane A, 40 min)

```
packages/design/
  package.json              see below
  source/variables.json     copied from Rota
  source/tokens.dtcg.json   generated
  scripts/build-tokens.mjs  adapted from Rota
  src/generated/tokens.ts   generated: same content as Rota's tokens.ts
  web/tokens.css            generated: same content as Rota's tokens.css
  src/extensions.ts         industrial status colors (hand written)
  src/typography.ts         mobile type scale (hand written)
  src/theme.ts              Theme type, getTheme(mode)
  src/brand/logo.ts         from Rota logo.generated.ts
  src/brand/mascots.ts      from Rota mascots.generated.ts
  src/brand/mascotColors.ts layer role → color per mode
  src/index.ts
  assets/                   logo, app icon, icon composer layers, mascot svgs, wallpaper
```

`package.json` (the `"."` entry is required, or neither TypeScript nor Vite resolves the package):

```json
{
  "name": "@rota/design",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts", "./web/tokens.css": "./web/tokens.css" },
  "scripts": { "typecheck": "tsc --noEmit -p ." }
}
```

1. Copy the files from section 4.
2. Adapt `build-tokens.mjs`: keep the DTCG, CSS and TypeScript generation; drop the Xcode color sets and Swift outputs; write to `source/tokens.dtcg.json`, `web/tokens.css`, `src/generated/tokens.ts`. Header comment: generated from the Rota `variables.json`, do not edit.
3. Equality check, recorded in the report: `diff packages/design/web/tokens.css ~/Downloads/rota/rota/apps/web/src/styles/tokens.css` and the same for `tokens.ts` show no difference other than the header comment.
4. `src/extensions.ts`, exact values (Apple system colors, which is the family the Rota palette comes from):

   ```ts
   export const statusColors = {
     light: { free: '#34C759', working: '#FFCC00', queue: '#007AFF', off: '#8E8E93', critical: '#FF3B30',
              success: '#34C759', warning: '#FF9500', info: '#007AFF', onWorking: '#1D1D1F' },
     dark:  { free: '#30D158', working: '#FFD60A', queue: '#0A84FF', off: '#98989D', critical: '#FF3B30',
              success: '#30D158', warning: '#FF9F0A', info: '#0A84FF', onWorking: '#1D1D1F' },
   } as const;
   export const softAlpha = { light: 0.16, dark: 0.22 } as const; // pill and badge fills
   ```

5. `src/typography.ts`, the mobile scale (section 6.4) with exact `fontFamily` names per weight, because Android ignores `fontWeight` on custom fonts.
6. `src/theme.ts`: `type ThemeMode = 'dark' | 'light'`; `getTheme(mode)` returns `{ mode, color, status, space, radius, type, shadow, glass }`. `color` holds every semantic token in camelCase (`bgCanvas`, `textSecondary`, `borderDefault`, ...), `status` the extension, `space` and `radius` the Rota scales, `shadow` React Native shadow props for light mode only (dark mode uses surfaces and hairlines, no shadows), `glass` `{ fill, fillStrong, stroke, tint, blurIntensity: 40 }`.
7. `src/brand/mascotColors.ts` follows the table in Rota's `brand/README.md`: `body` red 500, `shade` red 600, `eyes` and `props` white, `ink` and `ledge` ink 900, `marks`, `balls`, `prop` ink 900 in light and white in dark, `propDetail` white in light and black in dark.
8. Tests: every semantic token exists in both modes; no `undefined` in either theme; 24 mascot names.
9. Commit: `Add Rota design tokens, theme and brand data`.

### 0.5 `packages/shared` (lane B, 60 min)

`package.json` like the design package: `"main": "./src/index.ts"`, `"exports": { ".": "./src/index.ts" }`, `"type": "module"`, a `typecheck` script.

```
packages/shared/src/
  index.ts
  domain/enums.ts        role_t, order_type_t, priority_t, status_t, photo_kind_t, verdict_t, reject_t, pause_t
  domain/types.ts        Area, Equipment, Brigade, Employee, FaultCode, Material, WorkNorm, ProblemTemplate,
                         Order, OrderEvent, OrderPhoto, OrderMaterial, AiReview, AppNotification, Settings, views
  domain/status.ts       ru labels, ACTIVE_STATUSES, isOverdue, boardColumn, tones
  domain/transitions.ts  TRANSITIONS, allowedActions, applyAction
  domain/workerStatus.ts deriveWorkerStatus (mirror of v_worker_status)
  domain/reasons.ts      reject and pause reasons with ru labels
  domain/priority.ts     labels, tones, sort order
  domain/templates.ts    notification texts, exactly CLAUDE.md §8
  domain/suggest.ts      suggestAssignees, mirror of §10 (mock only; SQL is authoritative later)
  domain/verifyRules.ts  R1 to R4 of §11 as pure functions
  domain/rating.ts       the §13 formula as a pure function
  i18n/ru.ts, i18n/index.ts      t('key')
  format/time.ts         Asia/Qostanay helpers
  format/number.ts
  fixtures/              areas, equipment, brigades, employees, faultCodes, materials, workNorms,
                         problemTemplates, settings: exactly CLAUDE.md §19
  fixtures/demoState.ts  the §20 start state relative to now, plus 10 to 15 orders closed today
                         and about 40 orders over the last 7 days for lists
  api/RotaApi.ts         the interface below
  api/errors.ts          RotaError and its codes
  api/mock/              MockApi, store, events, ai, watchdog (section 8)
  api/index.ts           createApi({ mode, storage, uuid }) → MockApi now, SupabaseApi in Phase 1
```

Rules:

- Names in `enums.ts` are identical to CLAUDE.md §5, so the SQL and this package agree. Export each union and an array of its values.
- The package is platform free: no React Native, no DOM, no Node. Everything platform specific comes in through `createApi` options: `storage` (AsyncStorage on mobile, localStorage on web, memory in tests) and `uuid` (expo-crypto `randomUUID` on mobile, because Hermes has no `crypto.randomUUID`; `crypto.randomUUID` on the web; `node:crypto` in tests).
- Time: Kazakhstan is UTC+5 all year. `format/time.ts` converts with a fixed +5 h offset and the `getUTC*` getters. Do not rely on `Intl` time zones: Hermes support varies. Helpers: `hhmm(date)`, `formatDuration(min)` → «1 ч 20 мин», `formatLeft(due, now)` → «осталось 24 мин» or «просрочен на 12 мин», `shiftOf(date)` → day 08:00 to 20:00 or night.

The interface:

```ts
export interface RotaApi {
  auth: {
    signIn(tabNo: string, pin: string): Promise<Session>;
    signOut(): Promise<void>;
    session(): Promise<Session | null>;
    onChange(cb: (s: Session | null) => void): Unsubscribe;
  };
  directories: { get(): Promise<Directories> };
  orders: {
    list(filter?: OrderFilter): Promise<OrderView[]>;
    get(id: number): Promise<OrderDetail>;
    create(input: CreateOrderInput, clientActionId: string): Promise<Order>;
    action(id: number, action: OrderAction, payload: ActionPayload, clientActionId: string): Promise<Order>;
    suggestAssignees(equipmentId: number, specialty?: string, exclude?: string): Promise<AssigneeSuggestion[]>;
  };
  workers: {
    statuses(): Promise<WorkerStatusView[]>;
    setOnShift(employeeId: string, onShift: boolean): Promise<void>;
  };
  photos: { upload(input: PhotoUploadInput): Promise<OrderPhoto>; url(path: string): Promise<string> };
  ai: {
    verify(orderId: number): Promise<AiReview>;
    review(orderId: number): Promise<AiReview | null>;
    insights(input: InsightsInput): Promise<Insight[]>;
    shiftSummary(input: ShiftReportInput): Promise<ShiftSummary>;
    explainRating(employeeId: string, period: Period): Promise<string>;
  };
  reports: {
    shift(input: ShiftReportInput): Promise<ShiftReport>;
    rating(period: Period, filters?: ReportFilters): Promise<RatingRow[]>;
  };
  notifications: {
    list(): Promise<AppNotification[]>;
    markRead(id: number): Promise<void>;
    registerPushToken(input: PushTokenInput): Promise<void>;
  };
  realtime: {
    subscribe(topic: 'orders' | 'notifications' | 'workers' | 'reviews', cb: (e: RealtimeEvent) => void): Unsubscribe;
  };
  demo: { reset(): Promise<void>; settings(): Promise<Settings>; updateSettings(patch: Partial<Settings>): Promise<Settings> };
}
```

`RotaError` codes: `FORBIDDEN`, `BAD_TRANSITION`, `MISSING_REASON`, `ANOTHER_IN_PROGRESS`, `NOT_ON_SHIFT`, `BAD_INPUT`, `BUDGET_EXCEEDED`, `NETWORK`, `UNKNOWN`, each with a Russian message in `i18n/ru.ts`. The mock follows every rule in CLAUDE.md §6, including the block «Details that the SQL and `transitions.ts` share», and the templates and titles of §8.

Tests (vitest):

- every row of the CLAUDE.md §6 table: allowed `from` statuses reach `to`; any other `from` throws `BAD_TRANSITION`; wrong actor throws `FORBIDDEN`; missing reason throws `MISSING_REASON`; `start` with another order in progress throws `ANOTHER_IN_PROGRESS` unless `pause_current`
- `allowedActions` per status and role (worker sees only own orders' actions)
- `boardColumn`: rejected goes to «Выданы», paused and rework to «В работе», overdue active orders to «Просрочены»
- `deriveWorkerStatus`: free, working, queue, off
- `verifyRules`: no after photo on an unplanned order fails R1; 6 bearings against max 2 fails R3; demo mode scales the norm in R4
- templates print exactly the strings of CLAUDE.md §8
- formatters: «1 ч 20 мин», «просрочен на 12 мин», day and night shift boundaries

Commit in two steps: `Add shared domain, fixtures and API contract` (tell the user so lane A merges it), then `Add MockApi`.

### 0.6 `apps/mobile` (lane A, 2 h)

#### Create

```sh
npx create-expo-app@latest apps/mobile --template default@sdk-57 --no-install
npm install
cd apps/mobile && npx expo install --check
```

- Pin the template to SDK 57 as written: Expo 58 is on the `next` tag and may become `latest` during the hackathon.
- Name the package `@rota/mobile`. Remove the template's example screens, components, hooks, constants and images.
- **Routes live in `apps/mobile/src/app/`**, where the SDK 57 template puts them. Expo CLI uses `src/app` whenever it exists, so a root `app/` folder would be silently ignored.
- Scripts in `apps/mobile/package.json`: `"start": "expo start --dev-client"`, `"ios": "expo run:ios"`, `"android": "expo run:android"`, `"typecheck": "tsc --noEmit -p ."`.
- Fold `app.json` into `app.config.ts` (below) and delete `app.json`. Drop the template's `adaptiveIcon.backgroundImage` and `monochromeImage` (they point at deleted files and prebuild fails with ENOENT). Keep `expo-system-ui` (Android needs it for `userInterfaceStyle`), `expo-status-bar` and `react-native-worklets`.
- This app runs as a **development build**, never in Expo Go: notifications, the camera and the custom fonts need native modules.
- Expo configures Metro for npm workspaces by itself. Touch `metro.config.js` only if a workspace package fails to resolve, and record why.
- Record the SDK version and the React version in `docs/decisions.md`.

#### Dependencies

Install with `npx expo install` so the versions match the SDK:

`expo-router` (from the template), `expo-dev-client`, `expo-notifications`, `expo-device`, `expo-constants`, `expo-camera`, `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`, `expo-crypto`, `expo-haptics`, `expo-blur`, `expo-audio`, `expo-font`, `expo-splash-screen`, `expo-linking`, `react-native-svg`, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-screens`, `@react-native-async-storage/async-storage`, `@expo-google-fonts/inter`, `@expo-google-fonts/geist-mono`.

With npm: `@tanstack/react-query`, `zustand`. Workspace: `@rota/design`, `@rota/shared`.

#### App config

`apps/mobile/app.config.ts`:

```ts
/// <reference types="node" />
import type { ExpoConfig } from 'expo/config';
import fs from 'node:fs';

const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const hasGoogleServices = fs.existsSync(googleServicesFile);

const config: ExpoConfig = {
  name: 'Rota',
  slug: 'rota-qostanai',
  scheme: 'rota',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  android: {
    package: 'kz.rota.app',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#000000' },
    ...(hasGoogleServices ? { googleServicesFile } : {}),
    permissions: ['CAMERA', 'POST_NOTIFICATIONS', 'VIBRATE'],
  },
  ios: { bundleIdentifier: 'kz.rota.app', supportsTablet: false },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-audio',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#000000' }],
    ['expo-notifications', {
      icon: './assets/notification-icon.png',
      color: '#FF3B30',
      sounds: ['./assets/sounds/siren.wav', './assets/sounds/ding.wav'],
    }],
    ['expo-camera', { cameraPermission: 'Rota снимает фото до и после ремонта.' }],
    ['expo-image-picker', {
      cameraPermission: 'Rota снимает фото до и после ремонта.',
      photosPermission: 'Rota прикрепляет фото неисправности к наряду.',
    }],
  ],
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: undefined } }, // step 0.9 writes the real id here
};

export default config;
```

Keep any other setting the template adds that this block does not mention, as long as it points at files that exist.

#### Assets (`tools/gen-assets.ts`)

Run `npm run assets` **before the first native build**: Android notification channels cannot change after creation, and a missing sound file silently falls back to the default sound. It renders with `@resvg/resvg-js` and writes PCM WAV files by hand, no other dependency:

| Output | How |
| --- | --- |
| `apps/mobile/assets/icon.png` | copy of Rota `app-icon-1024.png` |
| `apps/mobile/assets/adaptive-icon.png` | `icon-composer/mark.svg` at 60% of a transparent 1024 canvas, centered |
| `apps/mobile/assets/notification-icon.png` | `rota-mark-white.svg`, white on transparent, 96 × 96 |
| `apps/mobile/assets/splash-icon.png` | `rota-mark-red.svg`, 512 × 512 transparent |
| `packages/design/assets/app-icon/app-icon-256.png` | the app icon at 256, for the vision smoke test |
| `apps/mobile/assets/sounds/siren.wav` | 2.0 s, 44.1 kHz, 16 bit mono; 960 Hz and 770 Hz alternating every 250 ms; amplitude 0.7 with soft clipping; loops without a click |
| `apps/mobile/assets/sounds/ding.wav` | 0.35 s, 1320 Hz sine with an exponential decay |

#### Fonts, theme and providers

- Root layout loads Inter 400, 500, 600, 700 and Geist Mono 400, 500 with `useFonts` and holds the splash screen until they are ready.
- `ThemeProvider`: mode `'system' | 'dark' | 'light'`, stored in AsyncStorage under `rota.theme`, default `'dark'`. It resolves `'system'` with `useColorScheme`, exposes `useTheme()`, and sets the status bar style.
- Providers in the root layout: `GestureHandlerRootView`, `SafeAreaProvider`, `ThemeProvider`, `QueryClientProvider`, `ApiProvider` (`createApi({ mode: process.env.EXPO_PUBLIC_API_MODE ?? 'mock', storage: AsyncStorage, uuid: Crypto.randomUUID })`), `HudProvider`, notification listeners.

#### UI kit

Build the components of section 6.9 in `apps/mobile/src/ui/`, one file each, all styling from `useTheme()`. No hard coded colors, sizes or radii.

#### Routes

Build every route of section 7.1 with `expo-router` in `src/app/`. The root `index.tsx` redirects by session: no session → `/(auth)/login`; worker → `/(worker)`; master → `/(master)`; manager → `/(manager)`; admin → `/admin`.

#### Simulator realities

- **Camera.** The iOS Simulator has no camera. When `!Device.isDevice`, the «после» photo opens the photo library, records `source: 'gallery'` and shows a small dev banner «Симулятор: фото из галереи». On real devices the camera stays mandatory for «после». Drag a few photos into the simulator first (a pump with and without an oil stain works for the walkthrough).
- **Haptics** do nothing on the simulator. That is expected.
- **Blur.** iOS uses `BlurView`. Android uses solid `glass.fillStrong` by default: real blur there needs `blurMethod` plus a `BlurTargetView` around the content, which is not worth it today.
- **Remote push** needs APNs, so it cannot reach the iOS Simulator for real. Step 0.9 simulates it with `xcrun simctl push`.

#### Photo pipeline (`src/lib/photo.ts`)

Built now so Phase 2 only adds the upload. Use the SDK 57 APIs; the older calls are deprecated or gone:

- Capture: `ImagePicker.launchCameraAsync({ quality: 1, exif: true })` for «после» (camera only on devices), `launchImageLibraryAsync({ mediaTypes: ['images'], exif: true, quality: 1 })` for «до» and for the simulator fallback. Record `source: 'camera' | 'gallery'`.
- Compress: `ImageManipulator.manipulate(uri).resize(...)` with the long side at 1600 (resize by width for landscape, by height for portrait; skip it for smaller images), then `.renderAsync()` and `saveAsync({ format: SaveFormat.JPEG, compress: 0.7 })`. `manipulateAsync` is deprecated.
- Hash: `const bytes = await new File(out.uri).bytes()` (expo-file-system `File`, the default API since SDK 54), then `Crypto.digest(CryptoDigestAlgorithm.SHA256, bytes)` to hex. dHash (9 × 8 PNG with `base64: true`, decoded by `upng-js`) comes in Phase 2.
- Time: EXIF `DateTimeOriginal` is the camera's local time without a zone («2026:10:09 10:42:13»). Use `OffsetTimeOriginal` when present, otherwise read it as UTC+5. No EXIF: the moment the picker returned.
- Output: `{ uri, width, height, bytes, sha256, source, capturedAt, exif }`. `MockApi.photos.upload` stores it as is.

#### Notifications foundation (`src/lib/notifications.ts`)

- Handler: show the banner, play the sound, no badge.
- Android channels, created at startup:

  | Channel | Importance | Sound | Vibration | Use |
  | --- | --- | --- | --- | --- |
  | `orders` | HIGH | `ding.wav` | `[0, 250, 150, 250]` | new orders, reports |
  | `emergency` | MAX | `siren.wav` | `[0, 600, 200, 600, 200, 600]` | emergency orders; `enableLights: true` with light color `#FF3B30`; ask for bypass DND |
  | `reminders` | DEFAULT | default | default | reminders, overdue, rework |

  Channel settings are frozen once created on a device. If a sound or importance must change later, create a new channel id (`emergency_v2`) instead of editing the old one.
- iOS: local notifications set `sound: 'siren.wav'` or `'ding.wav'` in the content; the files are bundled by the config plugin.
- Category `order_actions` with two actions, «Принять» (`accept`) and «Открыть» (`open`), both `opensAppToForeground: true`.
- `requestPermission()` is called from the onboarding screen only.
- `registerPushToken()` calls `getExpoPushTokenAsync({ projectId })` with `Constants.expoConfig?.extra?.eas?.projectId`, inside try/catch: without a projectId, without `google-services.json` on Android, or on the simulator without APNs, it fails. Failure is quiet: the profile shows «Push пока не настроен».
- Response listener: `accept` calls `api.orders.action(id, 'accept', …)` and then opens `/order/[id]`; `open` or a tap opens the URL. Read the URL from `data.url`, falling back to `data.body.url` (Expo puts push data under `body` on iOS).
- Cold start: handle a notification that launched the app with `useLastNotificationResponse()`.
- Test buttons on `/demo` and `/kit`: «Тест: обычный наряд» and «Тест: аварийный наряд». They schedule local notifications (Android channel, iOS sound) with a URL pointing at a mock order. Both work on the simulator.

#### Emergency screen

- Full screen, red background (`status.critical`).
- Siren loops through `expo-audio` (`loop` on the player) and a heavy haptic repeats every 1.5 s, until the worker taps «Принять» or «Отклонить».
- It opens three ways: from a notification tap; from the in-app realtime event when the app is in the foreground; and whenever a worker signs in or brings the app to the foreground while one of their emergency orders is still «Выдан».

#### Haptics

| Moment | Haptic |
| --- | --- |
| Primary button | light impact |
| Accept and start | medium impact |
| AI verdict arrives | success or error notification |
| Emergency | heavy impact, repeating |
| Wrong PIN | error notification |

#### Run it

`npm run ios` (`expo run:ios`) builds the dev client and opens it in the iOS Simulator. Next time `npm run dev:mobile` is enough unless native config changed. `npm run android` does the same on an Android emulator or a USB phone when one is available.

#### Acceptance

- The app starts on «Вход» in dark mode with Inter and Geist Mono rendering.
- `/kit` shows every component in both themes.
- Every route opens with mock data.
- The local emergency test notification plays the siren and opens the red screen.
- The mock walkthrough of step 0.11 completes.

### 0.7 `apps/web` (lane B, 60 min)

Run `git merge main` first: you need `@rota/design`.

> Landing: `/` is the public landing page (`docs/LANDING.md`, lane C). If `apps/web` already exists when you get here, skip `npm create vite` and the setup bullets it already covers, add the panel layout and routes next to the landing, and leave `src/landing/` alone.

- `npm create vite@latest apps/web -- --template react-ts`, package name `@rota/web`. Then set `react` and `react-dom` in `apps/web/package.json` to exactly `19.2.3` (create-vite writes a caret range; two Reacts in one repo break at runtime) and TypeScript to `~6.0.3`. Check with `npm ls react`: one version only.
- The web build runs `tsc -b` over the shared sources too, so they must pass `verbatimModuleSyntax`, `erasableSyntaxOnly` and the unused checks.
- Copy the Rota web components (section 4) into `src/components/rota/`, keep their CSS modules, and import the logo and mascot data from `@rota/design`.
- `src/styles/global.css` from Rota, importing `@rota/design/web/tokens.css`. Add `@fontsource/inter` and `@fontsource/geist-mono`. Keep Rota's font stack (SF on Macs) and put `"Inter"` before `system-ui` for other systems.
- Theme: dark by default through `data-theme="dark"` on `<html>`. A toggle in the top bar stores the choice in `localStorage`, inside try/catch.
- Layout:
  - left sidebar in the Rota Settings window style: text only nav items, the active row filled with the accent tint (see `docs/design/reference/settings.png`)
  - top bar with the Lockup, the `FilterBar` (period presets and filters; a shell now), the user chip and the theme toggle
- Routes (react-router): `/login`, `/shift`, `/board`, `/orders/:id`, `/reports/shift`, `/reports/rating`, `/analytics`, `/dashboard`, `/equipment/:id`, `/admin/directories`, `/admin/settings`, `/admin/ai`, `/demo`, `/kit`. Shells as in section 7.2, all fed by `MockApi` from `@rota/shared` with `localStorage` persistence and `crypto.randomUUID`.
- Install `recharts` now and style one chart on `/reports/rating` with tokens. `pdfmake` and `exceljs` come in Phase 5.
- `npm run build:web` must be clean.

### 0.8 Supabase skeleton, LLM client, privacy (lane B, 60 min)

`npx supabase init` at the repo root. The architect may already have created `supabase/migrations/`; `init` must not touch those files. If `supabase/config.toml` already exists, skip `init`.

`supabase/functions/_shared/` holds environment-agnostic TypeScript: `fetch` only, no Deno and no Node globals, config passed in, explicit `.ts` extensions on relative imports. The same files then run in Edge Functions and in Node scripts and tests.

| File | Content |
| --- | --- |
| `cors.ts` | `corsHeaders`, `handleOptions(req)` |
| `pricing.ts` | USD per million tokens: `claude-sonnet-5-5` in 2 / out 10; `claude-haiku-5-5` in 0.10 / out 0.50 (the price list says "from", treat as an estimate). `estimateCost(model, usage)` |
| `schemas.ts` | JSON schemas: `verify` (CLAUDE.md §11), `insights` (§15 cards), `shiftSummary` (`{ summary, recommendations[] }`), `explainRating` (`{ text }`), `parseQuery` (`{ area_id, from, to, focus[] }`), `smoke` (`{ ok, echo }`). Every object has `additionalProperties: false` and lists all its keys in `required`. No `minimum`, `maximum`, `minLength` or similar: structured outputs reject them with a 400 |
| `prompts.ts` | Russian system prompts per purpose; `verify` lists the case 6.3 criteria |
| `llm.ts` | `createLlm(config)` (below) |
| `privacy.ts` | `buildDirectory`, `redact`, `rehydrate` (below) |

`llm.ts`, `createLlm(config)` with three providers:

- **mock**: deterministic, schema-valid answers per purpose (`verify`, `insights`, `shift_summary`, `explain_rating`, `parse_query`, `smoke`). This is the default everywhere in development.
- **anthropic**:
  - request: POST `https://api.anthropic.com/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`; body `model`, `max_tokens`, `system`, `messages`, `output_config: { effort: 'low', format: { type: 'json_schema', schema } }`
  - Sonnet 5.5 also gets `thinking: { type: 'between_tools' }`. Haiku 5.5 gets no `thinking` field. Never send `temperature`, `top_p` or `top_k`.
  - images go in as content parts `{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }`
  - response: take the `text` block (thinking blocks may come first) and `JSON.parse` it; return `{ data, usage, model, latencyMs, costUsd }`
  - timeout 45 s with `AbortController`; no retries (callers decide)
- **openai_compatible**: POST `{LLM_BASE_URL}/chat/completions` with a JSON schema response format. A stub for an on-prem model, untested in Phase 0.

Budget guard: the caller passes `spentUsd()`. If `spent + estimate > LLM_BUDGET_USD`, the call throws `BUDGET_EXCEEDED`. Edge Functions read the spend from `llm_audit` (Phase 4). Scripts read a local ledger, `.secrets/llm-ledger.json`.

`privacy.ts`:

- `buildDirectory(employees)` builds the patterns. `redact(value)` walks strings and objects; `rehydrate(value)` maps pseudonyms back to short names.
- What gets replaced: surnames with Russian and Kazakh case endings (`Ахметов`, `Ахметова`, `Ахметову`, `Ахметовым`, `Ахметове`), «Ахметов Е.», «Ерлан Ахметов» and «Ахметов Ерлан», directory tab numbers, phone numbers.
- What it becomes: workers `E01`…`E15`, masters `M01`, `M02`, manager `R01`, admin `A01`.
- Names that are not in the directory stay as they are.

Edge entry `functions/llm-smoke/index.ts`: `Deno.serve`, CORS, provider from env, returns the smoke JSON.

`tools/llm-smoke.ts` (Node through tsx):

- loads `.secrets/anthropic.env` with a tiny parser, no dependency; never prints the key
- calls Haiku 5.5 with the `smoke` schema and the prompt «Ответь JSON: ok true, echo «Рота готова»», then prints the data, usage and cost
- with `--vision` (run `git merge main` first for `app-icon-256.png`), also calls Sonnet 5.5 with that image, asking for `{ ok, echo }` where `echo` names the mark's color
- appends each cost to the ledger; the total must stay at or under 0.02 USD

Tests (ajv for schemas):

- mock outputs validate against their schemas
- every schema object has `additionalProperties: false` and no unsupported keywords
- the anthropic request builder sends no sampling parameters, sends `between_tools` only to Sonnet, sets `effort: 'low'` and includes the schema
- the budget guard throws when over
- `privacy`: every case ending, «Ахметов Е.», first name plus surname in both orders, tab numbers; a sentence without directory names comes back unchanged; `rehydrate(redact(x))` restores the short names

Commit: `Add Supabase skeleton, LLM client and privacy gateway`.

### 0.9 Notification and push proof (lane A, 30 min plus the user's steps)

#### On the iOS Simulator (no accounts needed)

1. Write two payload files in `tools/push/`: `order.apns` and `emergency.apns`. Each has `"Simulator Target Bundle": "kz.rota.app"`, an `aps` block (alert title and body in Russian, `sound` `ding.wav` or `siren.wav`, `category` `order_actions`) and the URL both at the top level and under `body` (`"url": "/emergency/demo"`).
2. With the app running, `xcrun simctl push booted kz.rota.app tools/push/emergency.apns`. The banner shows the «Принять» and «Открыть» actions; a tap opens the red screen with the siren. Repeat with the app killed to prove the cold start path.

#### On Android (needs Needs you 1b, 2 and 3)

1. `cd apps/mobile && npx eas-cli@latest init --non-interactive --force`. With a dynamic `app.config.ts` it prints the projectId and exits non-zero by design. Put that id into `extra.eas.projectId`; it is not a secret, so commit it.
2. `eas.json` with three profiles:

   | Profile | Settings |
   | --- | --- |
   | `development` | `developmentClient: true`, `distribution: internal`, `android.buildType: apk` |
   | `preview` | `distribution: internal`, `android.buildType: apk` |
   | `production` | defaults |

3. The user puts `google-services.json` into `apps/mobile/`. It is git ignored; `app.config.ts` picks it up when present.
4. `npm run android` rebuilds the dev client on the emulator or phone.
5. The profile screen shows the Expo push token with a copy button. Then:
   - `npm run push:test -- <token> --emergency` posts to `https://exp.host/--/api/v2/push/send` with `channelId: 'emergency'`, `categoryId: 'order_actions'`, `priority: 'high'` and `data.url: '/emergency/demo'`. The notification arrives with the siren; a tap opens the red screen.
   - `npm run push:test -- <token>` sends a normal one on `orders`.
6. If Android or Firebase is still missing at the end of the phase, mark the Android half «blocked» in `docs/progress.md` and move on. The simulator proof and the local notifications already cover channels, categories and routing.

Real remote push to an iPhone would need an APNs key from the paid Apple Developer Program. It is not part of the plan.

### 0.10 Docs (lane B, 20 min)

- `README.md`:
  - what Rota is in two lines, with a link to the case PDF
  - stack and prerequisites: Node 22, Xcode with an iPhone simulator and CocoaPods, Android Studio with a Google Play emulator (for push and the APK), Expo account
  - setup: `npm install`, `.secrets`, env files
  - run the mobile app (`npm run ios` or `npm run android`, then `npm run dev:mobile`) and the web panel (`npm run dev:web`)
  - API modes: `EXPO_PUBLIC_API_MODE` and `VITE_API_MODE`, `mock` or `supabase`
  - test accounts table from CLAUDE.md §19, scripts table
  - troubleshooting: `npx expo start -c`, `npx pod-install`, Gradle clean, `JAVA_HOME`
  - the deliverables list from CLAUDE.md §23
- `docs/progress.md`: status table P0 to P7 and a dated log.
- `docs/decisions.md`, newest first:
  - React Native with Expo instead of a PWA: the user's choice, native feel, simulator development, allowed by the case
  - iOS Simulator for daily work, Android for push tests and the APK
  - the Rota design system reused, with Rota as the read only source
  - no icon packs
  - Inter as the SF Pro stand-in on Android
  - dark by default, full light theme
  - mock API first
  - LLM budget guard at 4 USD
  - development builds, not Expo Go; SDK 57 pinned
  - push through Expo over FCM V1
  - the web panel as a separate Vite app
  - the architect applies Phase 1 migrations directly to Supabase

Lane A writes `docs/design.md`: section 6 of this brief as the living design doc, plus the kit screenshots.

### 0.11 Verify, screenshots, report (both lanes, 20 min)

Run each and show the result:

- `npm run check`
- `npm run llm:smoke -- --vision` (cost printed)
- `npm run ios`, then the walkthrough below

Mock walkthrough on the iOS Simulator:

1. Sign in as 1001 / 1111 (master). Create an emergency order for «Насос НШ-32 маслостанции»; the assignee is preselected as Ахметов Е.
2. Sign out, then sign in as 2001 / 1234. The red screen opens by itself for the pending emergency.
3. «Принять» → «Начать» → «Исполнено». Fill the closing form with works text over 20 characters («Заменил уплотнительное кольцо крышки, подтянул болты»), Г-01, 2 уплотнительных кольца, and a photo from the library.
4. «ИИ проверяет» shows, then the report says «Принято».
5. Sign out, then sign in as the master. Open the report and tap «Согласен, закрыть»; the status becomes «Закрыт».
6. Repeat with no photo and 6 bearings on the К-2 order (Иванов, 2002). The verdict is «Требует доработки» with both reasons.

Screenshots with `xcrun simctl io booted screenshot docs/screenshots/<name>.png` (on Android: `adb exec-out screencap -p > docs/screenshots/<name>.png`):

- login, worker queue, order detail, closing form, AI report, emergency
- master shift, board, create
- kit in dark, kit in light

Web screenshots are optional.

Then push `main` to `origin`, and write the report (section 11).

---

## 6. Rota Industrial: the design system for this app

Rota's language, made for gloves, sunlight and night shifts. Dark canvas, red as the signal, inverse pills as actions, mono for numbers, mascots for feelings. Never decoration on dense screens.

### 6.1 Sources

Tokens come from `@rota/design`. Visual references: `docs/design/reference/*.png` (Rota onboarding, settings, hero) and Rota's web kit page. When this section and the Rota references disagree, this section wins for the hackathon app.

### 6.2 Modes

- Dark by default (the Rota look, best on mirrored phones). Full light theme for sunlight; «Как в системе» as a third option in the profile.
- Text contrast at least 4.5:1 in both modes.
- Status is never color alone: always a dot plus a word.

### 6.3 Color usage

| Token | Use |
| --- | --- |
| `bgCanvas` | screen background |
| `bgSubtle` | cards, list groups, fields |
| `bgMuted` | pressed states, segmented track, stepper buttons |
| `bgElevated` | sheets and the emergency card in dark |
| `bgInverse` + `textInverse` | primary buttons, selected chips |
| `bgAccent` (red 500) | critical only: emergency, overdue, rework, destructive confirm, switch on, focus ring |
| `textPrimary`, `textSecondary`, `textDisabled` | text levels |
| `borderDefault`, `borderStrong` | hairlines, field borders, keycap edges |
| `glass*` | tab bar, HUD capsule, sheet header |
| `status.free` · `working` · `queue` · `off` | worker states (case 5.2.1: green, yellow, blue, gray) |
| `status.success` · `warning` · `critical` · `info` | AI verdicts: accepted, with remarks, rework, needs master review |

Priority: emergency → critical; high → warning; normal → no color; planned → info.

### 6.4 Type (mobile)

Inter stands in for SF Pro on Android, which the Rota rules require for interface text. SF Pro cannot be bundled. Geist Mono comes from Rota.

| Variant | Family per weight | Size / line | Letter spacing | Use |
| --- | --- | --- | --- | --- |
| `largeTitle` | Inter_700Bold | 34 / 40 | −0.68 | root tab titles |
| `title1` | Inter_700Bold | 28 / 34 | −0.56 | screen titles, emergency |
| `title2` | Inter_600SemiBold | 22 / 28 | −0.33 | sections, empty states |
| `headline` | Inter_600SemiBold | 19 / 24 | −0.19 | card titles (equipment) |
| `bodyL` | Inter_400Regular | 19 / 28 | −0.1 | worker screens body |
| `body` | Inter_400Regular | 17 / 24 | −0.03 | master screens body |
| `callout` | Inter_400Regular | 15 / 20 | 0 | subtitles, chips |
| `footnote` | Inter_400Regular | 13 / 18 | 0 | captions, tab labels |
| `buttonL` | Inter_600SemiBold | 18 / 22 | −0.09 | 64 px buttons |
| `buttonM` | Inter_600SemiBold | 16 / 20 | −0.08 | 52 px buttons |
| `monoDisplay` | GeistMono_500Medium | 48 / 56 | −0.96 | AI score |
| `monoL` | GeistMono_500Medium | 20 / 28 | 0 | order numbers, timers, counters |
| `monoM` | GeistMono_400Regular | 15 / 20 | 0 | codes (М-02), times in lists |
| `monoCaps` | GeistMono_500Medium | 12 / 16 | 0.72, uppercase | eyebrows: «№147 · АВАРИЙНЫЙ · ДО 11:30» |

### 6.5 Space and layout

- Screen gutters 16. Rota's 4 pt spacing scale only.
- List groups inset 16. Rows at least 64 high on worker screens, 56 on master screens.
- Section gaps 24 to 32.
- The bottom action bar sits in the thumb zone, with 16 padding plus the safe area.

### 6.6 Shape

| Radius | Use |
| --- | --- |
| `md` 12 | cards, list groups, fields, photo tiles |
| `lg` 24 | sheets, the emergency card |
| `full` | buttons, pills, tags, chips, segmented controls |

Hairline borders (`StyleSheet.hairlineWidth`) on dense lists.

### 6.7 Elevation and glass

- Dark mode: no shadows, only surfaces and hairlines.
- Light mode: `shadow-soft` for floating elements only.
- Glass only for the tab bar, the HUD capsule and sheet headers. iOS: `BlurView` with intensity 40 plus a `glass.fill` overlay. Android: solid `glass.fillStrong` (real blur there needs `blurMethod` and a `BlurTargetView`; skip it).

### 6.8 Motion and haptics

- Press: scale 0.98 for 120 ms. Springs (reanimated) for sheets and the HUD.
- Respect reduce motion.
- Haptics as in step 0.6.

### 6.9 Mobile kit (`apps/mobile/src/ui/`)

| Component | Spec |
| --- | --- |
| `T` | text with `variant` (6.4) and `tone` (primary, secondary, critical, inverse) |
| `Screen` | safe area, canvas background, optional large title with an eyebrow above it, scroll or static |
| `Button` | variants: `primary` (inverse pill), `secondary` (`bgMuted` with a hairline), `ghost` (text secondary), `danger` (red fill, white text), `onDanger` (white pill, red 700 text, for the emergency screen), `ghostOnDanger`. Sizes: L 64 (padding 24, buttonL), M 52 (padding 20, buttonM), S 40 (padding 16). `full`, `loading`, `disabled` (opacity 0.4); pressed scale 0.98 with opacity 0.92 |
| `Pill` | dot plus label; tones free, working, queue, off, success, warning, critical, info, neutral; height 28; fill at the soft alpha |
| `Tag` | mono caps capsule with a hairline border (Rota Layout Tag), height 22; fault codes, priority, «ИИ» |
| `StatusDot` | 10 px circle in a status tone |
| `Avatar` | initials circle, 40 px, `bgMuted`, footnote semibold («АЕ») |
| `Switch` | Rota capsule, red when on, 51 × 31 |
| `Checkbox` | 24 px box, red when checked, inside a 56 px row |
| `ListGroup`, `ListRow` | Rota Settings Row: title, optional subtitle, right accessory (value, chevron ›, `Switch`, `Pill`); hairline separators inset 16; radius md |
| `Card` | `bgSubtle`, radius md, hairline in light |
| `OrderCard` | 4 px priority bar on the left; eyebrow «№147 · ВНЕПЛАНОВЫЙ»; equipment as headline; «Участок обогащения · Течь масла» as callout secondary; time left in `monoL`, red when overdue; bottom row with a status `Pill` and a name (assignee for the master, master for the worker); min height 112 |
| `Counter` | `monoL` number with a footnote label; turns critical when the value is bad |
| `Segmented` | height 40, `bgMuted` track, selected segment `bgElevated` in dark and white with the thumb shadow in light; label plus a mono count |
| `Chip` | selectable, height 48, padding 16; unselected `bgSubtle` with a hairline, selected inverse; the critical variant fills red when selected («Аварийный») |
| `Stepper` | − value +, 48 px round buttons on `bgMuted`, value in `monoL` |
| `TextField`, `TextArea` | label (footnote secondary) above; min height 56 (area 120); `bgSubtle`, radius md, hairline; red focus border |
| `PhotoTile` | 104 px tiles: an add tile with a dashed `borderStrong` border and «Снять фото»; thumbnails with a «✕» capsule; up to 5 |
| `Keypad`, `Keycap` | 3 × 4 grid, keys about 104 × 72; Rota keycap: `bgControl`, `borderStrong`, a 2 px darker base line at the bottom instead of a shadow; digits in title1; «Стереть» and «Далее» as text keys, «Далее» inverse |
| `PinDots` | 4 dots of 14 px; filled `textPrimary`, empty `borderStrong`; shake and error haptic on a wrong PIN |
| `Sheet` | expo-router `formSheet` routes with an `ActionList` inside (64 px selectable rows). On Android a form sheet has no native header and no nested stack, and `flex: 1` inside breaks fit to contents: give the content its own header row and a natural height. If a sheet misbehaves on Android, present it as `modal` there |
| `HudToast`, `useHud()` | Rota HUD: glass capsule 44 high, LogoMark 16 + text (mono for numbers) + optional divider and action; above the tab bar; hides after 2.5 s («№147 · В работе») |
| `Banner` | inline row in warning or critical tone («Без фото после ИИ может вернуть наряд») |
| `EmptyState` | mascot 140, title2, callout secondary, optional secondary button |
| `Mascot` | react-native-svg: viewBox 240, translate dx dy, one path per layer colored by `mascotColors[mode]`; fades in at scale 0.9 to 1 |
| `LogoMark`, `Lockup` | from `@rota/design` brand data; the mark is always red |
| `Eyebrow` | monoCaps, text secondary |
| `ScoreBadge` | `monoDisplay` score, «из 100», verdict `Pill` |
| `CheckRow` | a glyph in a 24 px tinted circle (✓ success, ! warning, ✕ critical, … info), title, message |
| `Timeline` | time in `monoM`, dot, actor and action |
| `TapCounter` | demo only: mono capsule at top right, «5 нажатий · 0:38» |
| `TabBar` | glass, 64 high plus the safe area, text labels only; active label in `textPrimary` with a 4 px red dot above, inactive in `textSecondary`; the master's middle item «Выдать» is an inverse pill |

### 6.10 Glyphs, no icon packs

Rota uses no icon sets: no Lucide, no SF Symbols, no emoji. Use text labels, brand images (the mark and the mascots) and only these glyphs: `› ‹ → ← ↑ ↓ ✓ ✕ + − · • ● ○ … №`. Digits on the PIN keypad are fine; Rota's rule against letter keycaps is about letters.

If a screen seems to need an icon, it needs a better label. If the user later approves a functional icon set for camera, mic and QR, it gets added in one place.

### 6.11 Mascots

Use them only on empty, success, error, waiting and onboarding screens, at 96 to 160 px, one per screen, always next to a title. Never on dense operational lists.

| Pose | Where |
| --- | --- |
| `wave` | login greeting |
| `key` | PIN entry |
| `mail` | notification permission onboarding |
| `peek` | empty queue, empty board column |
| `wrench` | order in progress, settings |
| `search` | «ИИ проверяет наряд» |
| `check`, `cheer` | AI accepted, order closed |
| `oops`, `dizzy` | rework, errors |
| `tired` | overdue |
| `sleep` | off shift |
| `juggle` | a queue of several orders |
| `point` | the AI suggestion card |
| `swap`, `flip` | reassignment |
| `carry` | materials |
| `read` | reports |
| `shield`, `shh` | privacy, «Что видит ИИ» |
| `globe` | language switch |
| `download` | export |

### 6.12 Copy (Russian)

- Sentence case. Short. No emoji. No hyphens or dashes in copy, including time ranges: write «с 08:00 до 20:00», not a dash range. Codes like «М-02» are data and keep theirs.
- Numbers as digits. Time «до 11:30»; durations «1 ч 20 мин»; «просрочен на 12 мин»; the order number with №.
- Buttons are verbs: «Принять», «В очередь», «Отклонить», «Начать», «Приостановить», «Продолжить», «Исполнено», «Отправить на проверку», «Выдать», «Согласен, закрыть», «Изменить оценку», «Вернуть на доработку».

### 6.13 Gloves

- Targets at least 56; primary actions 64, full width, at the bottom.
- Destructive actions go through a confirm sheet.
- No action is swipe only or long press only.
- At least 8 between targets.

---

## 7. Screen shells

Every shell is built from the kit, filled from `MockApi`, and has working navigation. Actions call `MockApi` for real, so the state changes. Phase 1 swaps the API, not the screens.

### 7.1 Mobile routes (`apps/mobile/src/app/`)

| Route | Role | What it shows |
| --- | --- | --- |
| `_layout.tsx` | all | providers, fonts, splash, theme, notification listeners, HUD |
| `index.tsx` | all | redirect by session |
| `(auth)/login.tsx` | all | Lockup, mascot `wave`, «Табельный номер» then «ПИН», `Keypad`, `PinDots`; error with `oops`; in mock mode demo chips: «Мастер 1001», «Ахметов 2001», «Иванов 2002», «Главный механик 3001» |
| `(auth)/onboarding.tsx` | all | mascot `mail`, «Включите уведомления», «Новые наряды приходят со звуком. Аварийные требуют ответа.»; «Включить», «Позже»; step dots like Rota onboarding |
| `(worker)/_layout.tsx` | worker | tabs «Наряды», «Закрытые», «Профиль» |
| `(worker)/index.tsx` | worker | large title «Мои наряды», eyebrow «СМЕНА · ДЕНЬ · С 08:00 ДО 20:00»; «На смене» switch row; sections «Аварийные», «В работе», «Очередь» of `OrderCard`; empty state `peek` «Пока нарядов нет» |
| `(worker)/closed.tsx` | worker | closed orders with score and verdict (case 5.3.4) |
| `(worker)/profile.tsx` | worker | rating summary with five component bars and «Из чего сложился рейтинг»; push status pill and token; «Подключить Telegram» (disabled until Phase 3); theme; «Выйти» |
| `(master)/_layout.tsx` | master | tabs «Смена», «Доска», «Выдать» (opens `/create`), «Профиль» |
| `(master)/index.tsx` | master | large title «Смена», eyebrow «ДЕНЬ · С 08:00 ДО 20:00»; four `Counter`s (выдано, выполнено, просрочено, в простое); workers grouped by state with `StatusDot`, `Avatar`, «Свободен», «Выполняет наряд №147», «В очереди 2», «Не на смене»; tap → `/worker/[id]` sheet |
| `(master)/board.tsx` | master | `Segmented` columns with counts (Выданы, Приняты, В очереди, В работе, Выполнены, Просрочены) over an `OrderCard` list; filter chips row (участок, оборудование, исполнитель, приоритет) |
| `(master)/profile.tsx` | master | like the worker profile without the rating; links to `/demo` and `/kit` |
| `(manager)/_layout.tsx`, `index.tsx`, `profile.tsx` | manager | «Сводка»: counters and the top 5 problem units from mock data; a note that full analytics live in the web panel |
| `order/[id]/index.tsx` | worker, master | eyebrow and title; info `ListGroup` (участок, оборудование, приоритет, срок, мастер or исполнитель, описание, комментарий); «До» photos; `Timeline`; sticky action bar from `allowedActions`: issued → «Принять в работу», «В очередь», «Отклонить»; accepted → «Начать исполнение»; in_progress → «Исполнено», «Приостановить»; paused → «Продолжить»; rework → reasons card with `oops` and «Начать доработку». The master sees «Переназначить», «Приоритет», «Отменить», and for closed orders «Отчёт ИИ» |
| `order/[id]/reason.tsx` | worker | `formSheet` with `?type=reject|pause`: `ActionList` of reasons from `reasons.ts`; «Другое» opens a text field; confirm button |
| `order/[id]/close.tsx` | worker | sections «Что сделано» (`TextArea` with quick phrase chips), «Шифр неисправности» (`Segmented` М Э Г П С, then rows with code in `monoM` and name), «Материалы» (rows with `Stepper`, «Добавить материал» search sheet), «Фото после» (`PhotoTile`; camera on devices, library on the simulator), «Комментарий»; `Banner` when an unplanned order has no photo; «Отправить на проверку» opens a confirm sheet if the photo is missing |
| `order/[id]/review.tsx` | worker, master | while checking: mascot `search`, «ИИ проверяет наряд», four checks ticking. Worker view: `ScoreBadge`, «Что хорошо», «Что улучшить», «Время: 1 ч 20 мин при нормативе 1 ч 30 мин», mascot `cheer` or `oops`. Master view: verdict, score, confidence, `CheckRow` list, before and after photos side by side, materials against the norm, timeline, «Согласен, закрыть», «Изменить оценку», «Вернуть на доработку» |
| `create.tsx` | master | modal per CLAUDE.md §10b: preset chips (Аварийный, Внеплановый, Плановый), recent equipment chips with area chips above, problem chips, AI suggestion card (`Avatar`, name, reasons line, `Tag` «ИИ», mascot `point` at 64 px), «Другой исполнитель», deadline pill «2 ч · до 11:30», `PhotoTile`, collapsed comment, «Выдать» 64 px; `TapCounter` in demo mode |
| `emergency/[id].tsx` | worker | full screen red: eyebrow «№148 · ДО 11:30», title «Аварийный наряд», equipment, area, description, photo; «Принять» (`onDanger`), «Отклонить» (`ghostOnDanger`); siren and haptics |
| `worker/[id].tsx` | master | `formSheet`: the worker's current and queued orders |
| `equipment/[id].tsx` | master | equipment history: orders, events, total downtime |
| `demo.tsx` | master, admin | rows: «Демо режим» switch, «Ускорение времени ×10» switch, «Сбросить демо» (danger, confirm), «Тест: обычный наряд», «Тест: аварийный наряд», «Что видит ИИ» link (web) |
| `kit.tsx` | all, from profile | tokens (swatches in both modes), type scale, every component in every state, all 24 mascots, logo and lockup, HUD states; a theme switch at the top |
| `admin.tsx` | admin | «Администратор работает в веб панели» with the panel address, links to `/kit` and `/demo` |

### 7.2 Web panel pages (`apps/web`)

| Page | What it shows |
| --- | --- |
| `/login` | wallpaper backdrop, glass card with the Lockup, табельный номер and ПИН fields, demo account chips in mock mode |
| `/shift` | counters row, workers grid by state, live orders list |
| `/board` | kanban: six columns by the CLAUDE.md §6 map, glass cards, filter chips |
| `/orders/:id` | the master report layout: timeline, photos, materials, AI checks, actions |
| `/reports/shift` | `FilterBar`, KPI tiles, tables (workload, downtime, overdue, rejections with reasons), AI summary placeholder with mascot `read`, «Скачать PDF» and «Скачать Excel» disabled until Phase 5 |
| `/reports/rating` | table with components plus a recharts stacked bar chart; workers and brigades tabs |
| `/analytics` | insight cards (severity, text, recommendation, «Доказательства»), ask box; mascot `search` while loading |
| `/dashboard` | the case's tiles: наряды в работе, просрочки, среднее время реакции и выполнения, простой оборудования, топ 5 проблемного оборудования, лучшие исполнители |
| `/equipment/:id` | unit history |
| `/admin/directories` | read only tables for every directory in Phase 0 |
| `/admin/settings` | watchdog thresholds as Settings Rows |
| `/admin/ai` | «Что видит ИИ»: redacted payload viewer with mascot `shield` |
| `/demo` | the same controls as mobile |
| `/kit` | the Rota web kit plus status pills and the industrial cards |

---

## 8. MockApi

- **Store.** Seeded on first use and on `demo.reset()` from the fixtures plus `demoState(now)`. Persisted through the injected storage, so a reload keeps the state; reset clears it. Ids from the injected `uuid`.
- **Auth.** `signIn` checks the tab number and PIN against the fixtures. A session holds `{ employeeId, role, shortName, tabNo }`.
- **Orders.** `create` and `action` go through `applyAction` from `transitions.ts`, with the same validation and errors as the real backend. They append events, generate notifications with `templates.ts` (new_order, emergency, rework, review_ready), and emit realtime events.
- **AI check.**
  - After `complete`, a 2.5 s delay, then `verifyRules` (R1 to R4) plus a mock judgement: `full` when works text is over 20 characters, photo score 4 when an after photo exists.
  - It builds an `AiReview` with its checks, applies `ai_result`, and emits the review and the notifications.
  - So the demo cases behave as in production: no photo or 6 bearings gives rework; a good closure gives accepted.
- **Watchdog.** Every 5 s it creates reminder and overdue notifications for active orders, with the same keys and dedupe as CLAUDE.md §9, so the overdue UI can be tested.
- **Latency and errors.** Calls take 150 to 300 ms. An error injection flag supports tests.
- **Limit.** The mock lives on one device. Two simulators do not share it; that is Phase 1's job with Supabase Realtime.

---

## 9. Needs you

Give the user these numbered steps when you reach them. Keep working on everything else meanwhile.

1. **Xcode and the simulator.** Xcode installed, an iPhone simulator runtime installed (Xcode → Settings → Components), CocoaPods (`brew install cocoapods`). `xcrun simctl list devices available` should list iPhones.
   - **1b. Android, before Phase 3.** Android Studio → Device Manager → a Pixel 8 with an API 35 image that says **Google Play**, or an Android phone with USB debugging. You should see the Play Store icon on the emulator home screen.
2. **Expo account.** Run `npx expo login` (create a free account at expo.dev if needed). `npx eas-cli whoami` should print your username.
3. **Firebase for Android push.** The project `rotacase1` is the right one.
   1. console.firebase.google.com → rotacase1 → «Add app» → Android → package `kz.rota.app` → download `google-services.json` → put it in `~/Downloads/caseone/apps/mobile/`.
   2. Project settings → Service accounts → «Generate new private key» → save it as `~/Downloads/caseone/.secrets/firebase-adminsdk.json`.
   3. `cd apps/mobile && npx eas-cli credentials` → Android → development → Google Service Account → «Manage your Google Service Account Key for Push Notifications (FCM V1)» → upload that file. Do it again for production.
4. **GitHub.** Make sure `git push` to `k4ssymzhomart/caseone` works (`gh auth login` or your credential helper).
5. **Supabase: done.** Keys are in `.secrets/supabase.env`; the architect is building the database.
6. **Telegram: done.** The token is in `.secrets/telegram.env`.
7. **Demo phones.** Two or three Android phones with developer mode and USB debugging on (scrcpy mirroring), and the APK installed in Phase 7.

---

## 10. Guardrails

- Never write into `~/Downloads/rota`. Never modify the Rota pages in Figma.
- Never commit `.secrets`, `google-services.json`, service account keys or `.env` files. Never print a secret's value. Never put a key into an `EXPO_PUBLIC_*` or `VITE_*` variable: those ship inside the app. (The Supabase publishable key and URL are public by design and may go into `.env` files.)
- `LLM_PROVIDER=mock` everywhere by default. Only `llm:smoke` and explicitly marked tests call Anthropic, and they check the ledger first. The account holds 5 USD.
- Supabase: do not write migrations and do not run `supabase db push`, `db reset`, `migration repair` or `link --password` without the user's yes. The architect owns the database in this phase.
- Dependencies: only the ones in this brief. Anything else goes into the report with a reason before you add it.
- No icon packs, no emoji, the copy rules of 6.12.
- Commits: author `k4ssymzhomart`, no Co-Authored-By trailer, small commits with imperative subjects. Pushing `main` to `origin` at the end of the phase is approved for this repository.
- When a step is blocked on the user, say so once, then continue with the next step that is not blocked.

---

## 11. Report

End the phase, and every stop for help, with:

```text
Phase 0, Foundation: done | blocked
Lane: A | B | single
Changed: 3 to 8 bullets
Checks: each command and its result (npm run check, llm:smoke cost, token diff, walkthrough steps)
Screenshots: list of files in docs/screenshots
Needs you: numbered steps from section 9 that are still open, or nothing
Questions: each with your recommendation
Next: Phase 1 (SupabaseApi on the database the architect built)
```

Update `docs/progress.md` (status table and log) before you report.
