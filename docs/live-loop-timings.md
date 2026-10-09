# Live loop timings on two simulators

Measured on 09.10.2026 while recording the demo film footage (`video/RECORDING.md`, take 2). Every interval below comes
from the screen recordings of that take and the tap log written while it ran; the server timestamps were read from the
database rows of the take before the demo reset deleted them. The film's take values live in `video/src/data/take.ts`.

## Setup

| | |
| --- | --- |
| Phone A | iPhone 17 Pro simulator, iOS 26.3, 1206 × 2622, мастер 1001 |
| Phone B | iPhone 16 simulator, iOS 18.6, 1179 × 2556, исполнитель 2001 (2002 for the rework order) |
| Build | Release build of `kz.rota.app` (`npx expo run:ios --configuration Release`), Expo SDK 57.0.27, React Native 0.86.3, from `main` at ff84883 (no app code changed since, up to 4214e06), `EXPO_PUBLIC_API_MODE=supabase` |
| Host | MacBook Pro (Mac16,1, Apple M4), macOS 15.6, Xcode 26.3; both simulators share the Mac's network |
| Network | Wi-Fi (en0) to Supabase Cloud, project `wcjklkpkuhxgfdtbwbuk`, eu-central-1. HTTPS round trip to the project's REST endpoint at 09:3x local time (10 requests without a session, answer 401): min 0.25 s, median 0.35 s, max 0.55 s |
| Database settings | `demo_mode` on during the take (the «1 мин» deadline and the accelerated norm), `demo_time_scale` 1 |
| AI | `ai-verify` with `claude-sonnet-5-5` (the model name stored in `ai_reviews.model`) |

## How it was measured

- Taps were injected with a small HID driver built on idb_companion 1.1.8's FBSimulatorControl (the iOS Simulator tool of
  this session kept crashing). Each tap is a touch down, 70 ms, touch up; the driver prints the Unix time after the touch
  up. Buttons act on touch up.
- Both simulators were recorded for the whole take with `xcrun simctl io <udid> recordVideo --codec=h264`, started in one
  command (A and B started 2 ms apart). Video time 0 is the moment each recorder printed «Recording started».
- The recorder writes variable frame rate H.264 with B-frames and broken decode timestamps (dts up to 145 s behind pts);
  ffmpeg then guesses wrong frame times unless the input is read with `-fflags +igndts`. All frame times below were read
  that way and cross-checked against a 30 fps re-encode (agreement within one frame, 33 ms).
- An interval ends at the first frame after the tap whose screen region (the status pill, the toast area or the whole
  screen) differs from the last frame before the tap. Frames arrive at up to 60 fps while the screen changes, so the end
  point is exact to about 17 ms.
- Clock alignment check: a tab switch inside the app showed on the recording 48 ms (B) and 61 ms (A) after its tap, so
  the tap log and the recordings agree to well under 0.1 s.
- Server times come from one clock (the database) and are exact among themselves. Mapping them onto the video needs the
  offset between the Mac and the server; every tap → server row → screen change chain of the take bounds that offset to
  between −0.16 s and +0.12 s. Intervals that mix the two clocks are given as a range with that bound.

## Phone to phone (one clock: the Mac)

| # | From | To | Interval |
| --- | --- | --- | --- |
| 1 | A taps «Выдать» (emergency order №660) | B starts showing the red emergency screen | **0.72 s** |
| 2 | B taps «Принять» | A's order card shows «Принят в работу» | **1.39 s** |
| 3 | B taps «Начать исполнение» | A's order card shows «В работе» | **1.15 s** |
| 4 | A taps «Выдать» (order №661, «1 мин» deadline) | B shows the toast «Новый наряд №661» | **1.40 s** |
| 5 | B taps «В очередь» | B's own status pill shows «В очереди» (the button spins until then) | **2.56 s** |
| 6 | B taps «Отправить на проверку» (№660, with the after photo) | B shows the verdict «Ждёт подтверждения мастера», 84 | **8.49 s** |
| 7 | the same tap | A shows the toast «Проверка ИИ №660» | **8.63 s** |
| 8 | A taps «Согласен, закрыть» | B shows the toast «Закрыт №660» | **0.71 s** |
| 9 | the same tap | B's report title changes to «Наряд закрыт» | **1.25 s** |
| 10 | B (as 2002) taps «Отправить без фото» (№641, 6 × подшипник 3626) | B shows «Нужна доработка», 45 | **8.32 s** |
| 11 | A taps «Выдать» in the tab bar | A taps the final «Выдать» of №660 (emergency, before photo from the library) | 15.46 s; the app's own counter said «Выдан за 6 нажатий · 0:15» |

## Server side (one clock: the database)

| Event | Time (UTC) | Interval |
| --- | --- | --- |
| №660 `complete` → `ai_result` | 04:04:46.749 → 04:04:54.744 | **8.00 s**, of which the model call 6.38 s (`ai_reviews.latency_ms` 6382) |
| №641 `complete` → `ai_result` | 04:07:57.716 → 04:08:05.415 | **7.70 s**, of which the model call 6.52 s (`latency_ms` 6524) |
| №661 reminder row | 04:01:48.284, `due_at` 04:02:14.150 | **25.9 s** before the deadline (watchdog every 5 s, threshold 30 s on a 1 minute order) |
| №661 overdue rows (assignee and master, one key) | 04:02:18.495 | **4.35 s** after the deadline |

## Deadline messages on the phones (two clocks, bounded)

| Event | Video time | Relative to the deadline of №661 |
| --- | --- | --- |
| B shows «Скоро срок №661» | B 201.21 s | 25.1 to 25.4 s before |
| A shows «Просрочен №661» | A 230.95 s | 4.35 to 4.62 s after |
| B shows «Просрочен №661» | B 230.98 s | 4.37 to 4.64 s after; A and B 0.025 s apart |

The case asks for status changes on other devices within 5 s: intervals 1 to 4, 8 and 9 and both overdue messages are
inside it. Interval 5 is the worker's own screen, 2.0 to 2.3 s after the server already had the `queued` row.

## Event log of the take

Video times are seconds from «Recording started» (A 03:58:27.656 UTC, B 03:58:27.658 UTC). Server times are the rows of
`orders`, `order_events`, `notifications` and `ai_reviews` for №660, №661 and №641 as read at 04:10 UTC.

| Video (s) | Device | Event |
| --- | --- | --- |
| 5.539 | A | tap «Выдать» (tab bar) |
| 20.998 | A | tap «Выдать» (create №660) |
| 21.206 + offset | server | `orders.created_at` №660, `emergency` notification |
| 21.713 | B | red screen starts |
| 67.816 | B | tap «Принять» |
| 68.049 + offset | server | `accepted_at` |
| 69.210 | A | pill «Принят в работу» |
| 71.602 | B | tap «Начать исполнение» |
| 71.761 + offset | server | `started_at` |
| 72.747 | A | pill «В работе» |
| 166.158 | A | tap «Выдать» (create №661) |
| 166.492 + offset | server | `orders.created_at` №661 |
| 167.560 | B | toast «Новый наряд №661» |
| 184.978 | B | tap «В очередь» |
| 185.428 + offset | server | `queued_at` |
| 187.537 | B | pill «В очереди» |
| 200.626 + offset | server | reminder row |
| 201.207 | B | toast «Скоро срок №661» |
| 226.492 + offset | server | `due_at` №661 |
| 230.837 + offset | server | overdue rows |
| 230.952 | A | toast «Просрочен №661» |
| 230.977 | B | toast «Просрочен №661» |
| 378.890 | B | tap «Отправить на проверку» (№660) |
| 379.091 + offset | server | `done_at`, `review_started` |
| 387.086 + offset | server | `ai_result`, `review_ready` and `report` rows |
| 387.383 | B | verdict 84 «Принято» |
| 387.520 | A | toast «Проверка ИИ №660» |
| 441.184 | A | tap «Согласен, закрыть» |
| 441.543 + offset | server | `closed_at` |
| 441.892 | B | toast «Закрыт №660» |
| 442.433 | B | title «Наряд закрыт» |
| 569.789 | B | tap «Отправить без фото» (№641, signed in as 2002) |
| 570.058 + offset | server | `done_at` №641 |
| 577.757 + offset | server | `ai_result` rework |
| 578.107 | B | verdict 45 «Требует доработки» |

The offset is between −0.16 s and +0.12 s (see «How it was measured»).

## Compared with the two browser run

`docs/progress.md` (P7) records the same loop between two browsers on the PWA: red screen 1.9 s, «Принят в работу»
0.97 s, «В работе» 1.1 s, AI verdict 9.5 s, «Закрыт» 0.8 s. On the simulators: 0.72 s, 1.39 s, 1.15 s, 8.49 s, 0.71 s.
One run each, so they show the range, not a trend.

## Files

- Raw takes (git ignored, on the recording Mac): `video/public/footage/raw/A-take2.mp4`, `B-take2.mp4`, and their 30 fps
  re-encodes `A-take2-cfr.mp4`, `B-take2-cfr.mp4` (read the raw files with `-fflags +igndts`).
- Cut scenes: `video/public/footage/s01-cold-open-B.mp4` … `s09-rework-A.mp4`.
