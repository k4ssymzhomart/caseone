# Recording the real footage

The film renders today from the stills. This is the plan to replace them with screen recordings of the live product, one
scene at a time: drop a file into `public/footage/` under the name below and the scene plays it instead of the stills
(`src/data/footage.ts`). Nothing else changes. After a session, update `src/data/take.ts` (order numbers, score,
confidence, the second order's unit and times) so the captions agree with the recorded screens.

## Setup

- Two simulators booted side by side, both running the **Release** build of `kz.rota.app` against the live database
  (`apps/mobile/.env`: `EXPO_PUBLIC_API_MODE=supabase`):
  - **A** · iPhone 17 Pro (1206 × 2622) · мастер **1001 / 1111**
  - **B** · iPhone 16 (1179 × 2556) · исполнитель **2001 / 1234**
  - **C** · for the rework scene: B signs out and back in as **2002 / 1234** (the login screen has the chip «Иванов 2002»),
    or boot a third simulator.

  ```sh
  cd apps/mobile
  npx expo run:ios --configuration Release --device "iPhone 17 Pro"
  npx expo run:ios --configuration Release --device "iPhone 16"
  ```

- Device ids and a clean status bar (9:41, full battery) so every take looks the same:

  ```sh
  A=$(xcrun simctl list devices booted | awk -F '[()]' '/iPhone 17 Pro /{print $2; exit}')
  B=$(xcrun simctl list devices booted | awk -F '[()]' '/iPhone 16 /{print $2; exit}')
  for d in $A $B; do
    xcrun simctl status_bar $d override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4
  done
  ```

- Photos for the library (the simulator has no camera, so the app takes «до» and «после» from the library; a phone uses
  the camera). The pump pictures of the golden set match «Насос НШ-32 маслостанции»:

  ```sh
  xcrun simctl addmedia $A supabase/functions/ai-verify/golden/photos/pump_leak_a.png
  xcrun simctl addmedia $B supabase/functions/ai-verify/golden/photos/pump_clean_a.png
  ```

- Both phones signed in, notifications allowed, B on shift. Haptics and sound do not record on the simulator; the film
  has no sound track from the phones anyway.

## Reset before every take

1. Phone A → «Профиль» → «Инструменты» → «Демо» → «Сбросить демо» → «Сбросить» (`rpc('demo_reset')`: the start state of
   CLAUDE.md §20, no pushes). The web panel has the same button at `/demo`.
2. On the same screen: «Демо режим» **on** (the «1 мин» deadline, the accelerated norm, the tap counter), «Ускорение
   времени ×10» **off**.
3. Pull to refresh on B: Ахметов free, Иванов on «Конвейер К-2», Ким and Касымов free.

## Recording

Record each simulator for the whole take, one file per device, then cut the scenes out. Start both recordings in one
command so they share a clock:

```sh
mkdir -p video/public/footage/raw
xcrun simctl io $A recordVideo --codec=h264 --force video/public/footage/raw/A-take1.mp4 &
xcrun simctl io $B recordVideo --codec=h264 --force video/public/footage/raw/B-take1.mp4 &
# … perform the script below …
kill -INT %1 %2   # Ctrl+C equivalent: finishes and closes both files
```

Write down the take's clock (a phone stopwatch or the terminal time) at each step in the table below; those become the
cut points.

## Taps per scene

| Scene | Slot file(s) | Device | Taps and waits | Lands on screen |
| --- | --- | --- | --- | --- |
| s01 cold open (optional) | `s01-cold-open-B.mp4` | B | nothing: let the red screen and siren play 5 s, then «Принять» | `09-worker-emergency` |
| s03 issue | `s03-issue.mp4` | A | on «Смена»: 1 «Выдать» (tab bar) · 2 «Аварийный» · 3 «Насос НШ-32 маслостанции» (if it is not in the first row, the area chip «Участок обогащения» first) · 4 «Течь масла» · optional «Фото до» → library → the leak photo · 5 «Выдать». Keep the AI pick Ахметов Е. | the toast «Наряд выдан» on «Смена» |
| s04 accept | `s04-accept-A.mp4`, `s04-accept-B.mp4` | A + B | A: open the new order from «Доска». B: the red screen arrives with the siren; wait 2 s; «Принять» · «Начать исполнение». A: watch the status change to «Принят в работу», then «В работе» | A order card, B order in progress |
| s05 deadline | `s05-deadline-A.mp4`, `s05-deadline-B.mp4` | A + B | A: «Выдать» · «Внеплановый» · «Насос водоотлива ЦНС-300 №2» · a problem chip · «Другой исполнитель» → Ахметов Е. · «Срок» → «1 мин» · «Выдать». B: open the new order · «В очередь». Then wait: the reminder at 30 s left on B, the overdue message on A and B within 5 s of the deadline | the toasts «Скоро срок №…», «Просрочен №…» |
| s06 close | `s06-close.mp4` | B | the order №… in work → «Исполнено» · works text «Заменил кольца и масло, устранил течь по фланцу» · Г-01 (the hint is preselected) · materials: Кольцо уплотнительное 2 шт, Масло гидравлическое ВМГЗ 2 л, Ветошь 1 кг · «Фото после» → library → the clean pump · comment «Утечки нет» · «Отправить на проверку» | «ИИ проверяет наряд» |
| s07 check | `s07-check.mp4` | B | nothing: keep recording until the verdict appears (about 10 s) | the worker report |
| s08 verdict | `s08-verdict-A.mp4`, `s08-verdict-B.mp4` | A + B | A: the toast «Проверка ИИ №…» → «Открыть» (or the order → «Отчёт ИИ»), scroll to the photos and «Материалы и норма», «Согласен, закрыть». B: stays on the report, then the toast «Закрыт №…» | A «Закрыт», B «Наряд закрыт» |
| s09 rework | `s09-rework-C.mp4`, `s09-rework-A.mp4` | C + A | C (2002): «Конвейер К-2» → «Исполнено» · works text · М-02 · Подшипник 3626 «+» to 6 (the form warns «Больше нормы: до 2») · no photo · «Отправить на проверку» → «Нужна доработка». A: «Доска» → «В работе» → «Конвейер К-2» → the two reasons | the reasons «нет фото после», «перерасход: подшипник 3626 6 шт при норме до 2» |

After the take: update `src/data/take.ts` with the order numbers, the score and confidence of №… and the rework score
from the screens.

## Cutting the scenes

Use Remotion's bundled ffmpeg (no install needed). It ships only a few filters (no `fps`, `format`, `select`), so the
output options do the conversion: `-r 30` turns the simulator's variable frame rate into 30 fps, `-pix_fmt yuv420p`
keeps every player happy, `-an` drops audio. The side by side pairs use the same start and end on both files:

```sh
cd video
npx remotion ffmpeg -y -ss 00:00:12.0 -to 00:00:30.0 -i public/footage/raw/A-take1.mp4 \
  -r 30 -pix_fmt yuv420p -c:v libx264 -crf 16 -an public/footage/s03-issue.mp4
```

The deadline scene keeps four short moments of a two minute wait (issue, «В очередь», the reminder, the overdue
message): cut each moment, then join them with the concat demuxer:

```sh
cd video/public/footage/raw
for p in 62:66 70:72 98:101 128:133; do   # start:end in seconds of the raw take (bash and zsh)
  s=${p%%:*}; e=${p##*:}
  npx remotion ffmpeg -y -ss $s -to $e -i A-take1.mp4 -r 30 -pix_fmt yuv420p -c:v libx264 -crf 16 -an A-part-$s.mp4
done
printf "file '%s'\n" A-part-62.mp4 A-part-70.mp4 A-part-98.mp4 A-part-128.mp4 > A-parts.txt
npx remotion ffmpeg -y -f concat -safe 0 -i A-parts.txt -c copy ../s05-deadline-A.mp4
```

A scene shorter than its slot holds the last frame; a longer one is cut by the scene. Fine tune the start with
`trimBefore` (seconds) and a slow wait with `playbackRate` in `src/data/footage.ts`, then check the scene in the Studio
(`npm run dev`, folder «Scenes»).

## The web panel

`scripts/record-web.mjs` opens Chrome with a 1440 × 900 viewport at device scale 2 (frames of 2880 × 1800), records the
page through the DevTools Protocol and encodes a constant 30 fps MP4 with `npx remotion ffmpeg`. By default it takes
`Page.captureScreenshot` frames back to back, each stamped with its time (about 20 frames a second at full size, which
works headed and headless); `--screencast` switches to `Page.startScreencast`, which sends a frame only when the page
repaints. You drive the page by hand in the window that opens; Ctrl+C stops and encodes. Checked on 09.10.2026 against an
animated local page: 3 s, 45 frames, motion intact, 2880 × 1800 at 30 fps.

```sh
cd video
# once: sign in as 1001 / 1111, then Ctrl+C (the session stays in .rec-profile, git ignored)
node scripts/record-web.mjs https://rota-naryad.netlify.app/login /tmp/signin.mp4 --profile=.rec-profile
# each take starts signed in
node scripts/record-web.mjs https://rota-naryad.netlify.app/reports/shift public/footage/s10-shift-report-web.mp4 --profile=.rec-profile
```

| Scene | Slot file | Account | What to do |
| --- | --- | --- | --- |
| s10 shift report | `s10-shift-report-web.mp4` | 1001 / 1111 | `/reports/shift`, period «Смена»; wait for «Сводка ИИ»; scroll slowly to «Загрузка исполнителей» and «Простой оборудования» |
| s11 rating | `s11-rating-web.mp4` | 1001 / 1111 | `/reports/rating`, period «Месяц»; hold on the chart 2 s; scroll to the last row «Сериков Д.» |
| s12 analytics | `s12-analytics-web.mp4` | 1001 / 1111 | `/analytics`, period «Месяц»; type «покажи проблемы участка дробления за месяц»; «Спросить»; wait for the cards (up to 30 s; cut the wait out as in the deadline scene); hold on the К-3 card |

The first second of every take is the page loading; `trimBefore` in `src/data/footage.ts` skips it.

## Render

```sh
cd video
npm run render:draft   # 1280 × 720 → out/rota-demo-draft.mp4
npm run render         # 1920 × 1080 → out/rota-demo.mp4
npm run stills -- out/stills 10 45 90   # single frames for review (seconds)
```

On this Mac the downloaded chrome-headless-shell never fires `requestAnimationFrame` and the render waits forever for the
root component; `remotion.config.ts` and the scripts use the installed Google Chrome instead (`REMOTION_CHROME` picks
another binary, `REMOTION_CHROME=bundled` goes back to Remotion's).
