# Rota — engineering spec for Claude Code

Product: **Rota**. Case: Qostanai Industry Hackathon 2026, Кейс 1 «НарядAI: интеллектуальная система выдачи и контроля нарядов».
Customer: АО «Костанайские Минералы» (chrysotile open pit + processing plant, Житикара, ~2 000 workers in 2 shifts).
Slogan: «Наряд выдан, ИИ на контроле» (UI copy uses no dashes). Demo Day: 16.10.2026, live on 2 or 3 Android phones, a fixed script of about 7 min. Code may change until Demo Day.

Read this whole file before writing code. Phase briefs live in `docs/PHASE_N.md`; the current phase and its status are in `docs/progress.md`.
If this file and your instincts disagree, follow this file. If this file and the case PDF (`docs/case/`) disagree, the case wins: stop and flag it.

---

## 0. What wins (scoring, case §12)

| Criterion | Points |
|---|---|
| MVP works live on phones: full order loop | 25 |
| AI quality: deadline control, completion check, photo analysis, accuracy of conclusions | 25 |
| Analytics: reports, rating, anomalies found, recommendations | 15 |
| UX for master and worker: speed, simplicity, large elements | 15 |
| Enterprise fit: data security, scalability, integration | 10 |
| Presentation and demo | 10 |

Rules that follow from this:
1. Reliability of the live loop beats feature count. Every phase ends with a working build.
2. AI verdicts are explainable and reproducible: deterministic rules decide hard failures, the LLM adds judgement, the master has the final word.
3. The demo script (case §11, section 20 below) is the acceptance test. It must be repeatable with one reset button.

## 1. Non-negotiables (case §9)

- Android app built with Expo (React Native), installed as an APK on the demo phones; iOS is a plus. Masters, the руководитель and the admin also get a web panel in the browser.
- Push notifications to the phone: Expo push service over FCM V1 as primary channel, Telegram bot as second channel.
- Status updates reach other devices in ≤5 s (Supabase Realtime, target <1 s).
- Russian UI (Kazakh later via i18n). Large buttons usable in work gloves.
- Login by табельный номер + ПИН. Each role sees only its own functions (RLS + route guards).
- Photos compressed on device; upload ≤10 s on mobile network.
- Repo with run instructions (README).
- Personal data of employees never goes to external services without pseudonymization (privacy gateway, section 16). The hackathon runs on synthetic people only, so nothing real leaves; production runs self-hosted Supabase (open source) on the plant's servers or in a KZ cloud (Law 94-V), with the LLM behind the gateway or replaced by a local model.
- AI decisions are recommendations; the master decides.
- Architecture ready for 1С / ERP / ТОиР integration (REST via PostgREST + outbox table + documented mapping).

## 2. Stack

Mobile (`apps/mobile`):
- Expo SDK 57 (React Native 0.86, React 19.2.3 exact), TypeScript ~6.0.3 strict, expo-router with the routes in `apps/mobile/src/app/`. Created with `--template default@sdk-57`; SDK 58 sits on the `next` tag, so do not upgrade during the hackathon.
- Development builds only, never Expo Go (notifications, camera and fonts need native modules); package and bundle id `kz.rota.app`, scheme `rota`
- Daily development runs on the Xcode iOS Simulator (`npm run ios` = `expo run:ios`). Android (a Google Play emulator or USB phones, `npm run android`) is for FCM push tests, the APK and Demo Day. Simulator gaps: no camera (the «после» photo falls back to the library when `!Device.isDevice`, development only), no remote push (simulate it with `xcrun simctl push`, section 8), no haptics.
- expo-notifications, expo-device, expo-constants, expo-camera, expo-image-picker, expo-image-manipulator, expo-file-system, expo-crypto, expo-haptics, expo-blur, expo-audio, expo-font, expo-splash-screen, expo-dev-client
- react-native-svg, react-native-reanimated, react-native-gesture-handler, react-native-safe-area-context, react-native-screens
- @tanstack/react-query, zustand, @react-native-async-storage/async-storage
- From Phase 1: @supabase/supabase-js with AsyncStorage session storage and react-native-url-polyfill
- Fonts: Inter (stand-in for SF Pro, which cannot be bundled) and Geist Mono, via @expo-google-fonts

Web panel (`apps/web`):
- Vite + React 19.2.3 (exactly the mobile app's version: the root `package.json` overrides `react` and `react-dom`, and `npm ls react` shows one version) + TypeScript + CSS modules with the Rota `tokens.css`
- The Rota web components (Button, Controls, Keycap, Logo, Mascot, Hud) copied from the Rota repo
- react-router, @tanstack/react-query, recharts; pdfmake (Cyrillic via default Roboto vfs) and exceljs from Phase 5; @supabase/supabase-js from Phase 1
- Hosting: Vercel

Shared packages:
- `@rota/design`: Rota tokens generated from Rota's `variables.json`, the industrial status extension, the React Native theme, the logo and the 24 mascots as data
- `@rota/shared`: domain enums and types, statuses, the transition table, reasons, notification templates, verify rules, rating formula, Russian strings, formatters, directory fixtures, the demo state, the `RotaApi` interface, `MockApi` (Phase 0) and `SupabaseApi` (Phase 1+)

Backend:
- Supabase Cloud for the hackathon: project «rota» `wcjklkpkuhxgfdtbwbuk`, `https://wcjklkpkuhxgfdtbwbuk.supabase.co`, region eu-central-1 (the ref and URL are public; keys live in `.secrets/supabase.env`)
- Postgres 17, Auth, Realtime (postgres_changes), Storage (private bucket `photos`)
- Edge Functions (Deno, TypeScript); every function handles OPTIONS and returns CORS headers via `_shared/cors.ts`
- Supabase Cron (pg_cron, sub-minute schedules supported) + pg_net triggers instead of dashboard Database Webhooks (the new secret keys go in the `apikey` header and must not be stored in plain text), Vault for the project URL and the secret key
- API keys: new projects use publishable (`sb_publishable_…`) and secret (`sb_secret_…`) keys, which are not JWTs. Apps use the publishable key. Functions called by signed-in users keep `verify_jwt` on (the user's access token is a JWT). Functions called by cron, pg_net, Database Webhooks or Telegram set `verify_jwt = false` and check the `apikey` header (secret key) or the Telegram secret header in code.

AI:
- Anthropic Claude API, always through `supabase/functions/_shared/llm.ts`, which uses `fetch` only so it runs in Edge Functions, Node scripts and tests alike
- `claude-sonnet-5-5`: verification with vision, insight cards, shift summary
- `claude-haiku-5-5`: query parsing, short explanations
- Never send `temperature`, `top_p` or `top_k`: Sonnet 5.5 returns 400 on any non-default value, Haiku 5.5 on almost any.
- Sonnet 5.5 calls: `thinking: { type: "between_tools" }` (its lowest setting; `"disabled"` returns 400) + `output_config: { effort: "low", format: { type: "json_schema", schema } }`.
- Haiku 5.5 calls: no `thinking` field (adaptive by default) + `output_config: { effort: "low", format: … }`.
- Responses can start with thinking blocks: read the text block that holds the JSON. Timeout 45 s.
- Providers: `mock` (default in development; deterministic schema-valid answers), `anthropic`, `openai_compatible` (on-prem model).
- Budget guard: the account holds 5 USD. `LLM_BUDGET_USD` (default 4) caps the summed cost from `llm_audit` (a local ledger in scripts); over the cap the call throws `BUDGET_EXCEEDED` and the caller falls back to rules only.

Push:
- Mobile gets an Expo push token (`getExpoPushTokenAsync({ projectId })`) and stores it in `push_tokens`.
- `notify-dispatch` posts to `https://exp.host/--/api/v2/push/send`. FCM V1 credentials are uploaded to EAS; `google-services.json` sits in `apps/mobile` (git ignored).

The history generator runs inside the database (`internal.generate_history()`, section 19). Python (numpy, pandas, scikit-learn) only comes back in step 2 for forecasting.

## 3. Repo layout

```
caseone/                         github.com/k4ssymzhomart/caseone
  CLAUDE.md  README.md  package.json (npm workspaces)  tsconfig.base.json  vitest.config.ts  .gitignore
  .secrets/                      git ignored: anthropic.env, supabase.env, telegram.env, firebase-adminsdk.json, llm-ledger.json
  apps/mobile/                   Expo app
    src/app/                     expo-router routes (PHASE_0 §7.1); a root app/ folder would be ignored
    src/ui/                      Rota mobile kit (PHASE_0 §6.9)
    src/features/                auth, worker, master, manager, orders, review, create, notifications, demo
    src/lib/                     api provider, notifications, photo (exif, compress, dhash, upload), voice (step 2), haptics
    assets/                      icon, adaptive icon, notification icon, splash, sounds (siren.wav, ding.wav)
    app.config.ts  eas.json
  apps/web/                      Vite panel
    src/components/rota/         Rota web kit
    src/features/                shift, board, orders, reports, analytics, dashboard, equipment, admin, demo
    src/pages/Kit.tsx
  packages/design/               tokens (generated), theme, extensions, typography, brand data, assets
  packages/shared/               domain, i18n, format, fixtures, api (RotaApi, MockApi, SupabaseApi)
  supabase/
    migrations/                  20261008100001_rota_extensions.sql … 100012_rota_cron.sql, written by the architect
    functions/
      _shared/ cors.ts llm.ts privacy.ts pricing.ts prompts.ts schemas.ts db.ts push.ts telegram.ts
      llm-smoke/  notify-dispatch/  ai-verify/  ai-shift-summary/  ai-insights/  ai-explain-rating/
      telegram-webhook/  demo-reset/ (optional: storage cleanup; the reset itself is the SQL RPC)
    seed/                        01_people.sql  02_history.sql  directories.json (the dataset is a deliverable)
    tests/                       SQL acceptance scripts, transitions.json
  tools/
    gen-assets.ts  llm-smoke.ts  push-test.ts  gen-fixtures.ts  db-check.ts
    push/ order.apns  emergency.apns     simulated remote pushes for the iOS Simulator
    seed/ PATTERNS.md                    the answer key for the planted patterns
  docs/ PHASE_0.md …  progress.md  design.md  decisions.md  case/  design/reference/  screenshots/
```

## 4. Conventions

- Design: the Rota design system, adapted for the plant in `docs/design.md` (from PHASE_0 §6). Summary:
  - dark canvas by default, with a full light theme
  - red `#FF3B30` is the brand and the critical color (emergency, overdue, rework)
  - primary buttons are inverse pills (white on dark, ink on light)
  - Inter plus Geist Mono for numbers, codes, timers and mono caps eyebrows
  - radii from tokens (12 cards, 24 sheets, full pills); glass only for the tab bar, HUD capsule and sheets
  - mascots only on empty, success, error, waiting and onboarding screens
- No icon packs: text labels, brand images (mark, mascots) and the glyph allowlist `› ‹ → ← ↑ ↓ ✓ ✕ + − · • ● ○ … №`.
- Colors, type, spacing and radii come from `@rota/design`. No hard coded values.
- Toolchain: Node ^22.13.0 or ^24.3.0 (root `engines`), TypeScript ~6.0.3 in every workspace, React 19.2.3 exactly in both apps.
- Status colors (extension tokens, Apple system colors): free green, working yellow, queue blue, off gray, critical red. Status is never color alone: a dot plus a word.
- UI copy in Russian, sentence case, short. No emoji. No hyphens or dashes in UI copy: rephrase instead. Fault codes like «М-02» are data and keep their hyphen.
- Glove mode: primary buttons 64 px tall and full width at the bottom; min tap target 56; worker body text 19 px; at least 8 between targets; destructive actions open a confirm sheet; nothing is swipe only or long press only.
- Every string goes through `t('key')` from `packages/shared/src/i18n/ru.ts`.
- Store `timestamptz` UTC; display in Asia/Qostanay (UTC+5 all year, fixed offset; do not rely on Intl time zones in Hermes).
- Server time is the only clock for statuses. Never write client timestamps into status fields.
- Every order mutation goes through RPC `create_order` or `order_action`. The client never updates `orders` directly.
- Every RPC call carries `client_action_id uuid` for idempotency (enables offline outbox in step 2).
- `~/Downloads/rota` (the Rota design system repo) is read only. The Rota pages of Figma file `GLRFuWwhmuXArmiCgHz9Wr` are never modified; hackathon designs live only on the page «QOSTANAI».
- Secrets never enter git and never enter `EXPO_PUBLIC_*` or `VITE_*` variables (those ship inside the apps).
- Commits: author `k4ssymzhomart` only, no Co-Authored-By trailer, small commits with imperative subjects. Pushing `main` to `origin` at the end of each phase is approved for this repository.

## 5. Data model (case §8: 8 entities + directories)

Turn this into migrations; keep the names. `packages/shared/src/domain/enums.ts` uses the same names.

```sql
create type role_t        as enum ('master','worker','manager','admin');
create type order_type_t  as enum ('planned','unplanned');
create type priority_t    as enum ('emergency','high','normal','planned');
create type status_t      as enum ('issued','accepted','queued','rejected','in_progress','paused',
                                   'done','ai_review','rework','closed','cancelled');
create type photo_kind_t  as enum ('before','after');
create type verdict_t     as enum ('accepted','accepted_with_remarks','rework');
create type reject_t      as enum ('no_materials','no_permit','busy_emergency','equipment_running','other');
create type pause_t       as enum ('waiting_parts','waiting_stop','waiting_permit','other');

-- directories
areas(id smallint pk, code text unique, name text, sort int)
equipment(id int pk, area_id smallint fk, name text, inventory_no text, type text,
          criticality char(1) check (criticality in ('A','B','C')), qr_token text unique, is_stopped bool default false)
brigades(id smallint pk, name text, leader_id uuid null)
employees(id uuid pk references auth.users, tab_no text unique, full_name text, short_name text,
          pseudonym text unique, role role_t, specialty text null, grade smallint null,
          brigade_id smallint null, shift text null check (shift in ('day','night')),
          on_shift bool default false, telegram_chat_id bigint null, created_at timestamptz default now())
fault_codes(code text pk, grp char(1) check (grp in ('М','Э','Г','П','С')), name text, specialty text)
materials(id int pk, sku text, name text, unit text, unit_cost_kzt numeric)
work_norms(fault_code text pk fk, norm_hours numeric, typical jsonb)  -- the only place norms live; typical = [{material_id, qty, qty_max}]
equipment_type_specialty(type text pk, specialty text)
problem_templates(id int pk, equipment_type text, label text, suggested_fault_code text)  -- description chips per equipment type
settings(key text pk, value jsonb)

-- core
orders(
  id bigint generated always as identity pk,
  number int unique not null default nextval('order_number_seq'),   -- shown as №
  client_ref uuid unique not null,                                   -- draft id used for photo paths
  type order_type_t not null, priority priority_t not null,
  description text not null, comment text null,
  area_id smallint not null, equipment_id int not null,
  assignee_id uuid not null, brigade_id smallint null,              -- brigade order: assignee = brigade leader
  master_id uuid not null,
  status status_t not null default 'issued',
  due_at timestamptz not null, norm_hours numeric,
  equipment_stopped bool default false,
  suggested_fault_code text null,
  queue_position int null,
  works_done text, fault_code text null references fault_codes, closing_comment text,
  created_at timestamptz default now(), issued_at timestamptz default now(),
  accepted_at, queued_at, rejected_at, started_at, done_at, closed_at, cancelled_at timestamptz,
  paused_since timestamptz null, paused_total_sec int default 0,
  last_comment text, rework_count int default 0,
  ai_review_id bigint null, final_verdict verdict_t null, final_score int null,
  repeat_of_order_id bigint null,
  is_demo bool default false
)
order_events(id bigserial pk, order_id bigint fk, actor_id uuid null,   -- null = system or AI
             action text, from_status status_t, to_status status_t, reason text, comment text,
             payload jsonb default '{}', client_action_id uuid unique null, created_at timestamptz default now())
order_photos(id bigserial pk, order_id bigint null fk, client_ref uuid, kind photo_kind_t,
             storage_path text, author_id uuid, source text check (source in ('camera','gallery')),
             captured_at timestamptz null, uploaded_at timestamptz default now(),
             dhash char(16), sha256 char(64), width int, height int, bytes int, exif jsonb)
order_materials(id bigserial pk, order_id bigint fk, material_id int fk, qty numeric)
ai_reviews(id bigserial pk, order_id bigint fk, attempt int, verdict verdict_t, score int, score5 smallint,
           confidence numeric, needs_master_review bool, checks jsonb, photo jsonb,
           feedback_worker jsonb, report_master jsonb, model text, latency_ms int,
           created_at timestamptz default now(),
           master_verdict verdict_t null, master_score int null, master_comment text null,
           master_id uuid null, master_decided_at timestamptz null,
           unique (order_id, attempt))

-- infrastructure
notifications(id bigserial pk, recipient_id uuid, order_id bigint null, kind text, severity text,
              title text, body text, url text, dedupe_key text,
              created_at timestamptz default now(), read_at, push_sent_at, tg_sent_at timestamptz,
              unique (recipient_id, dedupe_key))                  -- one key may go to several people
push_tokens(id bigserial pk, employee_id uuid, expo_token text unique, platform text, device_name text,
            created_at timestamptz default now(), last_seen_at timestamptz)
ai_insights(id bigserial pk, created_at timestamptz default now(), scope jsonb, kind text, severity text,
            title text, body text, recommendation text, evidence jsonb)
llm_audit(id bigserial pk, created_at timestamptz default now(), purpose text, model text,
          request_redacted jsonb, response_redacted jsonb, latency_ms int, cost_usd numeric)
integration_outbox(id bigserial pk, created_at timestamptz default now(), topic text, payload jsonb, sent_at timestamptz)
tg_link_tokens(token text pk, employee_id uuid, expires_at timestamptz)
```

- Every child table (order_events, order_photos, order_materials, ai_reviews, notifications) references orders with `on delete cascade`.
- Notifications are inserted with `on conflict (recipient_id, dedupe_key) do nothing`.
- Indexes: `orders(status)`, `orders(assignee_id, status)`, `orders(equipment_id, created_at)`, partial index on `orders(due_at)` for active statuses, `order_events(order_id, created_at)`, `order_photos(dhash)`.
- Realtime publication: `orders`, `notifications`, `ai_reviews`, `employees`.
- Storage: private bucket `photos`, path `orders/{client_ref}/{kind}/{uuid}.jpg`. Policies on `storage.objects`: insert and select for authenticated users where `bucket_id = 'photos'` (every employee may view work photos in the hackathon build); no update or delete for clients. The apps read photos through signed URLs.
- `integration_outbox`: a trigger writes `order.closed` (with materials) and `order.created` events. This is the 1С / ТОиР integration seam; `docs/integration-1c.md` maps fields to 1С:ТОИР documents (заявка на ремонт, акт выполненных работ, требование-накладная на материалы).

## 6. Order lifecycle (case §4, 10 statuses + Отменён)

UI labels: issued «Выдан» · accepted «Принят в работу» · queued «В очереди» · rejected «Отклонён» · in_progress «В работе» · paused «Приостановлен» · done «Исполнено» · ai_review «Проверка ИИ» · rework «На доработку» · closed «Закрыт» · cancelled «Отменён».

Active statuses (watchdog tracks them): issued, accepted, queued, in_progress, paused, rework.
Overdue is derived: active and `now() > due_at`. Once `done`, deadline tracking stops; lateness is `done_at > due_at`.

| action | from | to | actor | required payload | side effects |
|---|---|---|---|---|---|
| create (RPC `create_order`) | none | issued | master | type, priority, description, area_id, equipment_id, assignee_id or brigade_id, due_at or norm_hours, client_ref; optional comment | event; notification `new_order` (or `emergency`) to assignee; brigade order → assignee = brigade leader; attach `before` photos by client_ref; set equipment.is_stopped if equipment_stopped; `is_demo = settings.demo_mode` |
| accept | issued, queued | accepted | assignee | none | accepted_at |
| queue | issued | queued | assignee | none | queue_position = max + 1 among assignee's queued orders |
| reject | issued, queued, accepted | rejected | assignee | reason (reject_t); comment required if `other` | notify master: needs reassignment |
| start | accepted, queued | in_progress | assignee | optional `pause_current: true` | started_at (first time). If assignee has another in_progress order: raise `ANOTHER_IN_PROGRESS` unless pause_current, then pause it (reason other, comment «Аварийный наряд») in the same transaction |
| pause | in_progress | paused | assignee | reason (pause_t) + optional comment | paused_since = now() |
| resume | paused | in_progress | assignee | none | paused_total_sec += now() − paused_since |
| complete | in_progress | done, then ai_review | assignee | works_done, fault_code, materials [{material_id, qty}], comment. Missing photo or fields are ALLOWED: the AI judges completeness | done_at; write order_materials; the worker's event carries client_action_id, the second event (done → ai_review) is written as system with client_action_id null in the same transaction; invoke `ai-verify` |
| ai_result | ai_review | rework if verdict = rework; otherwise stays ai_review | system, only through `order_system_action` (secret key) | review_id | on rework: rework_count + 1 and `due_at = greatest(due_at, now() + greatest(interval '30 min', 0.5 × norm))`; notify worker (report or rework reasons) and master (`review_ready`) |
| close | ai_review, rework | closed | master | final_verdict, final_score (defaults to AI), comment | closed_at; final fields; ai_reviews.master_*; equipment.is_stopped = false; notify worker |
| return | ai_review | rework | master | comment required | rework_count + 1; due_at extended as in ai_result; notify worker |
| resume_rework | rework | in_progress | assignee | none | none |
| reassign | issued, queued, accepted, rejected, paused, in_progress, rework | issued | master | new assignee_id or brigade_id | started_at and paused_since cleared, paused_total_sec = 0 for the new assignee (history stays in events); notify new and previous assignee |
| cancel | any status except closed and cancelled | cancelled | master | reason | equipment.is_stopped = false |
| set_priority | any active | same | master | priority | notify assignee if raised to emergency |
| mark_reject_justified | any order with a reject event | same | master | id of the reject event | event with payload `{justified: true}`; the rating stops counting that refusal |

Every status change writes one `order_events` row (from, to, actor, reason, comment, payload); `complete` writes two. `orders.last_comment` is updated whenever a comment exists.

Details that the SQL and `transitions.ts` share (the mock must behave the same):
- Reason labels. reject_t: no_materials «Нет материалов», no_permit «Нет допуска», busy_emergency «Занят аварийным», equipment_running «Оборудование работает», other «Другое». pause_t: waiting_parts «Ожидание запчастей», waiting_stop «Ожидание остановки», waiting_permit «Ожидание допуска», other «Другое».
- One order in progress per worker: `start`, `resume` and `resume_rework` raise `ANOTHER_IN_PROGRESS` when the assignee has another in_progress order, unless `pause_current: true`, which pauses that order first (reason other, comment «Аварийный наряд №{n}» when the new order is an emergency, otherwise «Переключился на наряд №{n}»).
- `NOT_ON_SHIFT`: `create` and `reassign` raise it when the chosen worker (or the brigade leader) is off shift, unless `allow_off_shift: true`; the UI then asks «Исполнитель не на смене. Всё равно выдать?» and retries with the flag. `accept` and `start` switch the worker's `on_shift` on.
- `BAD_INPUT`: create payload missing a description or equipment, or an assignee who is not a worker. Message «Проверьте поля наряда».
- Deadline on create: `due_at`, else `due_in_min` (the server adds it to its own clock; the «1 мин» demo preset uses it), else `norm_hours`, else the norm of `suggested_fault_code`, else by priority: emergency 2 h, high 4 h, normal 8 h, planned 24 h. `area_id` always follows the equipment.
- `start` from queued also sets `accepted_at` when it is empty. `reassign` resets the per-assignee fields: `issued_at = now()`, accepted_at, queued_at, rejected_at, started_at, paused_since and queue_position cleared, paused_total_sec 0.
- `complete` replaces the order's material lines with the submitted list (after rework the form prefills the previous list). `close` takes final_verdict and final_score from the current AI review unless the master changes them; with no review, final_verdict is required (`MISSING_REASON`). `cancel` needs `reason` text.
- `equipment.is_stopped` is true while an order with `equipment_stopped` on that unit is issued, accepted, queued, rejected, in_progress, paused or rework.
- Event action names: create, accept, queue, reject, start, pause, resume, complete, review_started (system, done → ai_review), ai_result, close, return, resume_rework, reassign, cancel, set_priority, mark_reject_justified.

```sql
create function public.order_action(p_order_id bigint, p_action text, p_payload jsonb default '{}',
                                    p_client_action_id uuid default null)
returns public.orders language plpgsql security definer set search_path = public as $$ ... $$;
create function public.create_order(p jsonb, p_client_action_id uuid default null) returns public.orders ...;
create function public.attach_photo(p jsonb) returns public.order_photos ...;          -- by client_ref
create function public.order_system_action(p_order_id bigint, p_action text, p_payload jsonb) ...; -- service_role only
```

Errors are raised with these codes as the error message and mapped to Russian messages on the clients: `FORBIDDEN`, `BAD_TRANSITION`, `MISSING_REASON`, `ANOTHER_IN_PROGRESS`, `NOT_ON_SHIFT`, `BAD_INPUT`.
A repeated `client_action_id` returns the current order without applying the action twice.
`packages/shared/src/domain/transitions.ts` holds the same table for the UI (allowed buttons) and the mock; a Phase 1 test checks that SQL and TypeScript agree.

Board column map (master board and web panel):
- «Выданы»: issued, plus rejected with a red badge «Отклонён: {причина}» and a one tap «Переназначить»
- «Приняты»: accepted
- «В очереди»: queued
- «В работе»: in_progress; paused with badge «Пауза: {причина}»; rework with badge «Доработка»
- «Выполнены»: done and ai_review (badge «Проверка ИИ» or «Ждёт подтверждения»), closed today
- «Просрочены»: every overdue active order, shown here instead of its own column, with its status badge

`ai-verify` invocation after complete: the client calls the function right after the RPC returns. The watchdog retries any order stuck in ai_review for more than 60 s without a review for the current attempt (pg_net with the project URL and secret key from Vault).

Repeat failure link: a BEFORE INSERT trigger on unplanned orders sets `repeat_of_order_id` when the same unit had a repair finished in the previous 7 days with the same fault code (or the new order has no code yet).

## 7. Worker status (case §5.1.2, §5.2.1)

```sql
create view public.v_worker_status as
select e.id, e.short_name, e.specialty, e.grade, e.brigade_id, e.on_shift,
       cur.id as current_order_id, cur.number as current_order_number,
       coalesce(q.cnt, 0) as queue_count,
       case when not e.on_shift then 'off'
            when cur.id is not null then 'working'
            when coalesce(q.cnt, 0) > 0 then 'queue'
            else 'free' end as status
from employees e
left join lateral (select o.id, o.number from orders o
                   where o.assignee_id = e.id and o.status = 'in_progress'
                   order by o.started_at desc limit 1) cur on true
left join lateral (select count(*) cnt from orders o
                   where o.assignee_id = e.id
                     and o.status in ('issued','accepted','queued','paused','rework')) q on true
where e.role = 'worker';
```

Display strings: free «Свободен», working «Выполняет наряд №147», queue «В очереди 2», off «Не на смене».
Clients subscribe to `orders` and `employees` changes and refetch this view (debounce 250 ms).

## 8. Notifications (case §5.3.1, §6.1)

Pipeline: insert into `notifications` (the outbox) → trigger `notifications_dispatch` (pg_net, asynchronous, timeout 5000 ms, project URL and secret key read from Vault at call time) → Edge Function `notify-dispatch` (`verify_jwt = false`, checks the secret key in the `apikey` header). The trigger and both functions `notify-dispatch` and `telegram-webhook` are built by the architect (migration `rota_dispatch`, `supabase/functions/`). Edge Functions read the secret key from `SUPABASE_SECRET_KEYS` (JSON, key `default`), falling back to `SUPABASE_SERVICE_ROLE_KEY`.

Mobile side:
- After login and the onboarding permission screen, the app calls `Notifications.getExpoPushTokenAsync({ projectId })` and upserts the token into `push_tokens`.
- Android channels, created at startup:

  | Channel | Importance | Sound | Vibration |
  | --- | --- | --- | --- |
  | `orders` | HIGH | `ding.wav` | `[0, 250, 150, 250]` |
  | `emergency` | MAX | `siren.wav` | `[0, 600, 200, 600, 200, 600]`, red light, bypass DND requested |
  | `reminders` | DEFAULT | default | default |

  Sounds are bundled through the expo-notifications config plugin. Channel settings freeze once a channel exists on a device: to change a sound or importance, create a new channel id (`emergency_v2`).
- iOS: local notifications name the sound in their content (`sound: 'siren.wav'`); Expo push messages carry `sound: 'siren.wav'` or `'ding.wav'` (custom sounds bundled by the config plugin, named with the extension). Android ignores `sound` and plays the channel's.
- iOS remote push needs an APNs key from the paid Apple Developer Program and is not planned. On the iOS Simulator, `xcrun simctl push booted kz.rota.app tools/push/emergency.apns` delivers a simulated remote push with the same payload shape (the URL at the top level and under `body`).
- Category `order_actions`: actions «Принять» (`accept`) and «Открыть» (`open`), both opening the app. The response listener performs `accept` through the API after the app opens, then shows the order. It reads the URL from `data.url`, falling back to `data.body.url`; a cold start is handled with `useLastNotificationResponse()`.

`notify-dispatch`:
- loads the recipient's push tokens and posts to `https://exp.host/--/api/v2/push/send` with `{to, title, body, data: {url, order_id, kind}, channelId, sound, priority: 'high', categoryId}`; `channelId` is `emergency` for emergency orders, `reminders` for reminder, overdue and rework, `orders` otherwise; `sound` is `siren.wav` for emergency, `ding.wav` for orders, `default` otherwise
- reads the tickets; deletes tokens answered with `DeviceNotRegistered`; sets push_sent_at
- if the employee has telegram_chat_id, sends the same event to Telegram WITHOUT personal names (Telegram is an external service): order number, equipment, area, status, deadline only; sets tg_sent_at

In-app:
- realtime on own notifications → HUD capsule toast + haptic + short sound
- critical (new emergency order) → full-screen red emergency screen with «Принять» and «Отклонить»; the siren loops (expo-audio) and a heavy haptic repeats until the worker acts; never auto-dismisses
- refetch the queue on every own notification and whenever the app returns to the foreground; resubscribe channels then. A locked phone drops the socket, and after a reassign the previous assignee gets no UPDATE because RLS checks the new row.

Onboarding after first login on a phone: full screen «Включите уведомления» with one big button → `requestPermissionsAsync()` → token registration. The profile shows push status, the token (copy) and «Проверить уведомление».

Telegram link: profile → «Подключить Telegram» → `rpc('telegram_link_token')` → deep link `t.me/<bot>?start=<token>` (valid 15 min) → `telegram-webhook` (`verify_jwt = false`, checks `X-Telegram-Bot-Api-Secret-Token`) stores chat_id. One-time setup: `setWebhook` with `secret_token = TELEGRAM_WEBHOOK_SECRET`. Telegram is send-only until step 2 adds inline buttons.

Message templates (exact; fill placeholders; omit a clause when its value is empty):
- `new_order`: «Новый наряд №{n}. {equipment}, {area}. Срок до {HH:MM}. Приоритет: {priority}.»
- `emergency`: «АВАРИЙНЫЙ наряд №{n}. {equipment}, {area}. Требует ответа.»
- `reminder`: «Через {m} мин истекает срок наряда №{n}. {equipment}, {area}.»
- `overdue` (to worker and to the master who issued it): «Наряд №{n} просрочен на {mins} мин. {equipment}, {area}. Исполнитель: {short_name}. Статус: {status_label} с {HH:MM}. Последний комментарий: “{last_comment}”.»
- `escalation` (to master): «Наряд №{n} не принят за {m} мин. {equipment}, {area}. Исполнитель: {short_name}. Предлагаем: {cand_short_name}, {cand_reason}.» In the app this notification has a one tap button «Переназначить на {cand_short_name}».
- `manager_overdue`: «Длительная просрочка: наряд №{n} просрочен на {mins} мин. {equipment}, {area}. Исполнитель: {short_name}.»
- `rework`: «Наряд №{n} возвращён на доработку. Причина: {top_reason}.»
- `review_ready`: «Наряд №{n} проверен ИИ: {verdict_label}, {score} баллов. Подтвердите закрытие.»
- `weekly_digest` (managers and masters): «Сводка ИИ за неделю: {n} выводов. Главное: {top_title}.»
- `rejected` (to the issuing master): «Наряд №{n} отклонён. {equipment}, {area}. Исполнитель: {short_name}. Причина: {reason_label}.» In the app it has a one tap button «Переназначить».
- `reassigned` (to the previous assignee): «Наряд №{n} передан другому исполнителю. {equipment}, {area}.» The new assignee gets `new_order` or `emergency`.
- `report` (to the worker when the AI verdict is not rework): «Наряд №{n} проверен ИИ: {verdict_label}, {score} баллов. Ждёт подтверждения мастера.»
- `review_rework` (to the master when the AI returns the order): «ИИ вернул наряд №{n} на доработку. Причина: {top_reason}. Исполнитель: {short_name}.»
- `review_ready` when the AI is unsure (`needs_master_review`): «Наряд №{n} ждёт вашей проверки: ИИ не уверен в оценке.»
- `closed` (to the worker): «Наряд №{n} закрыт. Итог: {verdict_label}, {score} баллов.»
- `cancelled` (to the assignee): «Наряд №{n} отменён. {equipment}, {area}. Причина: {reason}.»
- Plurals: «баллов» and «выводов» follow Russian number agreement (81 балл, 82 балла, 85 баллов); minutes are always «мин».
- Titles (push title and HUD line): new_order «Новый наряд №{n}», emergency «Аварийный наряд №{n}», reminder «Скоро срок №{n}», overdue «Просрочен №{n}», escalation «Не принят №{n}», manager_overdue «Длительная просрочка №{n}», rework «На доработку №{n}», review_ready «Проверка ИИ №{n}», review_rework «ИИ вернул №{n}», report «Отчёт ИИ №{n}», rejected «Отклонён №{n}», reassigned «Передан №{n}», closed «Закрыт №{n}», cancelled «Отменён №{n}», weekly_digest «Сводка ИИ за неделю».
- Severity: critical for emergency, overdue, manager_overdue, rework, review_rework; warning for reminder, escalation, rejected, cancelled; info otherwise. URL: emergency → `/emergency/{id}`, report, review_ready and review_rework → `/order/{id}/review`, escalation → `/order/{id}?reassign={candidate_id}`, everything else → `/order/{id}`.

## 9. Watchdog: AI deadline control (case §6.1, MVP)

Built by the architect (migrations `rota_watchdog`, `rota_cron`) and covered by SQL tests:

```sql
select cron.schedule('rota-watchdog', '5 seconds', $$ select internal.watchdog_tick() $$);
```

`internal.watchdog_tick()` with `s = settings.demo_time_scale` (1 normally; every threshold is divided by s). Keys are unique per recipient, so the same key can go to the worker and the master.
1. Not accepted: status issued and `now() − issued_at > accept_timeout / s` (emergency: `accept_timeout_emergency / s`) → `escalation` to the master with the top candidate from `suggest_assignees` excluding the current assignee (key `esc:{order}:{assignee}`; the notification `url` is `/order/{id}?reassign={candidate_id}`, which the app turns into the one tap button), plus a `reminder` to the assignee (key `escrem:{order}:{assignee}`).
2. Before deadline: active and `0 < due_at − now() ≤ least(remind_before / s, 0.5 × (due_at − issued_at))` → `reminder` to assignee (key `rem:{order}:{due_at}`). The `least` keeps a 1 minute demo order from firing its reminder at creation: it fires at 30 s left.
3. Overdue: active and `now() > due_at` → `overdue` to the assignee AND the issuing master, same key `ovd:{order}:{k}` for both, `k = floor((now − due_at) / (overdue_repeat / s))`, which produces repeats every interval.
4. Long overdue: `now() − due_at > manager_overdue / s` → `manager_overdue` to every manager (key `mgr:{order}`).
5. Stuck review: status ai_review for more than 60 s with no ai_reviews row for the current attempt → pg_net call to `ai-verify` with the secret key from Vault (`project_url`, `secret_key`), at most once a minute and 5 times per attempt (`internal.ai_retry`). `ai-verify` therefore runs with `verify_jwt = false` and authorizes in code: the secret key in `apikey`, or a valid user session (`auth.getUser`) of the assignee or a master.

Messages show real elapsed minutes, not scaled ones.
The demo script runs at time scale 1. ×10 exists only to show an escalation on purpose (at ×10 the emergency accept timeout is 18 s, which would fire during the normal script).
Settings seed: `remind_before_min 30`, `accept_timeout_min 10`, `accept_timeout_emergency_min 3`, `overdue_repeat_min 15`, `manager_overdue_min 60`, `demo_time_scale 1`, `demo_mode false`, `ai_confidence_threshold 0.6`, `duplicate_hamming_max 6`.

## 10. AI executor suggestion (case §5.1.3; demo step 2; escalation in §6.1.4)

```sql
public.suggest_assignees(p_equipment_id int, p_required_specialty text default null, p_exclude uuid default null)
returns table(employee_id uuid, short_name text, status text, score numeric, reasons text[])
```

- Candidates: workers on shift, not excluded.
- Required specialty: parameter, or derived on the client from description keywords, or the equipment type default (`equipment_type_specialty`), or the suggested fault code's specialty. Keyword map: `течь|масл|гидрав|подшип|лент|редукт|вибрац|шум` → слесарь; `электр|кабел|двигател|автомат|пускат|датчик|щит|освещ|искр` → электромонтёр; `свар|трещин|излом|разрыв металл` → сварщик; `смаз` → смазчик.
- `score = 0.40·availability + 0.30·skill_on_type + 0.15·grade_norm + 0.10·same_area_today + 0.05·(1 − load_today_norm)`; specialty mismatch multiplies by 0.3.
  - availability: free 1.0; queue `max(0.2, 0.6 − 0.1·queue_count)`; working 0.25
  - skill_on_type: Bayesian mean of final_score on this equipment type `(n·mean + 5·team_mean)/(n + 5)`, normalized 0..1
- Reasons, e.g. «Свободен», «Слесарь 5 разряда», «12 нарядов по насосам, средняя оценка 4,7».
- Returns top 3. The create screen preselects #1 with an «ИИ» tag and its reasons line.
- The picker also has a «Бригады» tab with free and busy counts per brigade (case 5.1 «исполнитель или бригада»); choosing a brigade assigns its leader and sets brigade_id.

## 10b. Master screens: create flow, board, equipment history (case 5.1, 5.2, 5.5)

Create flow. Required fields in 5 taps; the photo is optional and adds the camera's own taps:
1. «Выдать» in the tab bar
2. Preset chip: «Аварийный» (unplanned, emergency, «Оборудование остановлено» on) · «Внеплановый» · «Плановый»
3. Equipment chip: recent units and units with open orders first; area chips above filter the list (the case's «оборудование, отфильтрованное по участку»); picking a unit sets its area. QR scan comes in step 2.
4. Problem chip from `problem_templates` for that equipment type: fills the description and the suggested fault code. Free text, and voice in step 2, cover anything else.
5. «Выдать»: assignee preselected by `suggest_assignees`, deadline preselected as now + the norm of the suggested code.

Optional, each one tap away: photos (up to 5, camera or gallery); comment; deadline sheet (1 ч, 2 ч, 4 ч, 8 ч, конец смены, or date and time; «1 мин» in demo mode); another assignee or a brigade; the «Оборудование остановлено» switch.

Board: columns by the map in section 6; filter chips (участок, оборудование, исполнитель, приоритет); a counters row for the shift (выдано, выполнено, просрочено, оборудование в простое).

Equipment history: `equipment/[id]` on mobile and `/equipment/:id` on the web, linked from every order card: all orders, events, repairs and total downtime for that unit.

Worker screens have a «Закрытые» tab: closed orders with their scores (case 5.3.4).

## 11. AI completion check (case §6.2, §6.3, MVP)

Edge Function `ai-verify` (POST `{order_id}`) is a thin LLM caller; the deterministic half is SQL (migration `rota_ai_review`, built and tested by the architect):

1. `rpc('ai_context', { p_order_id })` (service role) returns everything below plus the rule results and `already_reviewed`; exit at once if already reviewed.
2. Redact (privacy gateway), download the photos from Storage, one LLM call (step 3).
3. `rpc('ai_submit', { p_order_id, p_llm, p_meta: { model, latency_ms } })` scores L1 and L2, aggregates, decides the verdict and `needs_master_review`, inserts the review once per attempt and moves the order (`ai_result`). After 3 failed LLM calls, or on `BUDGET_EXCEEDED`, call it with `p_llm = null` and `p_meta.error`: a rules-only review that asks the master to confirm.
4. `rpc('ai_check_rules', { p_order_id })` is the same rules-only review for a signed-in assignee or master: `SupabaseApi.ai.verify` uses it until `ai-verify` exists, and the app can fall back to it offline.

Idempotency: `attempt = rework_count + 1` and `unique (order_id, attempt)`; a second submit for the same attempt returns the existing review.

Step 1, context: order, equipment, area, fault code + norm, closing materials with typical norms and the historical p90 per (fault_code, material), photos (before and after with captured_at, source, dhash, sha256), timeline, last comments, worker pseudonym.

Step 2, deterministic rule checks (`packages/shared/src/domain/verifyRules.ts` mirrors them for the mock). Each returns `{id, status: pass|warn|fail, points, max, message_ru}`:
- R1 completeness (max 20): works_done ≥ 15 chars; fault_code set; materials listed or explicit «без материалов»; after photo present. Missing after photo on an unplanned order → fail «нет фото после: обязательно для внеплановых работ». On a planned order → warn.
- R2 photo integrity (max 10): source camera (gallery → warn); `captured_at` between `started_at − 5 min` and `done_at + 2 min`, else fail «фото сделано не во время работ»; dhash Hamming distance ≤ `duplicate_hamming_max` against photos of OTHER orders → fail «фото совпадает с фото наряда №{x} от {date}»; against this order's before photo only when it is the same image (sha256 equal, or Hamming ≤ 3 and captured_at within 120 s) → fail «фото после совпадает с фото до». Before and after shots of the same pump from the same spot are legitimately similar, so never apply the loose threshold within one order.
- R3 materials (max 15): material not in the typical list for the fault code → warn; qty > qty_max or > 2 × p90 → fail «перерасход: {material} {qty} {unit} при норме до {max}»; qty > p90 → warn.
- R4 time (max 20): `work_min = done_at − started_at − paused_total` (the gap between a rework return and its restart counts as a pause); `ratio = work_min / (norm_hours·60)`. On a demo order a job shorter than 15 minutes is compared with the accelerated norm, one norm hour = 2 minutes; longer jobs use the real norm. ratio ≤ 1.2 → full points; 1.2..1.5 → −5; > 1.5 → −10; < 0.25 → −10 and warn «подозрительно быстро». Done after due_at → −5 and message «срок нарушен на {N} мин».
- With no LLM answer the rules are scaled to 100 (`Σ R × 100 / 65`), L1 and L2 show «не выполнено», and `needs_master_review` is true unless a rule failed.

Step 3, one LLM call: Sonnet 5.5 with vision and a JSON schema, `thinking: {type: 'between_tools'}`, `output_config.effort: 'low'`, no temperature, timeout 45 s. Send the client-compressed JPEGs as they are (≤1600 px); never resize inside the function (Edge Functions have a 2 s CPU limit).
Input: problem description, works_done, fault code + name, material lines with norms, rule results, before photo (if any), after photo (if any). The system prompt says: you are the shift control AI at a mining and processing plant; judge only what is visible or written; if unsure, say unsure and lower confidence; never invent facts. It lists what to look for (case 6.3): whether the visible problem from the before photo (leak, break, destruction, contamination) is gone; whether it is the same equipment; neatness, debris, loose parts, missing protective guards.

```json
{
  "work_match": {"verdict": "full|partial|none", "explanation": "string"},
  "code_consistent": true,
  "suggested_code": "string",
  "materials_logic": {"verdict": "ok|suspicious", "explanation": "string"},
  "photo": {"after_present": true, "same_equipment": "yes|no|unsure",
            "problem_resolved": "yes|no|unsure|not_applicable",
            "quality_issues": ["string"], "score_1_5": 4, "explanation": "string"},
  "confidence": 0.86,
  "feedback_worker": {"good": ["string"], "improve": ["string"]},
  "summary_master": "string"
}
```

- L1 work match (max 20): full 20, partial 10, none 0 and fail. `code_consistent: false` → −8 and warn «шифр не соответствует работам, предложен {suggested_code}». `materials_logic: suspicious` → −5 inside R3 and warn.
- L2 photo quality (max 15): `score_1_5 × 3`; problem_resolved = no → fail; same_equipment = no → fail.

Step 4, aggregate: `score = Σ points` (0..100); `score5 = clamp(round(score / 20), 1, 5)`.
Verdict: any rule fail (R1 to R4) → rework, whatever the LLM says and however confident it is. Otherwise an LLM fail → rework; score ≥ 80 → accepted; 60..79 → accepted_with_remarks; < 60 → rework.
`needs_master_review = no rule failed AND (confidence < ai_confidence_threshold OR LLM error OR timeout OR BUDGET_EXCEEDED)`. Then the order stays in ai_review labelled «Нужна проверка мастером»; on an LLM error its checks show «не выполнено».

Step 5 is inside `ai_submit`: insert ai_reviews, apply `ai_result`, notifications go out (worker `report` or `rework`, master `review_ready` or `review_rework`).
The apps show the per check breakdown with ✓, !, ✕ glyphs and the confidence.

Golden set: `supabase/functions/ai-verify/golden/*.json`, 10 cases with expected verdicts (`supabase/tests/ai_review.sql` already pins the SQL scoring for 9 of them with fixed LLM answers): good repair (accepted); no after photo (rework); duplicate photo (rework); excess materials (rework); wrong fault code (accepted_with_remarks); unrelated works text (rework); suspiciously fast (accepted_with_remarks); overdue but good (accepted); planned order without photo (accepted_with_remarks); unclear photo (needs master review). `npm run golden` prints accuracy; the number goes on a slide. Golden runs cost money: run them sparingly against the budget.

## 12. Order report (case §6.4, MVP)

Worker view: score «{score} из 100» and «{score5} из 5», «Что хорошо», «Что улучшить», «Время: 2 ч 10 мин при нормативе 3 ч».
Master view: card; timeline (every event with time and actor); works; fault code; materials table vs norm; before and after photos side by side (tap to zoom); AI verdict, per check breakdown, confidence, model; equipment downtime for this order.
Master actions: «Согласен, закрыть» (one tap), «Изменить оценку» (score 0..100, verdict, comment, then close), «Вернуть на доработку» (comment required).
PDF export of the master report from the web panel (pdfmake).

## 13. Rating (case §6.6, MVP)

`public.rating(p_from timestamptz, p_to timestamptz, filters jsonb default '{}')` returns rows for workers and brigades: `kind, id, name, brigade_id, closed, q, t, f, v, d, score, rank, note` (built by the architect).
Closed orders in the period; `final_score` = master override, otherwise AI score.
- Q quality = mean(final_score) / 100
- T on time = share of orders with done_at ≤ due_at
- F first time fix = 1 − share of orders with rework_count > 0 or followed by a repeat failure (same unit and same fault code) within 7 days. Unit and code pairs that occur 5 or more times in the period are chronic equipment faults: they are reported by `d_repeat_faults` and not counted against the worker
- V volume × complexity = Σ(norm_hours × k) / max over workers; k: emergency 1.3, high 1.15, normal 1.0, planned 0.9
- D discipline = 1 − unjustified rejects / orders ever assigned to the worker; unjustified = reason `other` without a `mark_reject_justified` event

Bayesian shrinkage for Q, T, F: `x_adj = (n·x + 5·team_x) / (n + 5)`, so a worker with 2 orders cannot top the table.
`score = 100 × (0.35·Q + 0.25·T + 0.20·F + 0.10·V + 0.10·D)`. Brigade score = closed-orders-weighted mean of members.
Edge cases: no closed orders → the worker is listed «нет закрытых нарядов» without a score; wrap every denominator in `nullif`; count rejects and "assigned" from `order_events` (actor = the worker), never from the current assignee, because reassign rewrites it.
Weights rationale for the slide: quality and first time fix drive downtime most; on time drives reaction speed; volume stays small so nobody is rewarded for rushing; refusals stay small because many refusals are legitimate safety calls (no permit, equipment not stopped).
`ai-explain-rating` (Haiku): pseudonymized components in, three sentences out: what helped, what hurt, one concrete action.
UI: table + stacked bar chart by component (web), worker and brigade tabs, the shared filter (section 14); the worker's own screen «Из чего сложился рейтинг». Demo step 8 uses the «Месяц» period.

## 14. Shift report and the shared report filter (case §7, MVP)

Every report RPC (order list, order report, shift report, rating) takes one shared filter: period preset (смена, сутки, неделя, месяц, произвольный период) plus участок, оборудование, исполнитель, бригада. One `FilterBar` sits on every web report page, with «Скачать PDF» and «Скачать Excel».

`public.shift_report(p_from timestamptz, p_to timestamptz, filters jsonb default '{}')` (built by the architect) returns jsonb:
counts (issued, accepted, done, closed, overdue, rejected with reasons), workload per worker (busy minutes / shift minutes), equipment downtime (orders with equipment_stopped: created_at to done_at or now), average reaction (issued → accepted), average execution (started → done minus pauses), AI verdict distribution, top issues.
`public.dashboard(p_from, p_to, filters)` returns the manager tiles (active and overdue now, reaction, execution, downtime, top 5 units, best 3 workers).
`ai-shift-summary`: jsonb in, 5 to 8 sentences of Russian summary + 3 recommendations out; cached in ai_insights (kind `shift_summary`).
Shifts: day 08:00–20:00, night 20:00–08:00 (Asia/Qostanay).
Materials and downtime reports (case §7, «желательно») reuse the same filter; they are step 2 unless Phase 5 finishes early.

## 15. Analytics and anomalies (case §6.5; demo step 9)

SQL detectors with parameters `(p_from, p_to, filters)` (built by the architect, migration `rota_detectors`); each returns jsonb rows with numbers and `order_ids` as evidence:
- `d_top_equipment`: unplanned count, unplanned downtime hours, ratio to the fleet median, top fault codes with shares
- `d_top_areas`: the same per area, with failures per unit
- `d_repeat_faults`: same unit + same fault_code ≥ 3 times in the window; median days between; how many workers
- `d_post_ppr`: share of planned closures followed by an unplanned failure on the unit within 5 days, against the unit's own failure rate outside those windows (lift ≥ 2, at least 4 ППР); the brigade that did most of them
- `d_time_patterns`: area × fault group, night against day (both shifts are 12 h), the peak 3 hour window, min support 8
- `d_worker_repeats`: per worker share of closed unplanned orders followed by the same fault on the same unit within 7 days (chronic pairs excluded) against the team; z score ≥ 2 with at least 8 repairs
- `d_materials`: quantity against the norm (typical qty; the median when the material is not typical) per brigade and per worker; flag ratio ≥ 1.8 with n ≥ 5
- `d_trend` (bonus): weekly unplanned failures per unit over the last 6 full weeks; slope ≥ 0.3 per week and the last 2 weeks at least twice the first 2

`public.analytics_bundle(from, to, filters)` returns all of them for the LLM; `public.insight_cards(from, to, filters)` writes deterministic cards in the case's tone from the same numbers (the fallback when the LLM is off or over budget, and the reference the LLM's numbers must match). `tools/seed/PATTERNS.md` lists what they must find.

`ai-insights` (POST `{from, to, filters, query?}`): if `query` is present, Haiku parses it into `{area_id, from, to, focus[]}`; detectors run; Sonnet writes insight cards `[{kind, severity, title, body, recommendation, evidence: {order_ids, stats}}]` using ONLY the numbers provided; results are stored in ai_insights.
Weekly digest: cron every Monday at 03:00 UTC (08:00 Asia/Qostanay) runs `ai-insights` for the past week and sends `weekly_digest` to managers and masters.
UI: insight cards with severity, recommendation, «Доказательства» (list of orders + mini chart), ask box «Спросите, например: покажи проблемы участка дробления за месяц».
Reference tone (from the case): «Конвейер К-3: 7 внеплановых остановок за 30 дней, 5 из них шифр М-02 (подшипник). Рекомендуем проверить соосность привода и включить в план ППР.»

## 16. Privacy gateway (case §9 security; 10 points)

`_shared/privacy.ts`:
- `buildDirectory(employees)`: full_name, short_name, surname, first name, tab_no, pseudonym
- `redact(value)`: walks strings and objects; replaces surnames with Russian or Kazakh case endings, «Фамилия И.», first name plus surname in either order, directory tab numbers and phone numbers with the pseudonym (`E01`…`E15` workers, `M01`, `M02` masters, `R01` manager, `A01` admin); names outside the directory stay
- `rehydrate(value)`: pseudonym → short_name for display

`_shared/llm.ts` `createLlm(config).call({purpose, model, system, messages, schema})`: redact → write llm_audit (redacted request) → call the provider with the model settings from section 2 → write response and cost → rehydrate.
Provider switch: `LLM_PROVIDER=mock|anthropic|openai_compatible`, `LLM_BASE_URL`, model names from env, so a local model served by vLLM or Ollama can replace Claude on premises.
Admin screen «Что видит ИИ» (web): latest llm_audit rows with the redacted payload.

## 17. Photos (case §9.6, §6.3)

- «После»: `ImagePicker.launchCameraAsync({ quality: 1, exif: true })`, camera only on devices (the iOS Simulator falls back to the library in development, recorded as `gallery`). «До»: camera or library (the case allows the gallery), up to 5 photos.
- `captured_at` = EXIF `DateTimeOriginal` (else `DateTime`), else the moment the picker returned; `source` = `camera` or `gallery`. EXIF times are the camera's local time without a zone: use `OffsetTimeOriginal` when present, otherwise read them as UTC+5.
- Compress with the SDK 57 API: `ImageManipulator.manipulate(uri).resize(...)` with the longest side at 1600, `.renderAsync()`, then `saveAsync({ format: SaveFormat.JPEG, compress: 0.7 })` (target ≤ 350 KB). `manipulateAsync` is deprecated.
- dHash: `manipulate(uri).resize({ width: 9, height: 8 }).renderAsync()` then `saveAsync({ format: SaveFormat.PNG, base64: true })`; `upng-js` decodes it; grayscale; compare horizontal neighbours → 64 bits → 16 hex chars.
- sha256 of the compressed file: `new File(uri).bytes()` (expo-file-system `File` API) into `Crypto.digest(CryptoDigestAlgorithm.SHA256, bytes)`, then hex. Upload the same `Uint8Array` to Storage with `contentType: 'image/jpeg'`.
- Upload starts the moment the photo is taken (during form filling) with a visible state; then `attach_photo`.
- Hamming distance in SQL: `bit_count(('x' || a)::bit(64) # ('x' || b)::bit(64))`.

## 18. Auth and roles (case §9.5)

- Login: numeric keypad, табельный номер then 4 digit ПИН. The apps sign in with email `{tab_no}@naryad.local` and password `nr_{pin}_kz`. Sessions persist in AsyncStorage (mobile) and localStorage (web).
- Users are created by the architect's SQL seed (`supabase/seed/`): rows in `auth.users` and `auth.identities` with bcrypt passwords, confirmed email and `raw_app_meta_data.app_role`, idempotent by tab_no. If sign in ever fails on those rows, recreate them through the Auth Admin API with the secret key (`email_confirm: true`, `app_metadata: {app_role}`).
- Role routes on mobile: worker → `(worker)`; master → `(master)`; manager → `(manager)`; admin → a screen pointing to the web panel. On the web: master → `/shift`, manager → `/dashboard`, admin → `/admin/directories`; workers do not use the web panel.
- RLS: workers see only their own orders, photos, reviews, notifications; masters, managers and admins see all orders; only admins edit directories and settings; `order_events` is append-only for everyone (no update or delete policy); all inserts and updates on orders go through security definer RPCs.
- Policies read the role from the JWT through a stable helper `my_role()` = `auth.jwt() -> 'app_metadata' ->> 'app_role'`. No policy on `employees` queries `employees`: that recursion silently kills Realtime.
- Grants: `revoke execute on all functions in schema public from public, anon`; grant execute on the RPCs to authenticated. `order_system_action` and the `internal` schema are executable only by service_role (the secret key).
- Shift: worker taps the «На смене» switch (on_shift); the master can toggle it too.

## 19. Seed data (case §8)

The directories live in the migration `rota_directories` and as TypeScript fixtures in `packages/shared/src/fixtures`; ids follow the order of the lists below (areas 1 to 4, equipment 1 to 25, materials 1 to 40, brigades 1 to 3), and `supabase/seed/directories.json` is the export the fixtures must match. People come from `supabase/seed/01_people.sql`. The history is generated inside the database by `internal.generate_history()` (`supabase/seed/02_history.sql` runs it, then the demo start state): 92 days ending yesterday (Asia/Qostanay), deterministic random seed, people resolved by tab_no, never by hard-coded UUIDs. Running it again rebuilds the history relative to today.

Areas (4): Карьер · Участок дробления · Участок обогащения · Участок отгрузки

Equipment (25; type; criticality):
- Карьер: Экскаватор ЭКГ-10 №7 (экскаватор, A); Экскаватор ЭКГ-10 №9 (экскаватор, A); Буровой станок СБШ-250 №3 (буровой станок, B); Насос водоотлива ЦНС-300 №1 (насос, A); Насос водоотлива ЦНС-300 №2 (насос, A); Компрессор передвижной ПВ-10 (компрессор, C)
- Участок дробления: Дробилка щековая ЩДП-12х15 (дробилка, A); Дробилка КМД-1750 №1 (дробилка, A); Дробилка КМД-1750 №2 (дробилка, A); Грохот ГИЛ-52 (грохот, B); Конвейер К-1 (конвейер, B); Конвейер К-2 (конвейер, B); Конвейер К-3 (конвейер, A)
- Участок обогащения: Сушильный барабан №1 (сушильный барабан, A); Грохот плоский ГП-2 (грохот, B); Дробилка молотковая ДМ-1 (дробилка, B); Вентилятор ВДН-12,5 (вентилятор, B); Циклон ЦН-15 батарея №2 (циклон, C); Рукавный фильтр ФРИ-360 (фильтр, B); Насос НШ-32 маслостанции (насос, B); Компрессор 4ВМ10-50/9 (компрессор, A)
- Участок отгрузки: Упаковочная машина УМ-50 (упаковочная машина, B); Конвейер К-7 отгрузки (конвейер, B); Кран мостовой 10 т (кран, B); Погрузчик фронтальный №2 (погрузчик, C)

Equipment names are plausible placeholders: replace them with the customer's real nomenclature if they share it.

Problem templates (3 to 5 per equipment type), e.g. насос: «Течь масла», «Шум и вибрация», «Не создаёт давление», «Перегрев»; конвейер: «Шум подшипника», «Сход ленты», «Порыв ленты», «Не запускается».

Fault codes (20; specialty) with norm hours that go into `work_norms`:
М-01 Износ футеровки или брони (слесарь, 6) · М-02 Подшипник: перегрев, шум, разрушение (слесарь, 3) · М-03 Повреждение конвейерной ленты (слесарь, 4) · М-04 Вибрация, нарушение соосности (слесарь, 2.5) · М-05 Износ редуктора или зубчатой передачи (слесарь, 5) · М-06 Трещина металлоконструкции, ослабление крепежа (сварщик, 2) · М-07 Износ ролика или барабана конвейера (слесарь, 1.5) · Э-01 Отказ электродвигателя (электромонтёр, 4) · Э-02 Повреждение кабеля (электромонтёр, 2) · Э-03 Неисправность пускателя или автомата (электромонтёр, 1) · Э-04 Отказ датчика или концевого выключателя (электромонтёр, 1) · Э-05 Срабатывание защиты, перегрев (электромонтёр, 1.5) · Э-06 Неисправность освещения или щита (электромонтёр, 1) · Г-01 Течь масла, повреждение РВД (слесарь, 1.5) · Г-02 Отказ гидронасоса (слесарь, 4) · Г-03 Неисправность гидроцилиндра (слесарь, 3) · П-01 Утечка сжатого воздуха (слесарь, 1) · П-02 Отказ пневмоклапана или пневмоцилиндра (слесарь, 1.5) · С-01 Недостаток смазки (смазчик, 0.5) · С-02 Загрязнение масла, замена масла (смазчик, 1.5)

Materials (40; unit):
Подшипник 22320 (шт) · Подшипник 3626 (шт) · Подшипник 6312 (шт) · Подшипник 180310 (шт) · Лента конвейерная (м) · Ролик конвейерный (шт) · Футеровка барабана (компл) · Броня конуса КМД (компл) · Шестерня редуктора (шт) · Муфта упругая МУВП (шт) · Ремень клиновой (шт) · Болт М20 (шт) · Гайка М20 (шт) · Шайба 20 (шт) · Электроды УОНИ 13/55 (кг) · Масло И-40А (л) · Масло гидравлическое ВМГЗ (л) · Смазка Литол-24 (кг) · Смазка ЦИАТИМ-201 (кг) · Рукав высокого давления (шт) · Кольцо уплотнительное (шт) · Манжета армированная (шт) · Фильтр масляный (шт) · Сальниковая набивка (кг) · Электродвигатель 15 кВт (шт) · Кабель КГ 3×16 (м) · Кабель ВВГ 4×4 (м) · Автоматический выключатель 63 А (шт) · Пускатель ПМЛ (шт) · Датчик индуктивный (шт) · Концевой выключатель (шт) · Лампа светодиодная (шт) · Изолента (шт) · Предохранитель (шт) · Пневмораспределитель (шт) · Шланг пневматический (м) · Фитинг пневматический (шт) · Рукав фильтровальный (шт) · Ветошь (кг) · Герметик (шт)

Norms with typical materials (demo-critical; derive the rest the same way):
- Г-01: Кольцо уплотнительное 2 (max 4), Масло ВМГЗ 3 л (max 6), Рукав высокого давления 1 (max 2), Ветошь 1 кг (max 2)
- М-02: each of the four bearings 1 (max 2), Смазка Литол-24 0.5 кг (max 1)
- С-01: Смазка Литол-24 0.8 кг (max 2)
- С-02: Масло И-40А 20 л (max 40), Фильтр масляный 1 (max 2)

People (tab no; PIN; role; specialty and grade; brigade; pseudonym):
- Masters: 1001 Жумабаев Нурлан (ПИН 1111, day, M01); 1002 Ковалёв Андрей (ПИН 2222, night, M02)
- Manager: 3001 Тлеубаев Марат, главный механик (ПИН 3333, R01). Admin: 9001 Садыкова Айгерим (ПИН 9999, A01)
- Workers, all ПИН 1234:
  - Бригада 1 (leader Ахметов): 2001 Ахметов Ерлан (слесарь 5, E01, demo hero); 2002 Иванов Сергей (слесарь 4, E02); 2003 Нурпеисов Асхат (электромонтёр 5, E03); 2004 Литвиненко Олег (сварщик 5, E04); 2005 Касымов Бауыржан (смазчик 3, E05)
  - Бригада 2 (leader Петренко): 2006 Сериков Данияр (слесарь 4, E06); 2007 Петренко Виктор (слесарь 6, E07); 2008 Оспанов Ерик (электромонтёр 4, E08); 2009 Ким Денис (электромонтёр 5, E09); 2010 Абенов Талгат (слесарь 3, E10)
  - Бригада 3 (leader Мухамеджанов): 2011 Мухамеджанов Руслан (слесарь 5, E11); 2012 Беляев Николай (слесарь 4, E12); 2013 Жаксылыков Нурбол (электромонтёр 4, E13); 2014 Ткаченко Игорь (сварщик 4, E14); 2015 Есенов Арман (смазчик 3, E15)
- Brigades rotate weekly: two brigades on day shift, one on night.

History: about 540 orders over 92 days (the case asks for 500+): about 60% planned ППР, inspections and lubrication rounds, about 40% unplanned, which is the share a well run maintenance shop aims for; each with a full event trail, materials, an AI review and a final score; 5 to 7% assigned to brigades. About 10 to 13% late, 6% rejected first (with reasons), 6 to 7% sent to rework, 8% AI scores changed by the master. Work time lognormal around the norm (σ 0.35) scaled by grade; reaction time exponential (mean 6 min, emergency 2 min); 12 to 16% of orders paused 0.5 to 4 h. The history has no photos.

Planted patterns (answer key with measured numbers in `tools/seed/PATTERNS.md`; `public.insight_cards` finds all six):
- P1 Конвейер К-3: 21 unplanned failures in 92 days, 3× the fleet median, 15 of them М-02 (подшипник) about every 6 days; the last 30 days hold exactly 7 failures, 5 of them М-02, the case's own example; the most unplanned downtime.
- P2 Сериков Д. (слесарь, бригада 2): about 40% of his repairs followed by the same fault on the same unit within 7 days (team about 14%), about a third of his orders reworked.
- P3 Дробилка КМД-1750 №2: about 60% of its weekly ППР (all by бригада 3) followed by an unplanned failure within 5 days, against about 17% for the same unit outside those windows.
- P4 Участок обогащения at night: electrical (Э) faults about 2.2 to 2.6× the day rate, peak 02:00 to 05:00.
- P5 Бригада 1: Смазка Литол-24 about 2.2× the norm on С-01.
- P6 (bonus forecast) Насос водоотлива ЦНС-300 №2: weekly unplanned failures 0, 1, 1, 1, 2, 3 over the last 6 weeks.

## 20. Demo mode and the Demo Day script (case §11)

«Демо» screen (mobile and web):
- «Демо режим» (`settings.demo_mode`): new orders get `is_demo`; the deadline sheet offers «1 мин» (`due_in_min: 1`); R4 compares a demo job of a few minutes with the accelerated norm (1 h = 2 min); the tap counter shows on the create screen (taps and seconds since «Выдать» was opened). The script runs at time scale 1.
- «Ускорение времени ×10» (`settings.demo_time_scale`) only to show an escalation on purpose.
- «Сбросить демо» calls `rpc('demo_reset')` (master or admin; built by the architect; `MockApi.demo.reset()` in mock mode). It deletes every order created after the history load and every `is_demo` order (children cascade, notifications with them), then inserts the start state directly, without sending pushes. Photo files of deleted orders stay in Storage unless the optional `demo-reset` Edge Function removes them:
  - master Жумабаев on day shift; 9 workers on shift: free Ахметов, Ким, Касымов; working Иванов on «Конвейер К-2: шум подшипника» (unplanned, started_at = now() − 2.5 h, closed in step 7), Нурпеисов on Э-03, Петренко on Конвейер К-1; queue Сериков with 2 queued, Оспанов with 1 accepted; paused Абенов «ждём подшипник со склада»; 6 off shift (Литвиненко and бригада 3)
  - every active demo order gets `due_at = now() + 6 h`
  - 12 orders closed since 08:00 today (or over the last 10 hours before 08:00), so the shift report in step 8 has content
  - Насос НШ-32 маслостанции running
  - Ахметов is the only free слесарь, so the AI suggestion in step 2 is deterministic

Script (phones run the release APK: A master Жумабаев 1001, B worker Ахметов 2001 in work gloves, C worker Иванов 2002; the laptop shows the web panel and mirrors A and B with scrcpy over USB):
1. A: shift panel shows who is free, busy, queued, off shift; board shows active orders.
2. A: photographs the oil leak on «Насос НШ-32 маслостанции», creates an emergency unplanned order; AI preselects Ахметов with reasons; «Выдать». Tap counter shows ≤ 6 taps for the required fields and < 60 s.
3. B: push with siren + red screen; «Принять» → «Начать». A: Ахметов turns yellow «Выполняет наряд №…» within seconds.
4. A: issues a second order to Ахметов with a 1 minute deadline («1 мин» preset); B taps «В очередь». The reminder fires at 30 s left; within 5 s after the deadline both phones get the overdue message in the case format. Step 5 runs while this clock ticks.
5. B: closes the first order: works text, Г-01, Кольцо уплотнительное 2 шт + Масло ВМГЗ 2 л + Ветошь 1 кг, after photo of the clean pump, comment.
6. AI check (~10 s): leak gone, same equipment, materials within norm, time vs norm → «Принято», score; B gets the worker report, A gets the full report and taps «Согласен, закрыть».
7. C: closes the К-2 bearing order without a photo and with 6 bearings → «Требует доработки» with the reasons «нет фото после» and «перерасход: подшипник 6 шт при норме до 2».
8. Web panel: shift report with AI summary, rating of workers and brigades for «Месяц».
9. Web panel: analytics on 3 months of history shows P1 to P5 with recommendations; ask «покажи проблемы участка дробления за месяц».

## 21. Build order

Each phase ends built, tested and committed before the next one starts. The phase brief in `docs/PHASE_N.md` is authoritative for its phase.

- **P0 Foundation.** `docs/PHASE_0.md`: monorepo, Rota design system in code, the mobile app with every screen shell on `MockApi`, the web panel shells, the shared domain, the LLM client and privacy gateway, notifications foundation and the push proof.
- **P1 Data core** (needs `.secrets/supabase.env`). Split in two:
  - The architect builds the database directly on the Supabase project, in parallel with P0, and drops the same SQL into `supabase/migrations/` and `supabase/seed/`: schema with cascades and unique keys, RLS through `my_role()`, grants, storage policies; `create_order`, `order_action`, `order_system_action`, `attach_photo`, `v_worker_status`; directories and problem templates; auth users with PINs and app_metadata roles; the history with the planted patterns. Claude Code does not write migrations or run `supabase db push` or `db reset` unless the user says so.
  - Done by the architect, beyond P1: the watchdog and its cron (P4), `suggest_assignees` (P4), the AI scoring core `ai_context` / `ai_submit` / `ai_check_rules` (P4), `rating`, `shift_report`, `dashboard` (P5), the detectors, `analytics_bundle` and `insight_cards` (P6), `demo_reset` (P7). Later phases build on these instead of writing them again.
  - Claude Code then builds `SupabaseApi` behind `RotaApi`, generates the database types, and adds the parity tests; `docs/PHASE_1.md` has the details.
  - Accept: `supabase/tests/transitions.sql` and `ai_review.sql` pass (every transition, illegal transitions raise `BAD_TRANSITION`, anon cannot execute any RPC, AI scoring); row counts match section 19; both apps sign in with real accounts.
- **P2 Live loop.** Both apps switch to `EXPO_PUBLIC_API_MODE=supabase`; realtime subscriptions; photo pipeline (section 17); every Phase 0 shell on real data. Accept: two devices, master creates in 5 taps, worker sees it in under 5 s, every worker button changes the master's view in under 5 s.
- **P3 Notifications.** The server side is built by the architect (`notify-dispatch`, `telegram-webhook`, the dispatch trigger, Vault secrets). Claude Code: token registration and the push status in the profile, channels and categories from P0 on real events, in-app toasts, the emergency screen with siren from realtime, «Подключить Telegram» and the one-time `setWebhook`. Accept: worker phone locked, push arrives within 5 s with sound; emergency is red and requires an answer.
- **P4 AI control.** `ai-verify` (thin: `ai_context` → LLM → `ai_submit`) with the golden set, Vault secrets for the watchdog's retries, the escalation one tap reassign, worker and master reports, master close, override, return. Accept: demo steps 4 to 7 reproduce three times in a row (with «Сбросить демо» between runs) with identical verdicts; golden set ≥ 9 of 10.
- **P5 Reports and rating.** Shared filter, the web pages on `rating`, `shift_report` and `dashboard`, `ai-shift-summary`, `ai-explain-rating`, PDF and Excel export. Accept: Сериков ranks low on first time fix; the shift report numbers match a manual SQL count.
- **P6 Analytics.** `ai-insights` (Haiku parses the question, `analytics_bundle` gives the numbers, Sonnet writes the cards; `insight_cards` is the fallback) with the ask box, weekly digest cron, insight cards with evidence, manager dashboard tiles (наряды в работе, просрочки, среднее время реакции и выполнения, простой оборудования, топ 5 проблемного оборудования, лучшие исполнители). Accept: P1 to P5 found with magnitudes within ±20% of PATTERNS.md.
- **P7 Demo hardening and deliverables.** Release APK, the full script three times on real phones, README, test accounts, dataset export, architecture diagram, slides, video.

## 22. Environment

- `apps/mobile/.env`: `EXPO_PUBLIC_API_MODE=mock|supabase`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_DEMO_ACCOUNTS=true`. Public values only.
- `apps/web/.env.local`: `VITE_API_MODE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Public values only.
- `.secrets/anthropic.env`: `ANTHROPIC_API_KEY`, `LLM_BUDGET_USD=4`. `.secrets/supabase.env`: `SUPABASE_PROJECT_REF=wcjklkpkuhxgfdtbwbuk`, `SUPABASE_URL=https://wcjklkpkuhxgfdtbwbuk.supabase.co`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (legacy JWT keys, not used by the apps), `SUPABASE_LEGACY_JWT_SECRET`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL` (direct connection; it is IPv6 only, so tools on IPv4 networks use the session pooler string from the dashboard instead). `.secrets/telegram.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`. `.secrets/firebase-adminsdk.json`: the FCM V1 service account (uploaded to EAS, never to Supabase).
- Edge secrets (`supabase secrets set --env-file …`): `ANTHROPIC_API_KEY`, `LLM_BUDGET_USD`, `LLM_PROVIDER`, `LLM_BASE_URL` (only for openai_compatible), `LLM_MODEL_SMART=claude-sonnet-5-5`, `LLM_MODEL_FAST=claude-haiku-5-5`, `EXPO_ACCESS_TOKEN` (optional push security), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`. `SUPABASE_URL` and the secret key are provided to functions automatically.
- Local function serving: `supabase/functions/.env` (git ignored), built from the `.secrets` files.
- Vault: `project_url`, `secret_key` (for pg_net calls from cron).
- EAS: `extra.eas.projectId` in `app.config.ts` (not secret); FCM V1 key uploaded with `eas credentials`; `apps/mobile/google-services.json` git ignored.

## 23. Deliverables (case §12)

- Repo link with README (run instructions, env, seed, test accounts, demo script)
- Android APK: `eas build -p android --profile preview` (internal APK) or a local release build (`npx expo run:android --variant release`)
- Web panel link + test accounts: мастер 1001/1111, исполнитель 2001/1234, руководитель 3001/3333
- Test dataset: `supabase/seed/` + `tools/seed/PATTERNS.md`
- Presentation ≤ 10 slides: problem, solution, architecture, AI modules, effect for the enterprise, rollout plan
- Demo video ≤ 3 min

## 24. Step 2 hooks (do not build early, do not block)

Keep the architecture ready for:
- offline outbox: AsyncStorage queue replaying RPCs by client_action_id, plus @react-native-community/netinfo
- QR stickers: `equipment.qr_token`, route `rota://e/{token}`, expo-camera barcode scanning, which also saves taps in the create flow
- voice to order: expo-speech-recognition (ru-RU, kk-KZ), then LLM parsing of one sentence into every order field
- fault code and norm hint by LLM (case 5.1.4)
- Kazakh UI (`kk.ts`)
- Telegram inline buttons
- materials and downtime reports
- failure forecast and Isolation Forest in `tools/analytics`
- assistant chat with tool calls over read-only functions
- new mascot poses (hard hat, clipboard, phone camera) drawn as sticker sheets and traced into the same layer roles
