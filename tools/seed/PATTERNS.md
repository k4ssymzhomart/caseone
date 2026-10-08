# Planted patterns: the answer key

The history is generated inside the database by `internal.generate_history()` (migration `rota_seed_tools`):
92 days ending yesterday (Asia/Qostanay), deterministic random seed (`setseed(0.2026)`), synthetic people only.
Running it again rebuilds the whole history relative to today, so the demo always has fresh "last 3 months".

```sql
select internal.generate_history();   -- as postgres (SQL editor or the Supabase connector); wipes all orders first
select internal.demo_reset();         -- then the Demo Day start state (or public.demo_reset() as master or admin)
```

## Volumes

| | Local test run (PG16) | Hosted project (PG17) |
| --- | --- | --- |
| Orders | 540 (331 planned, 209 unplanned) | filled in after the hosted run |
| Events / material lines / AI reviews | 4 307 / 1 255 / 583 | |
| Late (done after due) | 9 to 13% | |
| Sent to rework | 6 to 7% | |
| Rejected first, then reassigned | 5 to 6% | |
| AI score changed by the master | 7 to 8% | |
| Paused at least once | 12 to 16% | |
| Brigade orders | 5 to 7% | |

Work time is lognormal around the norm (σ 0.35) scaled by grade; reaction is exponential (mean 6 min, emergency 2 min).
Brigades rotate weekly (this week бригада 3 is on nights). History orders have no photos.

## Patterns

| # | Pattern | How it is planted | Detector | Expected finding (3 months) |
| --- | --- | --- | --- | --- |
| P1 | Конвейер К-3 breaks far more often | fixed schedule of 21 failures, 15 of them М-02 about every 6 days; the last 30 days hold exactly 7 failures with 5 М-02, the example sentence of the case; 45% of them wait for a bearing from the store | `d_top_equipment`, `d_repeat_faults` | 21 unplanned, 3× the fleet median, 15 М-02, the most unplanned downtime (about 95 h). For «участок дробления за месяц»: 7 stops, 5 of them М-02 |
| P2 | Сериков Д. repairs come back | after each of his unplanned repairs, 35% chance of the same fault on the same unit 1.5 to 6.5 days later (others 3%); rework 25% (others 6.5%); never assigned К-3 | `d_worker_repeats`, rating F | about 41% repeat failures against 14% for the team, about 35% rework; lowest first time fix; last place in the monthly rating |
| P3 | Дробилка КМД-1750 №2 fails after ППР | weekly ППР by бригада 3; 60% of them followed by an unplanned failure 2.2 to 4.8 days later | `d_post_ppr` | 8 of 13 ППР (62%) followed by a failure within 5 days, against 17% for the same unit outside those windows; бригада 3 |
| P4 | Electrical faults at night, Участок обогащения | 13 night and 5 day electrical failures on units 17, 20, 21; 9 of the night ones between 02:00 and 05:00; no other electrical failures there | `d_time_patterns` | night 2.2× day, peak 02:00 to 05:00 |
| P5 | Бригада 1 over-uses Литол-24 | on С-01 orders бригада 1 writes off 2.2× the norm (0.8 kg) | `d_materials` | 2.2× the norm over about 57 orders (бригада 3 about 1.0×) |
| P6 | Насос водоотлива ЦНС-300 №2 is heading for a failure | weekly unplanned failures over the last 6 weeks: 0, 1, 1, 1, 2, 3 | `d_trend` | slope about 0.5 per week, 5 failures in the last 2 weeks against 1 in the first 2 |
| emergent | Компрессор 4ВМ10-50/9, П-01 seven times | not planted: random clustering plus ordinary repeats | `d_repeat_faults` | 7 times in 3 months, about every 9 days |

`public.insight_cards(from, to, filters)` turns these findings into cards in the case's tone. Example (3 months):

> Конвейер К-3: 21 внеплановая остановка за 3 месяца, 15 из них шифр М-02 (подшипник). Это в 3 раза больше медианы по парку, простой 94,9 ч.
> Рекомендуем проверить соосность привода и смазку подшипниковых узлов и включить узел в план ППР.

Tolerance: the detectors reproduce these magnitudes within ±20% on the hosted project. PG17 may draw slightly different
random sequences than the local PG16 run because some draws depend on row order; the planted structure is the same.
