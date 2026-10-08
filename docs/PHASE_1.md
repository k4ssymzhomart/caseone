# Phase 1 · Data core on Supabase

Rota for the Qostanai Industry Hackathon 2026, Case 1. Executor: Claude Code. Written 2026-10-08.
Read `CLAUDE.md` first, then this file. Phase 0 must be done (apps, design system, shared domain, `MockApi`).

The database is already built. The architect wrote it, tested it on a local Postgres (about 150 assertions:
every transition, roles, RLS, idempotency, notification texts, AI scoring, watchdog, history patterns) and applied it
to the Supabase project «rota» `wcjklkpkuhxgfdtbwbuk` (eu-central-1) on 2026-10-08; section 2 has the exact state.
Your job in Phase 1 is the app side: `SupabaseApi` behind the same `RotaApi`, types, env, parity tests. Phase 2 then
turns both apps to `supabase` mode with realtime.

---

## 1. What is in the repo

| Path | Content |
| --- | --- |
| `supabase/migrations/20261008100001_rota_extensions.sql` | pgcrypto, pg_net, pg_cron |
| `…100002_rota_schema.sql` | enums, directories, orders and children, notifications, push tokens, AI and audit tables, indexes |
| `…100003_rota_security.sql` | `my_role()`, `is_staff()`, RLS on every table, grants (anon gets nothing), photos bucket and policies, realtime publication |
| `…100004_rota_state_machine.sql` | `create_order`, `order_action`, `order_system_action`, `attach_photo`, `set_on_shift`, `register_push_token`, `unregister_push_token`, `set_setting`; notification templates; repeat link and 1С outbox triggers |
| `…100005_rota_views.sql` | `v_orders` (board column, overdue, names, AI verdict), `v_worker_status`, `v_brigade_status`, `suggest_assignees` |
| `…100006_rota_directories.sql` | areas, 25 units, 20 fault codes, 40 materials, norms with typical materials, 58 problem chips, brigades, settings |
| `…100007_rota_seed_tools.sql` | `internal.generate_history()`, `internal.demo_reset()`, `public.demo_reset()` |
| `…100008_rota_watchdog.sql` | `internal.watchdog_tick()`: escalation, reminders, overdue, manager overdue, stuck AI check retry |
| `…100009_rota_reports.sql` | `rating`, `shift_report`, `dashboard` |
| `…100010_rota_detectors.sql` | `d_*` detectors, `analytics_bundle`, `insight_cards` |
| `…100011_rota_ai_review.sql` | rules R1 to R4, `ai_context`, `ai_submit`, `ai_check_rules` |
| `…100012_rota_cron.sql` | the watchdog every 5 seconds, daily log cleanup |
| `…100013_rota_dispatch.sql` | trigger that sends every new notification to `notify-dispatch` through pg_net (URL and secret key from Vault); `telegram_link_token()` |
| `supabase/functions/notify-dispatch/` | Expo push to every device of the recipient (channel, sound, category by kind; removes dead tokens), then Telegram without names |
| `supabase/functions/telegram-webhook/` | links a Telegram chat through the one time `/start <token>` |
| `supabase/seed/01_people.sql` | 19 test accounts (auth users with bcrypt passwords) and the employee directory |
| `supabase/seed/02_history.sql` | 3 months of history with the planted patterns, then the Demo Day start state |
| `supabase/seed/directories.json` | export of every directory, for fixtures |
| `supabase/tests/*.sql` | the acceptance scripts (run against a database with `psql -f`) |
| `supabase/tests/transitions.json` | the state machine as the SQL implements it |
| `tools/seed/PATTERNS.md` | the answer key for analytics |

Do not edit these files. If you need a database change, write the SQL and the reason into `docs/db-requests.md` and tell
the user; the architect applies it. With the user's explicit yes you may add a new migration with the next version
number instead, and apply it as in section 2.

## 2. Is the database applied?

State on 2026-10-08, 19:30:

| Part | State |
| --- | --- |
| Migrations 01, 02, 03, 05, 08, 09, 10, 11, 12 | applied through the Supabase connector |
| Migration 04 | applied except `internal.apply_action` (the transition engine) |
| Migration 07 | applied except `internal.generate_history` and `internal.demo_reset` |
| Migration 13 | applied except `public.telegram_link_token` |
| Migration 06 (directories) | not applied |
| Edge Functions `notify-dispatch`, `telegram-webhook` | deployed, `verify_jwt` off; the database → function call is tested (401 on a wrong key) |
| Vault `project_url`, `secret_key` | set |
| Seeds (people, history, demo state) | not loaded |

The missing pieces are in one file, `supabase/manual/rota_remaining.sql` (the connector holds statements that contain
DELETE or a table-wide UPDATE for a human approval, so the user runs this file by hand). Order:

1. The user pastes `supabase/manual/rota_remaining.sql` into Dashboard → SQL Editor → Run (one transaction).
2. Then `supabase/seed/01_people.sql`, then `supabase/seed/02_history.sql`, the same way. The architect runs these
   through the connector when he is around; otherwise the user pastes them.
3. Check: sign in as 1001 and select areas (section 9 has a script). Four rows means yes.

Until step 1 is done, every order action fails (`internal.apply_action` is missing) and there are no users. Build and
test against `MockApi` meanwhile; the contract suite with `RUN_SUPABASE=1` waits for step 3.

Migration history: the remote history does not match the 13 files (pieces were applied under other names and
versions). Never run `supabase db push` before aligning it, and only with the user's yes:

```sh
npx supabase login
npx supabase link --project-ref wcjklkpkuhxgfdtbwbuk   # asks for SUPABASE_DB_PASSWORD from .secrets/supabase.env
npx supabase migration repair --status reverted 20261008121111 20261008121153 20261008121454 20261008122137 20261008122145 20261008122349 20261008122416 20261008122727 20261008122757 20261008122849 20261008123018 20261008123127 20261008123139 20261008123155
npx supabase migration repair --status applied 20261008100001 20261008100002 20261008100003 20261008100004 20261008100005 20261008100006 20261008100007 20261008100008 20261008100009 20261008100010 20261008100011 20261008100012 20261008100013
npx supabase migration list                            # local and remote now show the same 13 versions
```

`repair` only edits the history table; it runs no SQL. Do it after step 1 above, so that "applied" is true.

## 3. Types

`npx supabase gen types typescript --project-id wcjklkpkuhxgfdtbwbuk --schema public > packages/shared/src/api/database.types.ts`
(after `npx supabase login`). If the architect already committed that file, use it. Regenerate whenever a migration lands.

## 4. Clients

`packages/shared` stays platform free: `SupabaseApi` receives a ready `SupabaseClient` from the app.

- Mobile: `import 'react-native-url-polyfill/auto'`; `createClient(url, key, { auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })`; call `supabase.auth.startAutoRefresh()` when the app becomes active and `stopAutoRefresh()` when it goes to the background.
- Web: `createClient(url, key)` with the default localStorage session.
- `createApi({ mode: 'supabase', client, storage, uuid })`; `mode` comes from `EXPO_PUBLIC_API_MODE` / `VITE_API_MODE`.
- Dependencies: `@supabase/supabase-js` in both apps (and as a peer of `@rota/shared`), `react-native-url-polyfill` in mobile.

Env files (git ignored; commit `.env.example` with placeholders):

| File | Keys |
| --- | --- |
| `apps/mobile/.env` | `EXPO_PUBLIC_API_MODE=supabase`, `EXPO_PUBLIC_SUPABASE_URL=https://wcjklkpkuhxgfdtbwbuk.supabase.co`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (from `.secrets/supabase.env`), `EXPO_PUBLIC_DEMO_ACCOUNTS=true` |
| `apps/web/.env.local` | `VITE_API_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |

The publishable key and the URL are public. The secret key never goes into the apps.

## 5. `RotaApi` → database

| Method | Call |
| --- | --- |
| `auth.signIn(tab, pin)` | `auth.signInWithPassword({ email: \`${tab}@naryad.local\`, password: \`nr_${pin}_kz\` })`; the session's `user.app_metadata.app_role` is the role; `short_name` from `employees` |
| `auth.session`, `auth.onChange` | `auth.getSession()`, `auth.onAuthStateChange` |
| `directories.get()` | selects on `areas`, `equipment`, `brigades`, `employees`, `fault_codes`, `materials`, `work_norms`, `equipment_type_specialty`, `problem_templates`, `settings`; cache forever, refetch on demand |
| `orders.list(filter)` | `from('v_orders')` with `.in('status', …)`, `.eq('assignee_id', …)`, area, equipment, date ranges; the board uses `board_column`, `is_overdue`, `last_reason`, `status_since` |
| `orders.get(id)` | `v_orders` row + `order_events` (by `created_at`) + `order_photos` + `order_materials` with `materials` + `ai_reviews` (all attempts) |
| `orders.create(input, caid)` | `rpc('create_order', { p: input, p_client_action_id: caid })` |
| `orders.action(id, action, payload, caid)` | `rpc('order_action', { p_order_id, p_action, p_payload, p_client_action_id })` |
| `orders.suggestAssignees(eq, spec?, exclude?)` | `rpc('suggest_assignees', { p_equipment_id, p_required_specialty, p_exclude })` |
| `workers.statuses()` | `from('v_worker_status')`; brigades tab: `from('v_brigade_status')` |
| `workers.setOnShift(id, on)` | `rpc('set_on_shift', { p_employee_id, p_on_shift })` |
| `photos.upload(input)` | `storage.from('photos').upload('orders/{client_ref}/{kind}/{uuid}.jpg', bytes, { contentType: 'image/jpeg' })`, then `rpc('attach_photo', { p })` with client_ref, kind, storage_path, source, captured_at, dhash, sha256, width, height, bytes, exif |
| `photos.url(path)` | `storage.from('photos').createSignedUrl(path, 3600)`, cached |
| `ai.verify(orderId)` | Phase 1 and 2: `rpc('ai_check_rules', { p_order_id })` (rules only, the master confirms). Phase 4: `functions.invoke('ai-verify', { body: { order_id } })` |
| `ai.review(orderId)` | latest `ai_reviews` row for the order |
| `ai.insights(input)` | `rpc('insight_cards', { p_from, p_to, p_filters })` now; Phase 6 adds the LLM cards from `rpc('analytics_bundle')` |
| `reports.shift(input)` | `rpc('shift_report', { p_from, p_to, p_filters })` |
| `reports.rating(period, filters)` | `rpc('rating', { p_from, p_to, p_filters })` |
| manager tiles | `rpc('dashboard', { p_from, p_to, p_filters })` |
| `notifications.list()` | `from('notifications').select().order('created_at', { ascending: false }).limit(50)` |
| `notifications.markRead(id)` | `from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)` (only `read_at` is writable) |
| `notifications.registerPushToken(input)` | `rpc('register_push_token', { p_token, p_platform, p_device_name })`; sign out calls `unregister_push_token` |
| `realtime.subscribe(topic)` | `postgres_changes` on `orders` (all events), `notifications` (`recipient_id=eq.{uid}`), `ai_reviews` (INSERT), `employees` (UPDATE); refetch, debounced 250 ms |
| `demo.reset()` | `rpc('demo_reset')` (master or admin) |
| `demo.settings()`, `demo.updateSettings(patch)` | `from('settings')`; one `rpc('set_setting', { p_key, p_value })` per key (masters may change `demo_mode` and `demo_time_scale`) |

Filters are one jsonb: `{ area_id, equipment_id, assignee_id, brigade_id }`, every key optional.

## 6. Errors

PostgREST returns `{ code: 'P0001', message: '<CODE>', details }` for the state machine:

| message | details | UI |
| --- | --- | --- |
| `FORBIDDEN` | context | «Нет прав на это действие» |
| `BAD_TRANSITION` | context | refetch the order, then «Статус уже изменился» |
| `MISSING_REASON` | what is missing | open the reason sheet or the comment field |
| `ANOTHER_IN_PROGRESS` | JSON `{ order_id, number }` | confirm sheet «Приостановить наряд №{number} и начать этот?», then retry with `pause_current: true` |
| `NOT_ON_SHIFT` | the worker's short name | «{name} не на смене. Всё равно выдать?», then retry with `allow_off_shift: true` |
| `BAD_INPUT` | context | «Проверьте поля наряда» |

`42501` (permission denied) maps to `FORBIDDEN`. Auth `invalid_credentials` maps to a new code `WRONG_PIN` with
«Неверный табельный номер или ПИН»: add it to `RotaError`, `ru.ts` and `MockApi`. Fetch failures map to `NETWORK`.

## 7. Parity with Phase 0

1. **Fixtures.** Ids in `packages/shared/src/fixtures` must equal `supabase/seed/directories.json`: areas 1 to 4,
   equipment 1 to 25, materials 1 to 40, brigades 1 to 3, problem templates 1 to 58, in the order of CLAUDE.md §19.
   Best: `tools/gen-fixtures.ts` writes the fixture files from the JSON, and a test fails on any drift.
   Note: С-01 typical Литол-24 is 0.8 kg (max 2) in the database.
2. **Transitions.** A vitest test walks `supabase/tests/transitions.json` and checks `TRANSITIONS` and `allowedActions`
   agree for every action, status and role, including `single_in_progress` and the required reasons.
3. **Texts.** `templates.ts` matches the SQL texts of CLAUDE.md §8 (the SQL tests pin several exact strings).
4. **AI rules.** `verifyRules.ts` mirrors R1 to R4 of `internal.rules_checks` (same messages, same points) so the
   mock and the database agree.

## 8. Things the database already does for you

- `v_orders.board_column`: issued, accepted, queued, in_progress, done, overdue (CLAUDE.md §6 map). Closed orders keep
  `done`; the board shows those closed today.
- `create_order` takes `due_in_min` for the «1 мин» demo preset; the server clock sets the deadline.
- Escalation notifications carry the reassign target in `url`: `/order/{id}?reassign={employee_id}`.
- `complete` clears `ai_review_id` while the next attempt is checked, so the UI never shows a stale verdict.
- The watchdog already runs every 5 seconds and writes reminder, overdue, escalation and manager notifications.
- Every new notification row is already sent to `notify-dispatch` (trigger `notifications_dispatch`, pg_net, URL and
  secret key from Vault). Phase 3 adds the app side: push token registration, channels, sounds, categories, deep
  links, and the Telegram bot webhook (`setWebhook` to `/functions/v1/telegram-webhook`).
- `demo_reset()` deletes everything created after the history load and rebuilds the Demo Day start state:
  9 workers on shift, Ахметов the only free слесарь, 7 active orders, 12 closed this shift.

## 9. Acceptance

- `npm run check` passes, with the parity tests of section 7.
- A contract suite runs the same `RotaApi` scenarios against `MockApi` always and against `SupabaseApi` when
  `RUN_SUPABASE=1`: sign in 1001, create on the pump (id 20) for 2001, sign in 2001, accept, start, complete,
  `ai.verify`, sign in 1001, close; then `demo.reset()`. The publishable key and URL come from `.secrets/supabase.env`.
- `tools/db-check.ts` (Node, publishable key only): signs in as 1001/1111, prints the counts of areas (4), equipment (25),
  employees (19), orders (about 560) and the first `insight_cards` title for 92 days.
- Both apps start in `supabase` mode and sign in with real accounts (1001/1111, 2001/1234, 3001/3333, 9001/9999).
- `docs/progress.md` updated; report in the format of PHASE_0 §11.
