# Phase 6 acceptance: analytics and anomalies

CLAUDE.md §15 and §21 P6: «P1 to P5 found with magnitudes within ±20% of PATTERNS.md». Checked on 2026-10-09 between
00:56 and 02:00 Asia/Qostanay on the live project «rota» (`wcjklkpkuhxgfdtbwbuk`, 559 orders: 540 of history
generated on 2026-10-08 plus the 19 of the demo state). Branch `worktree-wf_cb013a97-1a7-3`.

Repeat it with `npx tsx tools/ai-insights-check.ts` (`--patterns` and `--deployed`, free) and
`npx tsx tools/ai-insights-check.ts --live` (paid, about 0.045 USD).

## 1. The detectors against the answer key

`public.analytics_bundle` for the history window, 2026-07-08 00:00 to 2026-10-08 00:00 (+05:00, 92 days, read only
through the secret key). The «участок дробления» rows use the last 30 days with `area_id = 2`. Expected values from
`tools/seed/PATTERNS.md`; exact counts of the planted schedules must match, magnitudes may differ by 20%.

| Pattern | Measure | Expected | Found | Within ±20% |
| --- | --- | --- | --- | --- |
| P1 | Конвейер К-3, unplanned failures in 92 days | 21 | 21 | yes |
| P1 | К-3 against the fleet median | 3× | 3× (median 7) | yes |
| P1 | К-3 failures with М-02 | 15 | 15 | yes |
| P1 | К-3 unplanned downtime | about 95 h | 87 h (the most of any unit) | yes |
| P1 | К-3 in «участок дробления за 30 дней» | 7 stops | 7 | yes |
| P1 | of them М-02 | 5 | 5 | yes |
| P2 | Сериков Д., repairs followed by the same fault within 7 days | about 41% | 41% (z 3.2, 17 repairs) | yes |
| P2 | the team | about 14% | 14% | yes |
| P2 | Сериков Д., orders sent to rework | about 35% | 41% (team 9%) | yes |
| P3 | Дробилка КМД-1750 №2, ППР in 92 days | 13 | 13 | yes |
| P3 | ППР followed by a failure within 5 days | 62% (8 of 13) | 62% (8 of 13) | yes |
| P3 | the same unit outside those windows | 17% | 17% (lift 3.6) | yes |
| P3 | brigade | бригада 3 | бригада 3 (13 of 13) | yes |
| P4 | Участок обогащения, electrical failures at night | 13 | 13 | yes |
| P4 | by day | 5 | 5 | yes |
| P4 | night against day | 2.2 to 2.6× | 2.6× | yes |
| P4 | peak window | 02:00 to 05:00 | 02:00 to 05:00 (50% of them) | yes |
| P5 | бригада 1, Литол-24 on С-01 against the norm 0.8 kg | 2.2× | 2.2× (1.75 kg) | yes |
| P5 | orders behind it | about 57 | 55 | yes |
| P6 | Насос водоотлива ЦНС-300 №2, weekly unplanned failures | 0, 1, 1, 1, 2, 3 | 0, 1, 1, 1, 2, 3 | yes |
| P6 | slope per week | about 0.5 | 0.51 | yes |
| P6 | last 2 weeks against the first 2 | 5 against 1 | 5 against 1 | yes |

All 22 measures are within tolerance. The emergent finding of the answer key also shows: Компрессор 4ВМ10-50/9,
П-01 seven times, every 9.3 days.

`public.insight_cards` for the same window gives 7 cards: К-3 (P1), Компрессор П-01, отказы после ППР, электрические
отказы ночью на обогащении (P4), Сериков Д. (P2), Литол-24 у бригады 1 (P5), ЦНС-300 №2 (P6). One gap: its post ППР
card names Упаковочная машина УМ-50 (4 of 9 ППР, lift 4.4), because `d_post_ppr` sorts by lift and P3 is its
second row. The model cards name P3; the fix for the rules card is in `docs/db-requests.md` (2026-10-09). For
«участок дробления за 30 дней» it gives 4 cards, the first in the case's own words: «Конвейер К-3: 7 внеплановых
остановок за 30 дней, 5 из них шифр М-02 (подшипник). Это в 2,3 раза больше медианы по парку, простой 32,3 ч.»

## 2. Live ai-insights runs with the local key

`tools/ai-insights-check.ts --live` runs this repo's handler (the code that is deployed) in Node: the project
database through the secret key, `.secrets/anthropic.env`, the JSON ledger as the budget guard, `fresh: true`.
Haiku 5.5 reads the question, Sonnet 5.5 (thinking `between_tools`, effort low, no sampling parameters) writes the
cards. The script then checks every number of every card against the whole bundle (with the derived percents and
counts the model sees) and the period.

Two runs: the first on prompt `i1`, the second on `i2`, which asks for decimal commas after the first run printed
«254.7» and «Касымов Б..» (`cleanText` now also fixes both).

| Run | Window | Latency | Cards | Numbers not in the bundle | Cost |
| --- | --- | --- | --- | --- | --- |
| 1 (`i1`) | 92 days | 12.8 s | 8 model cards | 0 | 0.024596 USD |
| 1 (`i1`) | «покажи проблемы участка дробления за месяц» | 11.7 s | 5 model cards | 0 | 0.017850 USD |
| 2 (`i2`) | 92 days | 15.2 s | 8 model cards | 0 | 0.025424 USD |
| 2 (`i2`) | «покажи проблемы участка дробления за месяц» | 11.5 s | 5 model cards | 0 | 0.018178 USD |

Total 0.086048 USD (cap of the script 0.15 USD). No card was dropped for an invented number in either run. Both
questions were read as `area_id = 2`, 30 days, no focus.

Run 2, 92 days (title, body; the recommendation follows the arrow):

1. [repeat_faults, critical] Конвейер К-3: повторяющиеся отказы подшипника М-02. «Конвейер К-3 дал 21 внеплановый
   отказ за 3 месяца при медиане по парку 7, простой 87 часов. 15 из них шифр М-02 (подшипник), в среднем раз в 6
   дней, ремонтировали 5 разных исполнителей.» → проверить соосность привода и смазку, включить замену узла в план
   ППР. Numbers 21, 3, 7, 87, 15, 6, 5: all in `top_equipment.0` and `repeat_faults.0`.
2. [post_ppr, critical] Экскаватор ЭКГ-10 №7: отказы после ППР. «После 9 из 13 плановых ремонтов (69%) узел отказал
   в течение 5 дней, обычно это бывает в 28% случаев, то есть в 2,5 раза чаще. Всего у экскаватора 16 внеплановых
   отказов за 3 месяца, простой 38,6 часа.»
3. [post_ppr, critical] Дробилка КМД-1750 №2: отказы после ППР, бригада 3 (P3). «После 8 из 13 плановых ремонтов
   (62%) узел отказал в течение 5 дней, в остальное время вероятность 17%, то есть в 3,6 раза реже. Все 13 ППР
   выполнила Бригада 3.»
4. [top_areas, warning] Участок дробления: наибольший простой. «77 внеплановых отказов за 3 месяца на 7 единицах
   оборудования, 11 на единицу, простой 254,7 часа. Дробилки КМД-1750 №1 и ЩДП-12х15 дали по 14 отказов, у обеих
   медиана по парку превышена в 2 раза.»
5. [repeat_faults, warning] Дробилка ЩДП-12х15: повторы вибрации М-04 и износа М-01. «Шифр М-04 повторился 5 раз с
   интервалом около 5,4 дня, шифр М-01 тоже 5 раз с интервалом около 8,3 дня.»
6. [trend, critical] Насос водоотлива ЦНС-300 №2: рост отказов (P6). «За последние 6 недель отказы выросли с 1 в
   первые две недели до 5 в последние две, прирост около 0,51 в неделю.»
7. [time_patterns, warning] Участок обогащения: электрические отказы ночью (P4). «Из 18 электрических отказов 13
   пришлись на ночь и 5 на день, ночью в 2,6 раза чаще. В окне с 02:00 до 05:00 произошло 50% отказов.»
8. [worker_repeats, warning] Исполнитель Сериков Д. (Бригада 2) (P2). «После 41% из 17 ремонтов тот же отказ
   повторился в течение 7 дней при 14% по команде, нарядов на доработку 41% против 9%.»

Run 2, «покажи проблемы участка дробления за месяц»: К-3 (7 остановок и 32,3 ч простоя за 30 дней, в 2,3 раза
больше медианы, М-02 5 раз через 6,3 дня), КМД-1750 №2 (3 из 4 ППР с отказом, 75%, бригада 3), Грохот ГИЛ-52 (4
отказа за последние 2 недели против 1, М-04 3 раза), Конвейер К-2 (М-02 3 раза через 14,3 дня), Литол-24 у
Касымов Б. и бригады 1 (1,7 кг при норме 0,8, в 2,1 раза, 11 нарядов).

Run 1 had the same findings with К-3 as a top_equipment card, Литол-24 (P5) as an info card and the area card
(«11 на единицу, 254.7 часа»).

What the number check does not catch: the wording around a correct number. Card 3 of run 2 says «в 3,6 раза
реже» where the lift means «чаще». The rules card stays the reference, the evidence panel shows the row itself
(62% against 17%), and the master reads both.

Coverage: run 2 used its 8 cards without P5 and the Компрессор П-01 finding. Since then (`e3e5c41`) every
`insight_cards` finding that no model card cites follows the model cards as its rules card; for the stored run 2
answer that adds Компрессор П-01, Упаковочная машина УМ-50 (post ППР) and Литол-24 у бригады 1 (P5), 11 cards in
all (worked out from the stored `refs`; no third paid run).

## 3. The deployed function

`ai-insights` version 1, ACTIVE, `verify_jwt = false`, 15 files identical to this branch (compared with
`get_edge_function`). The project has no `LLM_PROVIDER` secret, so it runs the mock provider: a fresh answer is the
cards of `insight_cards`. `npx tsx tools/ai-insights-check.ts --deployed`:

```
ok   secret key, 92 days  200, 522 ms        (3 месяца, source llm, cached true, 8 cards: run 2 from the cache)
ok   at least 5 cards for 92 days
ok   cards stored in ai_insights
ok   secret key, the demo question  200, 396 ms   (30 дней, Участок дробления, parsed by rules, source llm)
ok   the question sets area and period
ok   К-3: 7 stops, 5 of them М-02
ok   secret key, the same scope again comes from the cache  441 ms
ok   a fresh call computes cards  200, 546 ms, source rules, 3 cards, неделю
ok   no credentials: 401
ok   publishable key alone: 401
ok   a broken session: 401
```

The web panel on the live project, signed in as руководитель 3001, asks the deployed function with the user
session: the scope chips read «За 30 дней · с 09.09 по 09.10 · Участок дробления · Выводы ИИ · Вопрос разобран по
ключевым словам · Сохранённый ответ», model cards carry the «ИИ» tag, the evidence panel shows the row's numbers,
the mini chart and the order links. Before the deploy the same page fell back to `rpc('insight_cards')` (404 on the
function). Worker 403 and the digest 403 for users are covered by `handler.test.ts` and by `--sessions`.

The digest path was not called live: it inserts `weekly_digest` notifications, which push to the masters' and the
manager's phones. `handler.test.ts` covers it (period, one notification per master and manager, the text, no second
send in the same week).

## 4. Manager dashboard tiles

`/dashboard` (period «Месяц», all areas) on the live project shows every tile §21 P6 asks for, from
`rpc('dashboard')`, and the numbers match the read only SQL `select public.dashboard(now() - interval '30 days',
now(), '{}')`:

| Tile | Page | SQL |
| --- | --- | --- |
| Наряды в работе | 7 | `in_progress_now` 7 |
| Просрочено | 0 | `overdue_now` 0 |
| Среднее время реакции | 12 мин | `reaction_avg_min` 12.3 |
| Среднее время выполнения | 2 ч 16 мин | `execution_avg_min` 135.6 |
| Простой оборудования | 331 ч | `downtime_hours` 331 |
| Выполнено в срок | 90%, закрыто 181 | `on_time_share` 0.896, `closed` 181 |
| Топ 5 проблемного оборудования | Компрессор 4ВМ10-50/9 9, ЦНС-300 №2 7, К-3 7, ЭКГ-10 №7 4, ЭКГ-10 №9 4 | 5 rows |
| Лучшие исполнители | Петренко В. 91,1, Мухамеджанов Р. 88,3, Ахметов Е. 88,0 | 3 rows |

No gaps.

## 5. Open

- Edge secrets: `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` (plus `LLM_BUDGET_USD`) on the project switch the
  deployed function from the mock provider to the model. Until then the page shows rules cards, and model cards
  only where a cached batch from the live runs answers the same scope (6 hours).
- The weekly digest cron and the `d_post_ppr` order: `docs/db-requests.md`, 2026-10-09.
