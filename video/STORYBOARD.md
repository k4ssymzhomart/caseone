# Rota · demo film storyboard

The film for Demo Day (16.10.2026) and for the deliverable «демо видео ≤ 3 мин» (case §12). It follows the Demo Day
script (CLAUDE.md §20) compressed into 2:55: the live loop on two phones, the AI check, the rework case, the web panel,
the architecture and the measured numbers.

| | |
| --- | --- |
| Length | 2:55.4 (5 262 frames), under the 3:00 limit |
| Format | 1920 × 1080, 30 fps, H.264 (`RotaDemo`); draft 1280 × 720 (`RotaDemoDraft`) |
| Sound | no voice; captions in Russian on screen. An optional music bed plays if `public/audio/music.mp3` exists |
| Style | Rota dark canvas, signal red `#FF3B30`, Inter for words, Geist Mono for numbers and eyebrows, glass cards, dark mascots on the problem, privacy and outro beats, real platform logos where a platform is named |
| Footage | `public/footage/<scene>.mp4` (or `-A`, `-B`, `-C`, `-web` per screen) when recorded (RECORDING.md); otherwise the real stills from `docs/screenshots/presentation` |
| Chrome | from 0:22 to 2:17 a small Rota lockup top left, «Кейс 1 · НарядAI» top right and a chapter bar at the bottom: Выдача · Принятие · Сроки · Закрытие · Проверка ИИ · Вердикт · Доработка · Отчёт смены · Рейтинг · Аналитика |

Rules the film keeps:

- Every number on screen is measured and listed with its source in `src/data/numbers.ts` (table at the end). No
  estimates, no invented customers, pilots, users or awards. Values tied to one take (order №, score, confidence) live in
  `src/data/take.ts` and are updated to match the recorded screens.
- Captions follow the UI copy rules: sentence case, no dashes, fault codes keep their hyphen (М-02, Г-01).
- Toast texts over stills are printed by the app's own templates (`packages/shared/src/domain/templates.ts`), word for
  word, so they match what the phones show.

Devices and accounts (the same as the Demo Day script):

| Letter | Device | Account | Role |
| --- | --- | --- | --- |
| A | iPhone 17 Pro simulator (or Android phone A) | 1001 / 1111 | мастер Жумабаев Н. |
| B | iPhone 16 simulator (or Android phone B) | 2001 / 1234 | исполнитель Ахметов Е. |
| C | phone B signed in again, or a third phone | 2002 / 1234 | исполнитель Иванов С. |
| web | Chrome 1440 × 900 | 1001 / 1111 (shift, rating, analytics) | мастер |

## Scenes

Timecodes are positions in the finished film; neighbouring scenes cross fade for 0.4 s.

### 1 · Cold open · 0:00 · 8 s · `s01-cold-open`

- Footage: phone B, the red emergency screen with the siren, one tap on «Принять». Slot `s01-cold-open-B.mp4`
  (optional; the still `pwa/06-B-emergency-red-screen.png`, the red screen with the before photo, is the fallback).
- Captions: «Аварийный наряд №661» · «Насос НШ-32 маслостанции» · «Течь масла · участок обогащения» · «Сирена звучит,
  пока исполнитель не ответит». Then «Qostanai Industry Hackathon 2026 · Кейс 1 «НарядAI»», the Rota lockup, «Наряд выдан,
  ИИ на контроле», «АО «Костанайские Минералы» · Demo Day 16.10.2026».
- Motion: the phone eases out of a close up while red siren rings pulse and the phone glows in time with them; at 3.7 s
  the phone drops back, the brand wallpaper fades in, the mark spins into the lockup, the slogan rises.

### 2 · The problem · 0:08 · 14.5 s · `s02-problem`

- Footage: none (motion graphics). Source: the case PDF, section 2.
- Beats, 4.2 s each, the landing's chapter style with a huge outlined number behind:
  1. «Глава 01 · из кейса» «По рации и на бумаге.» «Наряды выдают устно. Порядок работ в голове у мастера, срочные
     заявки ждут.» Typewriter «Ахметов, приём!», «Канал 3 · шум · ответа нет», mascot `tired`.
  2. «Сроки никто не видит.» «Мастер не знает, кто свободен, что выполняется и что уже просрочено.» Grey pills «Иванов ·
     занят?», «Петренко · не отвечает», «Ким · в другом цехе», «Сериков · ?», mascot `dizzy`.
  3. «Качество не проверить.» «Нет фото, перечня работ и материалов. Повторные поломки замечают, когда уже авария.»
     Struck rows ✕ «Фото после», «Перечень работ», «Списанные материалы», mascot `search`.
- Bridge (2 s): the mark turns, «Rota переводит наряд в телефон и ставит ИИ на контроль».

### 3 · The master issues an emergency order · 0:22 · 18 s · `s03-issue`

- Footage: phone A, master 1001, after «Сбросить демо». Taps: 1 «Выдать» in the tab bar, 2 preset «Аварийный»,
  3 equipment chip «Насос НШ-32 маслостанции», 4 problem chip «Течь масла», 5 «Выдать» (assignee Ахметов preselected by
  the AI, deadline from the norm). Slot `s03-issue.mp4`. Fallback stills: `mobile/02`, `07`, `08`, `pwa/05` with tap
  ripples at each button.
- Captions: «Шаг 1 · мастер выдаёт наряд» · «Аварийный наряд за 5 нажатий» · «Требование кейса: не больше 6 нажатий и
  1 минуты. Участок нужен, только если узла нет среди недавних: тогда 6.» (the still shows the area chip selected) · numbered tap list that lights up with each tap · card «ИИ предлагает исполнителя: Ахметов Е. · Свободен ·
  Слесарь 5 разряда · 6 нарядов по насосам, средняя оценка 4,4 · сегодня работал на этом участке».
- Motion: tap ripples on the phone in sync with the list; the AI card rises when the suggestion appears on screen.

### 4 · The worker answers · 0:39 · 16 s · `s04-accept`

- Footage: phones A and B side by side, recorded at the same time. B: the red screen with siren, «Принять»,
  «Начать исполнение». A: the shift screen, then the order card going «Принят в работу» and «В работе». Slots
  `s04-accept-A.mp4`, `s04-accept-B.mp4`. Fallback: `pwa/05`, `09`, `11` (A) and `pwa/06`, `10`, `12` (B).
- Captions: «Шаг 2 · исполнитель отвечает» · «Красный экран и сирена» · «Аварийный наряд не смахнуть: только «Принять»
  или «Отклонить».» · counter **1,9 с** «от «Выдать» у мастера до красного экрана у исполнителя» · «Исполнитель нажимает →
  мастер видит»: «Принять» → «Принят в работу», «Начать исполнение» → «В работе» · Supabase logo «Realtime» · «Требование кейса:
  статус за 5 с».
- Motion: a red glow pulses behind phone B until «Принять»; each status pill lights up when phone A changes.

### 5 · Deadline control · 0:55 · 14 s · `s05-deadline`

- Footage: A issues a second order to Ахметов with the «1 мин» demo deadline (Демо режим on), B taps «В очередь»; then
  the reminder at 30 s left and the overdue message on both phones. Slots `s05-deadline-A.mp4`, `s05-deadline-B.mp4`
  (speed up the waiting part with `playbackRate` in `src/data/footage.ts`). Fallback: `pwa/11` (A, №661 «В работе», the same
  moment as B), `pwa/12` (B) with the app's HUD toasts.
- Captions: «Шаг 3 · ИИ контроль сроков» · «Срок под наблюдением» · clock 01:00 → 00:00 → +00:xx with «демо срок 1 мин ·
  в фильме минута сжата» · chips «проверка каждые 5 с», «напоминание до срока», «просрочка», «эскалация за 3 мин» · the
  message card, word for word from the template: «Скоро срок №662 · Через 1 мин истекает срок наряда №662. Насос водоотлива
  ЦНС-300 №2, Карьер.», then «Просрочен №662 · исполнителю и мастеру · Наряд №662 просрочен на 1 мин. Насос водоотлива
  ЦНС-300 №2, Карьер. Исполнитель: Ахметов Е. Статус: В очереди с 05:10.»
- Motion: the clock turns amber at 30 s and red at the deadline; toasts drop onto both phones.

### 6 · Closing with a photo · 1:09 · 9 s · `s06-close`

- Footage: phone B closes order №661: works text, Г-01, Кольцо уплотнительное 2 шт, Масло ВМГЗ 2 л, Ветошь 1 кг, the
  after photo of the clean pump, comment, «Отправить на проверку». Slot `s06-close.mp4`. Fallback: `pwa/14`, `pwa/15`.
- Captions: «Шаг 4 · исполнитель закрывает наряд» · «Отчёт и фото с телефона» · «Г-01 · Шифр из справочника · Течь масла,
  повреждение РВД. Подсказка пришла с выдачи.» · «Материалы рядом с нормой · Обычный расход и максимум видны прямо в
  форме.» · «Фото после: камера, сжатие, хеш · 1600 px, sha256 и dHash. Загрузка идёт, пока заполняется форма.» · «Фото
  после обязательно для внеплановых работ: так требует кейс.»

### 7 · The AI check · 1:17 · 8.5 s · `s07-check`

- Footage: phone B on «ИИ проверяет наряд» until the verdict arrives. Slot `s07-check.mp4`. Fallback: `pwa/16`.
- Captions: «Проверка ИИ · около 10 секунд» · «Правила решают, модель оценивает» · card «Правила R1…R4 в SQL»: ✓ Полнота
  отчёта 20 из 20, ✓ Подлинность фото 10 из 10, ✓ Материалы в норме 15 из 15, ! Время и срок · подозрительно быстро
  10 из 20 (the live Sonnet review, `mobile/29`) · card with the Claude logo «Claude Sonnet 5.5 · фото до и после, текст,
  материалы»: «По тексту и фото работы соответствуют проблеме: течь устранена, шифр и материалы в норме.» (`pwa/19`) ·
  counter **9,5 с** «от отправки отчёта до вердикта ИИ».
- Motion: rule rows tick one by one; the model card follows; the counter runs.

### 8 · Verdict and the master's word · 1:25 · 12 s · `s08-verdict`

- Footage: A opens the AI report (verdict, score, confidence, model, before and after photos, materials vs norm) and taps
  «Согласен, закрыть»; B shows the worker report, then «Закрыт». Slots `s08-verdict-A.mp4`, `s08-verdict-B.mp4`.
  Fallback: `pwa/19`, `20`, `21` (A) and `pwa/17`, `22` (B).
- Captions: «Шаг 5 · вердикт и решение мастера» · **87** из 100 «Принято» · ✓ «Что хорошо: Узел и пол очищены от масла, на
  фото после чисто.» · ! «Что проверить: Время работ меньше норматива: мастер видит это в отчёте.» · «Уверенность 80%. Ниже
  60% наряд получил бы пометку «Нужна проверка мастером».» · «Последнее слово за мастером» · «Согласен, закрыть» → «Закрыт».

### 9 · Rework · 1:37 · 14 s · `s09-rework`

- Footage: phone C, Иванов 2002, closes «Конвейер К-2: шум подшипника» without a photo and with 6 × подшипник 3626 (the
  form warns «Больше нормы: до 2»); the AI returns it. Phone A shows the reasons. Slots `s09-rework-C.mp4`,
  `s09-rework-A.mp4`. Fallback: `mobile/20`, `21`, `22` (C) and `mobile/04`, `23` (A).
- Captions: «Шаг 6 · если работа не доказана» · «Без фото и с перерасходом не закрыть» · **40** из 100 «Требует доработки» ·
  ✕ «Полнота отчёта: нет фото после: обязательно для внеплановых работ» · ✕ «Материалы: перерасход: подшипник 3626 6 шт при
  норме до 2» · «Жёсткие отказы решают правила, не модель: никакой ответ модели их не отменит.»

### 10 · Shift report · 1:50 · 9 s · `s10-shift-report`

- Footage: web panel `/reports/shift` as master, scroll from the counters through the AI summary to workload and
  downtime. Slot `s10-shift-report-web.mp4`. Fallback: `web-live/w04-shift-report.png` scrolled.
- Captions: «Веб панель · смена» · «Смена в цифрах и словах» · quote card with the Claude logo «Сводка ИИ · ночь 08.10 ·
  6,6 с»: «За ночную смену выдано 9 нарядов, принято в работу 8, исполнено 7, закрыто 5. Просроченных нарядов и отказов не
  было, в срок выполнено 100% исполненных нарядов.» (`docs/phase5-acceptance.md`) · «Сводка за первую половину ночи, экран справа
  снят в 05:40. Числа только из отчёта: чужих проверка не нашла.» (the still behind it shows the same shift later: 17
  issued, not 9) · PDF and Excel logos «Скачать PDF», «Скачать Excel» · «Отчёт смены совпал с ручным подсчётом в
  SQL во всех 5 окнах проверки.»

### 11 · Rating · 1:59 · 8 s · `s11-rating`

- Footage: `/reports/rating`, period «Месяц», chart then the table to the last row. Slot `s11-rating-web.mp4`. Fallback:
  `web-live/w05-rating.png` scrolled, a red frame on the row «Сериков Д.».
- Captions: «Рейтинг · месяц» · «Рейтинг из пяти частей» · weight bar Качество 35%, В срок 25%, С первого раза 20%, Объём
  10%, Дисциплина 10% (the panel's chart colors) · card «Сериков Д. · последнее место · **64,7%** с первого раза при 91,3% у
  команды, 92 дня» · «Оценки сглажены по команде: исполнитель с двумя нарядами не выйдет в лидеры.»

### 12 · AI analytics · 2:07 · 11 s · `s12-analytics`

- Footage: `/analytics`, type «покажи проблемы участка дробления за месяц», «Спросить», the cards appear with the К-3 card
  first. Slot `s12-analytics-web.mp4`. Fallback: `web-live/w06-analytics.png`.
- Captions: «Аналитика ИИ» · «Спросите обычными словами» · «Haiku разбирает вопрос, детекторы считают в SQL, Sonnet пишет
  выводы только из этих цифр.» · Claude logo «Claude Sonnet 5.5 · Haiku 5.5» · counter **22 из 22** «измерений
  закономерностей P1…P6 найдены в пределах ±20%».
- Overlays (both modes): a large question bar types the question; the К-3 card rises over the page: «За 30 дней · участок
  дробления · повторные отказы · ИИ» «Конвейер К-3: повторяющиеся отказы подшипника М-02» «7 внеплановых остановок за 30
  дней, 5 из них шифр М-02, в среднем через 6,3 дня. В 2,3 раза больше медианы по парку, простой 32,3 ч.» «Рекомендация:
  Проверить соосность привода и смазку, включить замену узла в план ППР.» «Доказательства · 7 нарядов». The text is the
  live answer to this question (`docs/phase6-acceptance.md`, run 2 and the rules card).

### 13 · Architecture and privacy · 2:17 · 18 s · `s13-architecture`

- Footage: none (animated diagram from `docs/architecture.md`).
- Diagram: «Архитектура · Один источник правды: Postgres». Left: Телефон мастера, Телефон исполнителя (Android, Apple,
  Expo logos), Веб панель (React, Chrome). Centre: Supabase + Postgres 17 with order_action (машина состояний, RLS),
  Realtime, pg_cron · 5 с (наблюдатель сроков), Storage, Edge Functions (ai-verify, ai-insights), outbox (события для 1С).
  Right: Шлюз приватности (mascot `shield`), Claude Sonnet 5.5 · Haiku 5.5 «или локальная модель», Push · FCM, Telegram
  «без имён», 1С:ТОиР. Footer: «Для комбината: Supabase с открытым кодом на своих серверах или в облаке РК, закон 94-V» ·
  «Статусы только по часам сервера · каждое действие идемпотентно · RLS по ролям».
- Motion: nodes rise in order, edges draw, red packets travel along every edge.
- Privacy beat (from 10.6 s): the diagram dims, a card «Шлюз приватности · каждый запрос к модели» «Модель не видит людей»:
  «Ахметов Е.» struck through → **E01** (исполнитель, таб. 2001), «Жумабаев Н.» → **M01** (мастер, таб. 1001); «Фамилии,
  табельные номера и телефоны заменяются до отправки. Журнал «Что видит ИИ» показывает каждый запрос. Локальная модель
  подключается переключателем провайдера, без изменения кода.»

### 14 · Numbers · 2:35 · 12 s · `s14-numbers`

- Two pages of four tiles, each with the counting number, a label and its source file in mono:
  - «ИИ точный, быстрый и дешёвый»: 10 из 10 · 1,9 с · 9,5 с · 0,016 USD («в среднем за проверку в эталонном прогоне
    на Sonnet 5.5»)
  - «Данные и надёжность»: 559 · 22 из 22 · 5 из 5 · 660

### 15 · Outro · 2:46 · 9 s · `s15-outro`

- Wallpaper, the lockup, «Наряд выдан, ИИ на контроле», four links with logos: Chrome «Сайт и веб панель ·
  rota-naryad.netlify.app», Safari «Телефон в браузере · rota-naryad.netlify.app/app», Android «APK для Android · expo.dev ·
  сборка EAS», GitHub «Код и инструкции · github.com/k4ssymzhomart/caseone»; test accounts «Мастер 1001 / 1111 ·
  Исполнитель 2001 / 1234 · Руководитель 3001 / 3333»; mascot `wave`.

## Numbers and their sources

| On screen | What it measures | Source |
| --- | --- | --- |
| 10 из 10 | golden set, expected verdict, Claude Sonnet 5.5, prompt p0.2 | `docs/golden-results.md` |
| 1,9 с | «Выдать» on the master to the red screen on the worker, two browsers, live database | `docs/progress.md` (P7) |
| 9,5 с | sending the report to the AI verdict, same run | `docs/progress.md` (P7) |
| 0,016 USD | mean cost per case of the live golden run (0.1619 USD for 10 cases, 512 × 384 photos; a check with 1600 px phone photos costs more) | `docs/golden-results.md` |
| 559 | history orders over 92 days with the planted patterns | `docs/progress.md`, `tools/db-check.ts` |
| 22 из 22 | pattern measures P1 to P6 within ±20% of the answer key | `docs/phase6-acceptance.md` |
| 5 из 5 | windows where `shift_report` equals the manual SQL count | `docs/phase5-acceptance.md` |
| 660 | automated tests passing (`npx vitest run`, 09.10.2026 07:37: 660 passed, 1 skipped, 35 files) | measured for this film |
| 64,7% / 91,3% | Сериков Д. first time fix against the team median, 92 days | `docs/phase5-acceptance.md` |
| 6,6 с | Sonnet writing the shift summary | `docs/phase5-acceptance.md` |
| 87, 80%, 40 | the score, confidence and rework score of the take on screen | the stills (`pwa/17`, `pwa/19`, `mobile/21`); `src/data/take.ts` |

Not in the film on purpose: business effect estimates (they belong in the README or slides, titled as an estimate with
their assumptions), the 5 s and 6 tap limits as measurements (they appear only as «Требование кейса»), any customer
endorsement.
