# Phase 2 · Live loop

Rota for the Qostanai Industry Hackathon 2026, Case 1. Executor: Claude Code. Written 2026-10-08.
Read `CLAUDE.md` first, then this file. Phase 0 (apps, kit, shells, `MockApi`) and Phase 1 (`SupabaseApi`, types,
parity tests) must be done. Database facts live in `docs/PHASE_1.md` §2, §5, §6 and §8.

Phase 2 turns every shell into the real product on two phones: the master issues, the worker sees it in seconds,
every tap on one device moves the other device and the web panel. This is criterion 1 of the jury (25 points:
«MVP работает вживую на телефонах»). Reliability beats polish here.

---

## 0. Launch

Lane A continues in terminal 1 (mobile). When lane B has finished its Phase 0 and Phase 1 work and lane A has merged
it, the user sends lane B in terminal 2:

`Read docs/PHASE_2.md. You are lane B of Phase 2.`

Lane B then runs `git switch -c p2-b main` in its worktree. Merges work as in PHASE_0 §3: lane A merges `p2-b` into
`main` when lane B reports a green step, and pushes.

| Lane | Owns | Steps |
| --- | --- | --- |
| A: mobile | `apps/mobile` | 2.1 (wiring only), 2.3, 2.4, 2.5, mobile part of 2.7 |
| B: shared and web | `packages/shared`, `apps/web`, `tools/` | 2.1 (the shared layer, first), 2.2, 2.6, web part of 2.7 |

Contract first: lane B commits `createLiveSync` (2.1) within its first 30 minutes and tells the user, so lane A can
merge it. Until then lane A works on 2.3 and 2.4.

---

## 1. Definition of done

1. Both apps run with `API_MODE=supabase` by default. Mock mode still works (`EXPO_PUBLIC_API_MODE=mock`,
   `VITE_API_MODE=mock`) and stays the mode of the unit tests.
2. Every route of PHASE_0 §7.1 and every page of §7.2 shows real data. No screen reads fixtures in supabase mode,
   except the directories cache.
3. Realtime: a change made on one device reaches the other device and the web panel in under 5 s (target under 1 s),
   in the foreground, and after the app comes back from the background.
4. Photos: «до» and «после» are compressed, hashed (sha256 and dHash), uploaded to Storage while the form is being
   filled, and attached with `attach_photo`. Upload of one photo takes under 10 s on a mobile network.
5. The AI check runs rules only (`rpc('ai_check_rules')`) right after `complete`; the review screens show its result.
   Phase 4 swaps in `ai-verify` behind the same `ai.verify`.
6. In-app toasts for every new notification and the red emergency screen from realtime work on both platforms
   (remote push is Phase 3).
7. The acceptance walkthrough of section 7 passes twice in a row, with «Сбросить демо» between the runs.
8. `npm run check` passes; `docs/progress.md` updated; report in the format of PHASE_0 §11.

Out of scope: remote push and Telegram (Phase 3), `ai-verify` with the LLM and the one tap reassign from an escalation
(Phase 4), PDF and Excel, AI shift summary and AI rating explanation (Phase 5), LLM insight cards (Phase 6), the
release APK (Phase 7), offline mode, QR and voice (step 2).

Time: about 3 hours with two lanes.

---

## 2. Steps

### 2.1 Live sync (lane B first, then lane A wires it)

One realtime channel per signed-in user, created after sign in and removed on sign out. It lives in
`packages/shared/src/live/createLiveSync.ts`, platform free, and both apps use it.

```ts
createLiveSync({
  client,                    // SupabaseClient with the user's session
  uid,                       // auth user id
  onInvalidate: (keys) => {},  // React Query keys to invalidate, already debounced
  onNotification: (row) => {}, // a new notification for this user: toast, emergency screen
  onStatus: (s) => {},         // 'live' | 'connecting' | 'offline' for the HUD
}): { stop(): void; resync(): void }
```

Subscriptions on one channel `rota-live-{uid}`:

| Table | Event | Filter | Invalidate |
| --- | --- | --- | --- |
| `orders` | `*` | none (RLS limits a worker to own orders) | `['orders']`, `['order', id]`, `['workers']`, `['brigades']`, `['equipment']`, `['dashboard']`, `['shift']` |
| `employees` | `UPDATE` | none | `['workers']`, `['brigades']` |
| `ai_reviews` | `INSERT` | none | `['order', order_id]`, `['reviews', order_id]` |
| `notifications` | `INSERT` | `recipient_id=eq.{uid}` | `['notifications']`, `['orders']`; then `onNotification(row)` |

Rules:

- Debounce invalidations 250 ms per key. Never apply payloads to the cache directly: refetch from `v_orders`
  (views do not emit realtime events, the base table does).
- `orders` UPDATE events stop reaching a worker the moment an order leaves them (reassign, cancel): RLS hides the new
  row. The `reassigned` and `cancelled` notifications cover it, which is why every notification INSERT also
  invalidates `['orders']`.
- `equipment`, `order_events`, `order_photos` and `order_materials` are not in the realtime publication. Every action
  that changes them also updates the `orders` row in the same transaction, so the `orders` event is the trigger.
- `resync()`: invalidate everything. Call it after `SUBSCRIBED` (events missed while connecting), when the app returns
  to the foreground, and after `demo.reset()`.
- On `CHANNEL_ERROR`, `TIMED_OUT` or `CLOSED` while signed in: resubscribe with backoff 1, 2, 5, 10 s, and report
  `'offline'` meanwhile. The HUD shows «Нет связи» while offline.
- supabase-js passes the refreshed access token to the realtime socket by itself; do not open a second client.

Unit tests (vitest, a fake channel): the event to key map, the debounce, the resubscribe backoff, `stop()` removes
the channel.

Lane A wiring (`apps/mobile/src/lib/live.ts`): start on sign in, stop on sign out; `AppState` `active` →
`supabase.auth.startAutoRefresh()` and `resync()`; `background` → `stopAutoRefresh()`. Lane B does the same in the web
app (`visibilitychange` instead of `AppState`).

### 2.2 Shared data hooks and the API surface (lane B)

`SupabaseApi` from Phase 1 already covers PHASE_1 §5. Add what the live screens need, in both `SupabaseApi` and
`MockApi` (same results in both):

| Method | Supabase |
| --- | --- |
| `orders.list({ assigneeId?, statuses?, areaId?, equipmentId?, priority?, since? })` | `v_orders`, ordered by priority (emergency first), then `due_at` |
| `orders.forBoard(filters)` | `v_orders` where status is active, `done` or `ai_review`, or `closed_at` is today (local); grouped by `board_column` on the client |
| `shift.counters(shiftStart)` | from `v_orders` and `equipment.is_stopped`: issued since the shift start, done or closed since the shift start, active overdue now, units stopped now |
| `equipment.history(id)` | `v_orders` for the unit (newest first) and total downtime: the sum of `coalesce(done_at, cancelled_at, now()) − created_at` over orders with `equipment_stopped` |
| `photos.urls(paths)` | `storage.from('photos').createSignedUrls(paths, 3600)`, cached until 5 minutes before expiry |
| `notifications.unreadCount()` | `notifications` where `read_at is null`, count only |

Shift windows are local time (UTC+5): day 08:00 to 20:00, night 20:00 to 08:00. `shiftStart(now)` lives in the shared
formatters with tests.

Query keys are shared constants (`packages/shared/src/live/keys.ts`) so the apps and `createLiveSync` agree.

### 2.3 Mobile screens on real data (lane A)

Follow PHASE_0 §7.1 for layout; this table only adds what is live.

| Route | Live behaviour |
| --- | --- |
| `(auth)/login` | real sign in; `WRONG_PIN` shakes the dots with the error haptic; demo chips stay when `EXPO_PUBLIC_DEMO_ACCOUNTS=true` and sign in with the demo PINs (1001/1111, 2001/1234, 2002/1234, 3001/3333) |
| `(worker)/index` | `orders.list({ assigneeId: me, statuses: active })`; sections «Аварийные», «В работе», «Очередь» (queued by `queue_position`); «На смене» → `set_on_shift` |
| `(worker)/closed` | closed orders of the last 30 days with `final_score` and verdict |
| `(worker)/profile` | `rpc('rating', { p_from: now − 30 d, p_to: now, p_filters: { assignee_id: me } })` returns only the worker's own row; five component bars; the live status from 2.1 |
| `(master)/index` | `v_worker_status` grouped by state, `shift.counters`; tap a worker → `/worker/[id]` |
| `(master)/board` | `orders.forBoard`; six columns by the CLAUDE.md §6 map with their badges; filter chips |
| `create` | directories (cached), recent units first; `suggest_assignees(equipment_id, specialty)` with the specialty from CLAUDE.md §10; deadline pill from the code's norm; «1 мин» in demo mode sends `due_in_min: 1`; `NOT_ON_SHIFT` → «Исполнитель не на смене. Всё равно выдать?» → retry with `allow_off_shift: true`; tap counter in demo mode |
| `order/[id]` | `v_orders` row, `order_events`, photos, materials, reviews in parallel; the action bar from `allowedActions`; `ANOTHER_IN_PROGRESS` → sheet «Приостановить наряд №{number} и начать этот?» → retry with `pause_current: true` |
| `order/[id]/reason` | reasons from `reasons.ts`; «Другое» requires text |
| `order/[id]/close` | `complete` with works_done, fault_code, materials, comment, `no_materials`; after a rework the form is prefilled from the previous attempt; then `ai.verify(id)` |
| `order/[id]/review` | waits for the review of the current attempt (mascot `search` while `status = 'ai_review'` and no review for `rework_count + 1`); worker and master views as PHASE_0 §7.1; master: «Согласен, закрыть» (`close` without payload), «Изменить оценку» (`close` with final_verdict, final_score, comment), «Вернуть на доработку» (`return` with comment) |
| `emergency/[id]` | opens from `onNotification` (kind `emergency`), from a tap on the toast, and on sign in or foreground when an emergency order of mine is still `issued` |
| `worker/[id]` | that worker's active orders |
| `equipment/[id]` | `equipment.history(id)` |
| `demo` | «Демо режим» and «Ускорение времени ×10» through `set_setting`; «Сбросить демо» → `rpc('demo_reset')` then `resync()`; the two test notification buttons stay |
| `(manager)/index` | `rpc('dashboard', { p_from: now − 30 d, p_to: now, p_filters: {} })` tiles and top 5 units |

Every mutation:

- carries a `client_action_id` made when the user taps and reused for every retry of that same tap;
- disables its button while in flight and shows the HUD on success or error;
- maps errors through the Phase 1 table to Russian text; `NETWORK` shows «Нет связи. Повторить?» with a retry that
  reuses the same `client_action_id`.

Toasts (moved here from Phase 3): `onNotification` shows the notification's own `title` and `body` (the database
writes them in the case's wording) in the HUD for 4 s; a tap opens its `url`. Kind `emergency` opens the emergency
screen instead. Notification URLs are mobile routes: `/order/{id}`, `/order/{id}/review`, `/emergency/{id}`,
`/order/{id}?reassign={employee_id}` (Phase 4 turns the last one into a one tap reassign; for now it opens the order).

### 2.4 Photos (lane A)

The pipeline of PHASE_0 0.6 (`src/lib/photo.ts`) plus:

- dHash: `manipulate(uri).resize({ width: 9, height: 8 }).renderAsync()` then `saveAsync({ format: SaveFormat.PNG,
  base64: true })`; decode with `upng-js` (add `upng-js` and `pako`); grayscale; compare horizontal neighbours;
  64 bits → 16 lowercase hex chars. Unit test with two known images.
- Path `orders/{client_ref}/{kind}/{uuid}.jpg`. «До» photos on the create screen use the client_ref generated when the
  screen opens; `create_order` links them. «После» photos use the order's `client_ref` (it is a column of `v_orders`).
- Upload with `storage.from('photos').upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false })`. On
  React Native pass an `ArrayBuffer` of the compressed bytes; Blob, File and FormData from a uri do not upload
  reliably there.
- Then `rpc('attach_photo', { p: { client_ref, kind, storage_path, source, captured_at, dhash, sha256, width, height,
  bytes, exif } })`. `attach_photo` is idempotent by `storage_path`.
- The upload starts when the photo is taken. `PhotoTile` shows uploading, done, failed with «Повторить». «Отправить на
  проверку» waits for running uploads (up to 15 s) and then submits; a failed photo is dropped with a banner, the order
  is still submitted (the AI judges completeness).
- Simulator only (`!Device.isDevice`): the «после» photo comes from the library, and `captured_at` is the moment the
  picker returned instead of the EXIF time, so rule R2 can pass during development. The dev banner says
  «Симулятор: фото из галереи». Devices keep the camera and the EXIF time. Use a different photo for every order: the
  duplicate check (dHash) rightly fails a reused photo.

### 2.5 Mobile resilience (lane A)

- Cold start with a session: refetch everything before hiding the splash; then open any pending emergency.
- A notification tap that opens the app (`useLastNotificationResponse`) waits for the session and then navigates.
- Pull to refresh on every list calls `resync()`.
- Sign out: stop the live sync, `unregister_push_token` (Phase 3 registers it), clear the query cache.

### 2.6 Web panel on real data (lane B)

Follow PHASE_0 §7.2 for layout.

| Page | Live behaviour |
| --- | --- |
| `/login` | real sign in; workers get «Исполнители работают в мобильном приложении» and are signed out |
| `/shift` | `v_worker_status`, `shift.counters`, live orders list |
| `/board` | `orders.forBoard` as a kanban with the six columns, live |
| `/orders/:id` | the master report layout; actions close, return, reassign (with `suggest_assignees` and the brigades tab), cancel, priority, mark reject justified |
| `/equipment/:id` | `equipment.history(id)` |
| `/dashboard` | `rpc('dashboard')` with a period switch (смена, неделя, месяц) |
| `/reports/shift` | `rpc('shift_report')` with `FilterBar`; tables; the AI summary block keeps its placeholder until Phase 5 |
| `/reports/rating` | `rpc('rating')`, workers and brigades tabs, the stacked bar chart |
| `/analytics` | `rpc('insight_cards')` for the chosen period and area; «Доказательства» lists the order numbers of `evidence.order_ids` with links; the ask box stays disabled until Phase 6 |
| `/admin/directories` | read on real data |
| `/admin/settings` | `set_setting` for the watchdog thresholds (admin only) |
| `/demo` | same controls as mobile |

Notification URLs from the database are mobile routes: map `/order/{id}` to `/orders/{id}` on the web.

Deploy (only when the user says so, Needs you 4): Vercel, `apps/web` as the root, `vercel.json` rewriting every path
to `index.html`, `VITE_API_MODE=supabase`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as project env
vars. Put the link into `README.md`.

### 2.7 Acceptance (both lanes)

Section 7 below, then the report.

---

## 3. Server behaviour you will meet

- `demo_reset()` deletes every order created after the history load, so everything you create while testing goes
  away on «Сбросить демо». Use it freely.
- The watchdog runs every 5 seconds. An order left `issued` for 10 minutes (3 for emergency) escalates to the master
  and reminds the worker; reminders come 30 minutes before the deadline (or at half of a short window); overdue
  messages repeat every 15 minutes; managers hear after 60 minutes overdue. «Ускорение времени ×10» divides these.
  The demo state's active orders are due 6 hours after the reset, so they go overdue if you leave them.
- Rules only check (`ai_check_rules`): no LLM, so `needs_master_review` is true and the master gets «ждёт вашей
  проверки: ИИ не уверен в оценке» unless a rule fails; a rule fail sends the order to rework directly. The score is the
  rules' points scaled to 100. In demo mode R4 compares a job of a few minutes with the accelerated norm (1 norm hour =
  2 minutes), so run the walkthrough with «Демо режим» on.
- The watchdog's retry for an order stuck in `ai_review` calls `ai-verify`, which arrives in Phase 4; until then that
  call returns 404 and nothing else happens. The client's own `ai_check_rules` call is what produces the review.
- Every new notification row is already sent to `notify-dispatch`. Without push tokens (Phase 3) it simply sends
  nothing.

## 4. Two devices on one Mac

- Two iOS simulators: boot a second one (`xcrun simctl boot "iPhone 16"`, or Xcode → Open Developer Tool →
  Simulator → File → Open Simulator), then `npx expo run:ios --device "iPhone 16"` installs the same dev build there.
  Both connect to the same Metro server.
- Or one simulator plus the web panel as the master, or an Android emulator (`npm run android`) when it exists.
- Record the walkthrough once with the simulator's screen recording (`xcrun simctl io <device> recordVideo <file>`) into
  `docs/screenshots/phase2-walkthrough.mp4` (git ignored if over 20 MB; then keep only a GIF).

## 5. Needs you

1. `supabase/manual/rota_remaining.sql` run once in the SQL Editor (PHASE_1 §2), if not done yet.
2. A second iPhone simulator (section 4), or an Android emulator.
3. Photos in the simulators' libraries: drag 4 or 5 images into each simulator window (a pump with an oil stain and
   the same pump clean work best).
4. Optional: `npx vercel login` if you want the web panel online tonight.

## 6. Guardrails

PHASE_0 §10 applies. In addition: never call the database with the secret key from an app; never edit anything under
`supabase/migrations`, `seed`, `manual`, `tests` or the two architect functions; database requests go to
`docs/db-requests.md`.

---

## 7. Walkthrough (the acceptance test)

Devices: A master Жумабаев 1001 (simulator 1), B worker Ахметов 2001 (simulator 2), the web panel signed in as 1001.
«Демо режим» on.

1. A: «Сбросить демо». Within 5 s A, B and the web show the start state: 9 workers on shift, Ахметов «Свободен»,
   Иванов «Выполняет наряд №…» (Конвейер К-2), Сериков «В очереди 2»; the board holds the 7 active demo orders, Абенов's
   with «Пауза: Ожидание запчастей»; the orders closed earlier today show in «Выполнены».
2. A: «Выдать» → «Аварийный» → Насос НШ-32 маслостанции → «Течь масла»; the AI card preselects Ахметов with reasons;
   a «до» photo; «Выдать». The tap counter shows at most 6 taps for the required fields.
3. B: within 5 s the red emergency screen (foreground) or the toast; «Принять» → «Начать исполнение». Within 5 s A shows
   Ахметов «Выполняет наряд №…» and the web board moves the card.
4. A: a second order to Ахметов, «Внеплановый», deadline «1 мин». B: «В очередь». At 30 s left B gets the reminder
   toast; within 5 s after the deadline A and B get the overdue toast in the case's wording, and the order shows in
   «Просрочены» on A and the web.
5. B: on the first order «Исполнено»: works text, Г-01, Кольцо уплотнительное 2 шт, Масло гидравлическое ВМГЗ 2 л,
   Ветошь 1 кг, an «после» photo, a comment; «Отправить на проверку». The review screen shows the checks within 3 s;
   the verdict is «Принято» or «Принято с замечаниями», never «Требует доработки» (rules only; the simulator's library
   photo costs 3 points of R2). A gets «ждёт вашей проверки», opens the review, «Согласен, закрыть». B sees it in
   «Закрытые» with the score.
6. Sign B out and in as Иванов 2002 (or use a third simulator). On the К-2 order: «Исполнено» without a photo,
   М-02, Подшипник 3626 × 6. Result: «Требует доработки» with «нет фото после: обязательно для внеплановых работ» and
   «перерасход: подшипник 3626 6 шт при норме до 2»; the order is «На доработку» on every screen.
7. Web: `/reports/shift` shows this shift with the new orders; `/reports/rating` for «Месяц» ranks Сериков low;
   `/analytics` for 3 months shows the К-3 card first; `/dashboard` tiles are filled.
8. Kill both apps and reopen: same state, no duplicate actions.

Run it twice with «Сбросить демо» between the runs. Write the timings of steps 3 and 5 (seconds from tap to the
other screen) into the report.
