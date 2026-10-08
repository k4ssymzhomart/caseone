# Phase 5 acceptance

Reports and rating (CLAUDE.md §13, §14, §21 P5) on the live project «rota» `wcjklkpkuhxgfdtbwbuk`, run on
2026-10-09 between 00:58 and 01:45 Asia/Qostanay (night shift of 08.10, 559 history orders plus the demo state).

Reproduce: `ROTA_SECRETS_DIR=<main checkout>/.secrets npx tsx tools/phase5-check.ts [--live] [--deployed]`
(signed in as master 1001 with the publishable key; `--live` costs about 0.01 USD, `--deployed` is free while the
project runs the mock provider). The SQL of (b) runs read only in the SQL Editor.

## What was built

| Piece | Where |
| --- | --- |
| `ai-shift-summary` Edge Function: `shift_report` with the caller's JWT, report as Russian lines with workers by pseudonym, one Sonnet 5.5 call (shift_summary schema), cache in `ai_insights` (kind `shift_summary`, scope `{from, to, filters}`, 10 min, 60 s on «Обновить»), rules text on mock, CONFIG, BUDGET_EXCEEDED, HTTP, TIMEOUT or an unusable answer | `supabase/functions/ai-shift-summary/` |
| `ai-explain-rating` Edge Function: worker for self or staff (auth.getUser), `rating` for the whole team with the secret key, components against the team medians without the name, one Haiku 5.5 call (no thinking field), rules text as fallback | `supabase/functions/ai-explain-rating/` |
| Shared inputs, answer checks, cache match, number check, rules texts (parity tested against the mock writers) | `supabase/functions/_shared/reportInput.ts`, `reportText.ts`, `caller.ts` |
| `SupabaseApi.ai.shiftSummary` and `ai.explainRating` call the functions (20 s) and fall back to the rules text; `shiftSummary(input, { refresh })` | `packages/shared/src/api/supabase/SupabaseApi.ts` |
| /reports/shift: the AI summary block (mascot `read` while loading, «Обновить», source line), «Скачать PDF» and «Скачать Excel» | `apps/web/src/features/reports/ShiftReportPage.tsx` |
| /reports/rating: «Скачать PDF» and «Скачать Excel» (workers and brigades) | `apps/web/src/features/reports/RatingPage.tsx` |
| /orders/:id: «Скачать PDF» of the master report with the first «до» and the last «после» photo | `apps/web/src/features/orders/OrderPage.tsx`, `orderExport.ts` |
| PDF (pdfmake 0.3.11, Roboto vfs, Cyrillic) and Excel (exceljs 4.4.0), both lazy chunks | `apps/web/src/features/reports/export/` |

## (a) Сериков Д. (2006) ranks low on first time fix (PATTERNS.md P2)

`public.rating` as master, every worker with closed orders. F is the shrunk value of §13
(`(n·x + 5·team)/(n + 5)`), so a small sample is pulled toward the team.

| Window | Closed | F of Сериков | Team median F | Team mean F | Rank by score | Rank by F (15 = lowest) |
| --- | --- | --- | --- | --- | --- | --- |
| 30 days | 13 | 75.2% | 92.2% | 90.0% | 15 of 15 (74.8) | 14 of 15 (lowest Оспанов Е. 72.6%, 4 closed) |
| 92 days | 36 | 64.7% | 91.3% | 88.4% | 15 of 15 (71.5) | 15 of 15 |

His other components over 30 days: Q 74.0%, T 80.4%, V 37.7%, D 100%. P2 holds: last place in the monthly rating,
lowest first time fix over the history window, second lowest over 30 days behind a worker with 4 closed orders.

## (b) `shift_report` counts against a manual SQL count

Manual count over `orders` and `order_events` with the definitions of §14 (issued: created in the window; accepted
and done: distinct orders with an `accept` or `complete` event; closed: `closed_at` in the window; overdue: done late
in the window or active past the deadline; rejected: `reject` events; rework: `ai_result` to rework plus `return`),
compared in the same statement with `public.shift_report(from, to, '{}') -> 'counts'`.

| Window (UTC) | issued | accepted | done | closed | overdue | rejected | rework | cancelled | active now | Equal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| current night shift 08.10 15:00 to 20:38 | 10 | 9 | 8 | 5 | 0 | 0 | 1 | 0 | 7 | yes |
| day shift 08.10 03:00 to 15:00 | 12 | 11 | 8 | 9 | 0 | 0 | 0 | 0 | 7 | yes |
| night shift 07.10 15:00 to 08.10 03:00 | 1 | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 7 | yes |
| last 7 days | 59 | 57 | 53 | 50 | 2 | 2 | 3 | 0 | 7 | yes |
| last 30 days | 189 | 187 | 184 | 181 | 19 | 7 | 8 | 0 | 7 | yes |

Every number matches. The issued count equals the `create` events of the window (10 of 10 in the current shift), so the
demo inserts carry their events. The web page showed the same counts for the current shift.

Found on the way (not a counts issue): the workload of a paused order runs until now, so «Абенов Т.» showed 126% of the
shift. The SQL fix is in `docs/db-requests.md` (2026-10-09).

## (c) One live call of each function with the local key

The handlers ran in Node (`tools/phase5-check.ts --live`) with `.secrets/anthropic.env`, the JSON ledger and a run cap
of 0.05 USD; nothing was written to the database (the cache lived in memory).

**ai-shift-summary**, current night shift, `claude-sonnet-5-5`, 6.6 s, 0.00898 USD, numbers not in the report: none.

> За ночную смену выдано 9 нарядов, принято в работу 8, исполнено 7, закрыто 5. Просроченных нарядов и отказов не
> было, в срок выполнено 100% исполненных нарядов. Среднее время реакции составило 2,9 мин, среднее время выполнения
> 1 ч 54 мин. Суммарный простой оборудования по нарядам с остановкой 11,6 ч, больше всего потерял Конвейер К-2 (4,4 ч)
> и Конвейер К-1 (3,7 ч). Один наряд возвращён на доработку по итогам проверки ИИ, ещё один принят с замечаниями.
> Основной риск в загрузке: Абенов Т. отработал 6 ч 24 мин, это 129% смены, при этом Ахметов Е. и Ким Д. загружены на
> 21% и 17%. Активных нарядов сейчас 7, они переходят на следующую смену, а Насос НШ-32 маслостанции дал 2 внеплановых
> наряда с неисправностью Г-01 Течь масла, повреждение РВД.
>
> 1. Перераспределить наряды с Абенов Т. на Ахметов Е. и Ким Д. в следующую смену, чтобы снять перегрузку 129% и
>    использовать свободный ресурс.
> 2. Проверить Насос НШ-32 маслостанции и узлы с РВД, где дважды фиксировалась неисправность Г-01 Течь масла,
>    повреждение РВД, чтобы исключить повторный внеплановый наряд.
> 3. Взять на контроль наряд, возвращённый на доработку, и наряд, принятый с замечаниями, и закрыть их в начале смены
>    вместе с 7 активными нарядами.

The model saw only pseudonyms (E10, E01, E09); the names came back through rehydrate. Every number is from the report;
the 129% is the workload bug above, which the summary repeats faithfully.

**ai-explain-rating**, Сериков Д., 30 days, `claude-haiku-5-5`. First run 0.000248 USD (three long sentences), then
the prompt asked for at most 25 words per sentence; second run 0.000527 USD, 5.1 s:

> Выше всего вас поддержал объём с учётом сложности: 3,8 из 10 баллов, это на 1,3 балла больше медианы команды.
> Сильнее всего рейтинг снизил ремонт с первого раза: 75% нарядов без доработки против 92% у команды. Перед закрытием
> каждого наряда проверяйте работу по контрольному списку, чтобы сократить доработки и повторные отказы.

Costs: 0.009755 USD for the three calls. Ledger `.secrets/llm-ledger.json`: 0.321165 USD before, 0.330920 USD after
(the 4 USD cap is far away; the deployed functions keep their own ledger in `llm_audit`, still 0).

## Deploy

Both functions deployed through the connector with `verify_jwt: true` (the gateway accepts the project's ES256 user
tokens), version 1, ACTIVE. The 13 deployed files of each function are byte identical to the repo
(`get_edge_function` compared file by file). `tools/phase5-check.ts --deployed`:

| Call | Result |
| --- | --- |
| ai-shift-summary as master 1001 | 200 in 1.7 s, rules text (mock provider), `source: rules`, `reason: mock` |
| ai-shift-summary as worker 2006 | 403 FORBIDDEN (require_staff in `shift_report`) |
| ai-shift-summary without a session | 401 |
| ai-explain-rating, worker 2006 about himself | 200, rules text |
| ai-explain-rating, worker 2006 about someone else | 403 |
| ai-explain-rating as master about 2006 | 200 |

The web panel against the live project called `ai-shift-summary` once per scope (200, 0.9 s) and showed the rules
text with «Собрано по цифрам отчёта без модели ИИ»; «Обновить» showed the mascot and then the text again.

## Exports in the browser

Checked in Chrome against the live project (the download link was stubbed, the files were inspected locally):

| Export | Size | Check |
| --- | --- | --- |
| Shift report PDF | 34.5 KB, 2 pages | `%PDF-1.3`; page 1 rendered: lockup, title, period, KPI tiles, AI summary, workload, downtime; Cyrillic and «Г-01» intact |
| Shift report Excel | 15.3 KB | 9 sheets, numbers stored as numbers, frozen header, autofilter |
| Rating PDF | 31.1 KB | workers 1 to 15 with brigades, Сериков Д. 15th with F 75%, brigades table, formula |
| Rating Excel | 9.7 KB | workers and brigades sheets, components as percent formatted fractions |
| Order №661 PDF | 786 KB | card, AI checks with points, works, materials, the «после» photo embedded |

The pdfmake (971 KB), Roboto vfs (855 KB) and exceljs (929 KB) chunks load on the first click only; the panel's
main bundle does not carry them.

## Checks

`npm run typecheck` clean; `npx vitest run` 30 files, 586 passed, 1 skipped (the live contract suite); `npm run build -w
apps/web` clean. New tests: report inputs and cache (19), rules text parity (4), ai-shift-summary handler (9),
ai-explain-rating handler (6), SupabaseApi report functions (7), web export builders (9).

## For the lead

- Set the Edge secrets (`LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `LLM_BUDGET_USD`) to switch both functions
  from the rules text to the models; nothing else changes.
- Apply the `shift_report` workload fix from `docs/db-requests.md` so the summary stops reporting 126% loads.
- `docs/progress.md` P5 row: built, deployed, acceptance in this file.
