# Rota · demo film storyboard

The film for Demo Day (16.10.2026) and for the deliverable «демо видео ≤ 3 мин» (case §12). It follows the Demo Day
script (CLAUDE.md §20) compressed into 2:58: the live loop on two phones, the AI check, the rework case, the web panel,
the architecture with the privacy gateway and the measured numbers. Every product scene plays the real recordings of
09.10.2026 (`public/footage/`).

| | |
| --- | --- |
| Length | 2:58.5 (5 356 frames), under the 3:00 limit |
| Format | 1920 × 1080, 30 fps, H.264 (`RotaDemo`); draft 1280 × 720 (`RotaDemoDraft`) |
| Sound | no voice; captions in Russian on screen. An optional music bed plays if `public/audio/music.mp3` exists |
| Style | Rota dark canvas, signal red `#FF3B30`, Inter for words, Geist Mono for numbers and eyebrows, glass cards, dark mascots on the problem, privacy and outro beats, real platform logos where a platform is named |
| Footage | `public/footage/<scene>.mp4` (or `-A`, `-B`, `-C`, `-web` per screen); `src/data/footage.ts` holds each clip's cut, speed and (web) camera. Without a file the scene falls back to the stills from `docs/screenshots/presentation` |
| Chrome | from 0:20 to 2:22 a small Rota lockup top left, «Кейс 1 · НарядAI» top right and a chapter bar at the bottom: Выдача · Принятие · Сроки · Закрытие · Проверка ИИ · Вердикт · Доработка · Отчёт смены · Рейтинг · Сводка · Аналитика |

Rules the film keeps:

- Every number on screen is measured and listed with its source in `src/data/numbers.ts` (table at the end), or read off
  the recording it sits next to. No estimates, no invented customers, pilots, users or awards. Values tied to the take
  (order №, score, confidence, texts of the review) live in `src/data/take.ts`.
- Captions agree with the footage beside them: they appear on the frame where the phone or page shows the same thing
  (each scene names the clip seconds it syncs to), and cut waits are said on screen («ожидание вырезано»).
- Captions follow the UI copy rules: sentence case, no dashes, fault codes keep their hyphen (М-02, Г-01).
- The deadline message card is printed by the app's own templates (`packages/shared/src/domain/templates.ts`), word for
  word, so it matches what the phones show.
- Web clips are 16:9 in a 16:9 window (nothing cropped) and zoomed where the text matters, so it reads at 1080p; a
  zoomed view never shows a sliver of the panel's sidebar.

Devices and accounts (the same as the Demo Day script):

| Letter | Device | Account | Role |
| --- | --- | --- | --- |
| A | iPhone 17 Pro simulator, iOS 26.3 | 1001 / 1111 | мастер Жумабаев Н. |
| B | iPhone 16 simulator, iOS 18.6 | 2001 / 1234 | исполнитель Ахметов Е. |
| C | phone B signed in again | 2002 / 1234 | исполнитель Иванов С. |
| web | Chrome, 1440 × 810 page | 1001 (shift, rating), 3001 (dashboard, analytics), 9001 (AI log) | мастер, руководитель, админ |

## Scenes

Timecodes are positions in the finished film; neighbouring scenes cross fade for 0.4 s. Clip times are seconds of the
file in `public/footage/`.

### 1 · Cold open · 0:00 · 8 s · `s01-cold-open`

- Footage: `s01-cold-open-B.mp4`, B's red screen of №660 with the before photo (the phone leaves before «Принять»).
- Captions: «Аварийный наряд №660» · «Насос НШ-32 маслостанции» · «Течь масла · участок обогащения» · «Сирена звучит,
  пока исполнитель не ответит». Then «Qostanai Industry Hackathon 2026 · Кейс 1 «НарядAI»», the lockup, «Наряд выдан, ИИ
  на контроле», «АО «Костанайские Минералы» · Demo Day 16.10.2026».

### 2 · The problem · 0:08 · 12.7 s · `s02-problem`

- Motion graphics from the case PDF, section 2: three beats of 3.9 s that cross into each other («По рации и на
  бумаге.», «Сроки никто не видит.», «Качество не проверить.») and the bridge «Rota переводит наряд в телефон и ставит
  ИИ на контроль».

### 3 · The master issues an emergency order · 0:20 · 18 s · `s03-issue`

- Footage: `s03-issue.mp4` from 1.2 s, real speed. Taps at 2.07 «Выдать», 4.15 «Аварийный», 6.80 «Насос НШ-32
  маслостанции», 9.60 «Течь масла», 14.68 «Фото до», 17.53 «Выдать»; the toast «№660 · Выдан за 6 нажатий · 0:15».
- Captions: «Аварийный наряд за 6 нажатий и 15 с» · «Требование кейса: не больше 6 нажатий и 1 минуты. Шестое
  нажатие здесь «Фото до»: без фото хватает пяти.» · the six taps light up on their frames · the app's counter mirrored
  («5 нажатий · 0:14» …) · from 10.6 s the AI card «Ахметов Е. · Свободен · Слесарь 5 разряда · 6 нарядов по насосам,
  средняя оценка 4,4 · сегодня работал на этом участке» (the same reasons as the phone).

### 4 · The worker answers · 0:37 · 15 s · `s04-accept`

- Footage: `s04-accept-A.mp4` and `-B.mp4`, recorded together. A taps «Выдать» at 0.38, B's red screen at 1.10,
  «Принять» 7.21 (A «Принят в работу» 8.60), «Начать исполнение» 10.98 (A «В работе» 12.13).
- Captions: «Красный экран и сирена» · a stopwatch that runs from A's tap and stops at **0,72 с** when B turns red ·
  «Принять» → «Принят в работу» **1,39 с**, «Начать исполнение» → «В работе» **1,15 с** · Supabase «Realtime» ·
  «Требование кейса: статус за 5 с». The red glow behind B lasts from the red screen to «Принять».

### 5 · Deadline control · 0:52 · 14 s · `s05-deadline`

- Footage: `s05-deadline-A.mp4` and `-B.mp4`, four moments of the two minute wait for №661 (cuts at 2.7, 7.6 and
  10.2 s): issue with the «1 мин» deadline, «В очередь», the reminder, the overdue message on both phones.
- Captions: a clock that shows the real time left at each moment (01:00 → 00:57, 00:42 → 00:38, 00:25 → 00:22,
  +00:04 → +00:08) with «ожидание вырезано» · chips «проверка каждые 5 с», «напоминание за 25 с», «просрочка через
  4,6 с», «эскалация мастеру» · the template messages «Скоро срок №661 …» and «Просрочен №661 · исполнителю и мастеру …
  Статус: В очереди с 09:01.»

### 6 · Closing with a photo · 1:06 · 8.6 s · `s06-close`

- Footage: `s06-close.mp4`, B closes №660: works text, Г-01 (2.7 s), rings 2 шт, ВМГЗ 2 л, ветошь 1 кг (3.8 s), the after
  photo (6 s), «Утечки нет», «Отправить на проверку» (7.9 s).
- Captions: «Г-01 · Шифр из справочника» · «Материалы рядом с нормой» · «Фото после: сжатие и хеш · … Здесь снимок из
  галереи: проверка это отметит.» · «Фото после обязательно для внеплановых работ: так требует кейс.»

### 7 · The AI check · 1:14 · 9 s · `s07-check`

- Footage: `s07-check.mp4`, B on «ИИ проверяет наряд»; the phone ticks report, photo and materials at 0.5, 1.4 and 2.2 s;
  the verdict 84 «Принято» lands at 7.4 s.
- Captions: the rules card fills in step with the phone: ✓ Полнота отчёта 20 из 20, ! Подлинность фото · из галереи
  7 из 10, ✓ Материалы в норме 15 из 15, and at the verdict ! Время и срок · 5 мин при нормативе 3, 10 из 20 · the
  Claude card fills at the verdict: работы 20 из 20, фото после 12 из 15 · a stopwatch from 1,1 с (the clip starts 1.09 s
  after the tap) that stops at **8,5 с** on the verdict frame.

### 8 · Verdict and the master's word · 1:22 · 10.5 s · `s08-verdict`

- Footage: `s08-verdict-A.mp4` and `-B.mp4` from 0.9 s: A's AI report (84, уверенность 85%, claude-sonnet-5-5, photos,
  materials and norm), «Согласен, закрыть» at 8.29 s; B «Закрыт №660» at 9.00 s, «Наряд закрыт» 9.53 s.
- Captions: **84** из 100 «Принято» · «уверенность 85% · ниже 60% решает мастер» · «Вывод ИИ»: «Работы соответствуют
  описанной проблеме, по фото течь устранена, место чистое, шифр и материалы в норме.» · ✓ Что хорошо: «Течь
  устранена, пол после работ чистый.» · ! Что улучшить: «Опишите работы подробнее: какие кольца и где заменены, сколько
  масла долито.» · «Последнее слово за мастером» · «Согласен, закрыть» → «Закрыт» (lights when B shows it).

### 9 · Rework · 1:33 · 14 s · `s09-rework`

- Footage: `s09-rework-C.mp4` from 0.2 s (2002 closes №641, Конвейер К-2: bearings to 6 with «Больше нормы: до 2»,
  «Отправить без фото», verdict 45 at 9.3 s; the 8.3 s wait is cut). `s09-rework-A.mp4` was recorded after the
  verdict, so phone A slides in only then, from 2.4 s at 1.4×: the board with К-2 «На доработку», then the reasons.
- Captions: before the verdict «Форма предупреждает» and «Отправить без фото после?»; then **45** из 100 «Требует
  доработки» · «вердикт через 8,3 с · ожидание вырезано» · ✕ «Полнота отчёта: нет фото после: обязательно для
  внеплановых работ» · ✕ «Материалы: перерасход: подшипник 3626 6 шт при норме до 2» · «Жёсткие отказы решают
  правила, не модель …»

### 10 · Shift report · 1:46 · 10 s · `s10-shift-report`

- Footage: `s10-shift-report-web.mp4`, master 1001, night shift 08.10 20:00 to 08:00 (page clock pinned to 07:59,
  RECORDING.md): counters (0 to 2.4 s, real speed), the «Сводка ИИ» (2.4 to 8.3 s at 1.25×, zoomed to read), workload
  and downtime (8.3 to 12.6 s at 1.6×).
- Captions: the summary's first two sentences word for word: «За ночную смену выдано 18 нарядов, принято в работу 16,
  исполнено и закрыто 12. Просроченных и отклонённых нарядов нет, в срок выполнено 100% исполненных нарядов.» · PDF and
  Excel · «Отчёт смены совпал с ручным подсчётом в SQL во всех 5 окнах проверки.»

### 11 · Rating · 1:56 · 9.7 s · `s11-rating`

- Footage: `s11-rating-web.mp4`, «Месяц»: the chart and Сериков's tooltip (0 to 6 s at 1.25×, zoom on the tooltip), the
  table down to his row (6 to 14.6 s at 1.75×).
- Captions: the weights 35 / 25 / 20 / 10 / 10 · «Сериков Д. · 15 место из 15 за месяц · 73% с первого раза» · «За
  92 дня 64,7% при 91,3% у команды: больше трети его ремонтов не с первого раза.»

### 12 · Dashboard · 2:05 · 6.5 s · `s12-dashboard`

- Footage: `s12-dashboard-web.mp4`, руководитель 3001, «Месяц», 2× (tiles, then the top 5 units and the best workers).
- Captions, read off the clip: «7 · 0 в работе · просрочено», «12 мин реакция», «89% в срок, закрыто 178 нарядов»,
  «32,3 ч простой Конвейера К-3, 7 внеплановых», «91,1 лучший исполнитель, Петренко В.»

### 13 · AI analytics · 2:11 · 11.5 s · `s12-analytics`

- Footage: `s12-analytics-web.mp4`, руководитель 3001: typing the question (2.6 to 8.8 s at 2×), «Спросить», the answer
  with «Вопрос понят так · За 30 дней · Участок дробления» and the К-3 card (8.8 to 16.6 s at 1.6×, zoomed on the card),
  «Доказательства · 7 нарядов» (16.6 to 21.2 s at 1.4×). The take replays the cached answer («Сохранённый ответ»).
- Captions: «Спросите обычными словами» · Haiku, SQL detectors, Sonnet · «У каждого вывода рекомендация и
  доказательства» · **22 из 22** pattern measures.

### 14 · Architecture · 2:22 · 10 s · `s13-architecture`

- The animated diagram from `docs/architecture.md`: phones and web panel, Supabase with Postgres 17, the privacy gateway,
  Claude, Push · FCM, Telegram without names, 1С:ТОиР; footer «Supabase с открытым кодом на своих серверах или в облаке
  РК, закон 94-V» · «Статусы только по часам сервера · каждое действие идемпотентно · RLS по ролям».

### 15 · Privacy gateway · 2:32 · 9.5 s · `s13-privacy`

- Footage: `s13-privacy-web.mp4` at 1.45×, admin 9001 on «Что видит ИИ» (`/admin/ai`): the intro card, the filter
  «Проверка наряда», request №47 (the check of №660), the message zoomed to «Исполнитель: E01, слесарь, 5 разряд».
- Captions: «Модель не видит людей» · «Ахметов Е.» → **E01**, «Жумабаев Н.» → **M01** · «Фамилии, табельные номера и
  телефоны заменяются до отправки …» · «Запрос №47 · наряд №660 · claude-sonnet-5-5 · 6,2 с · 0,0162 USD» (the header
  of the request on screen).

### 16 · Numbers · 2:41 · 10 s · `s14-numbers`

- Two pages of four tiles, each with its source file: «Быстрый контур, точный ИИ»: 10 из 10 · 0,72 с · 8,5 с ·
  0,016 USD; «Данные и надёжность»: 540 · 22 из 22 · 5 из 5 · 660.

### 17 · Outro · 2:50 · 8 s · `s15-outro`

- Wallpaper, the lockup, «Наряд выдан, ИИ на контроле», the four links with logos (rota-naryad.netlify.app,
  rota-naryad.netlify.app/app, the APK on expo.dev, github.com/k4ssymzhomart/caseone), the test accounts, mascot `wave`.

## Numbers and their sources

| On screen | What it measures | Source |
| --- | --- | --- |
| 6 нажатий, 15 с | the issue of №660 by the app's own counter («Выдан за 6 нажатий · 0:15») | `s03-issue.mp4`; `docs/live-loop-timings.md`, interval 11 |
| 0,72 с | «Выдать» on A to the red screen on B, the film's take | `docs/live-loop-timings.md`, interval 1 |
| 1,39 с, 1,15 с | «Принять» and «Начать исполнение» on B to the status on A | `docs/live-loop-timings.md`, intervals 2 and 3 |
| 25 с, 4,6 с | the reminder before the deadline of №661 (25,1 to 25,4 s); the overdue message on both phones after it (4,35 to 4,64 s) | `docs/live-loop-timings.md`, deadline messages |
| 8,5 с | «Отправить на проверку» to the verdict on B (8,49 s; server 8,00 s, model 6,38 s) | `docs/live-loop-timings.md`, interval 6 |
| 8,3 с | the same for the rework order №641 (8,32 s) | `docs/live-loop-timings.md`, interval 10 |
| 84, 85%, 45; 20/7/15/10 and 20/12 | score, confidence and rework score of the take; the review's rule and model points | `src/data/take.ts` (the screens of `s07`, `s08`, `s09`) |
| 18, 16, 12, 100% | the night shift 08.10 in the AI summary and on the counters | `s10-shift-report-web.mp4` |
| 73%, 15 из 15 | Сериков Д. first time fix and place for the month | `s11-rating-web.mp4` |
| 64,7% / 91,3% | Сериков Д. first time fix against the team median, 92 days | `docs/phase5-acceptance.md` |
| 7 · 0, 12 мин, 89%, 178, 32,3 ч, 91,1 | the dashboard tiles and tables for the month | `s12-dashboard-web.mp4` |
| 0,0162 USD, 6,2 с | the model call of the check of №660 as the AI log shows it | `s13-privacy-web.mp4` |
| 10 из 10 | golden set, expected verdict, Claude Sonnet 5.5, prompt p0.2 | `docs/golden-results.md` |
| 0,016 USD | mean cost per case of the live golden run (0.1619 USD for 10 cases) | `docs/golden-results.md` |
| 540 | history orders over 92 days with the planted patterns (non demo; the database holds 559 with the 19 Demo Day start orders) | `docs/progress.md`, live count 09.10.2026 |
| 22 из 22 | pattern measures P1 to P6 within ±20% of the answer key | `docs/phase6-acceptance.md` |
| 5 из 5 | windows where `shift_report` equals the manual SQL count | `docs/phase5-acceptance.md` |
| 660 | automated tests passing (`npx vitest run`, 09.10.2026 07:37: 660 passed, 1 skipped, 35 files) | measured for this film |

The earlier two browser run of the same loop (`docs/progress.md`, P7: red screen 1,9 s, verdict 9,5 s) is kept in
`docs/live-loop-timings.md` for comparison; the film shows the take it plays.

Not in the film on purpose: business effect estimates (they belong in the README or slides, titled as an estimate with
their assumptions), the 5 s and 6 tap limits as measurements (they appear only as «Требование кейса»), any customer
endorsement.
