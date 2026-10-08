# Database requests

Changes the apps need from the architect's database. Newest first. Apply in the Supabase SQL Editor, then mirror
them into `supabase/migrations/` and `supabase/manual/`.

## 2026-10-09 · `shift_report` workload above 100% (paused orders count as work)

**Symptom.** The night shift of 08.10 (20:00 to 01:00) showed «Абенов Т. 7 ч 1 мин, 126%» in «Загрузка
исполнителей», and the AI summary called it an overload. Nobody can be busy longer than the window.

**Cause.** In the `busy` CTE of `public.shift_report` an order still in `paused` counts as work until `now()`:
`paused_total_sec` only grows on `resume`, so the open pause (`paused_since` to now) is never subtracted. Order №647
(demo state, «ждём подшипник со склада») has been paused since 16:54 UTC. The demo reset also starts №656 and №647 for
the same worker at overlapping times, so the per worker sum can pass the window even without the pause.

**Fix.** End a paused order's busy interval at `paused_since`, cap each worker at the window length, and in the
final `workload` object write `'share', least(1, round(...))`:

```sql
busy as (
  select b.assignee_id, b.assignee_name, least(sum(b.minutes), (select minutes from span)) as minutes
    from (
      select o.assignee_id, o.assignee_name,
             greatest(0, extract(epoch from (
               least(coalesce(o.done_at, o.cancelled_at, case when o.status = 'paused' then o.paused_since end, now()), p_to)
               - greatest(o.started_at, p_from))) / 60)
             * (1 - least(1, o.paused_total_sec / greatest(extract(epoch from (
                 coalesce(o.done_at, o.cancelled_at, case when o.status = 'paused' then o.paused_since end, now())
                 - o.started_at)), 1))) as minutes
        from o
       where o.started_at is not null and o.started_at < p_to and coalesce(o.done_at, o.cancelled_at, now()) > p_from
    ) b
   group by b.assignee_id, b.assignee_name
)
```

**Check.** `select x ->> 'short_name', x ->> 'share' from jsonb_array_elements(public.shift_report(now() - interval
'5 hours', now(), '{}') -> 'workload') x;` never shows a share above 1. The web table, the PDF and the AI summary then
read the corrected numbers without an app change.

## 2026-10-08 · order numbers collide after a failed `demo_reset()` (blocker, same fix file)

**Symptom.** `create_order` returns 409 (unique violation on `orders.number`); the app shows «Проверьте поля наряда».

**Cause.** `demo_reset()` starts with `setval(order_number_seq, max(number) of the history)`. When the call then fails
(the pg-safeupdate bug above), the transaction rolls back but the sequence change does not: sequences are never
transactional. The sequence sat at 641 while demo orders hold 641 to 659. The six failing resets came from the
`RUN_SUPABASE=1` contract suite run on 2026-10-08.

**Fix.** In `docs/db-fixes/demo_reset_where_true.sql`: `demo_reset()` sets the sequence again after the demo inserts,
and the file ends with a one time `setval` to `max(number)`. Mirror the extra `setval` into migration 07 and
`supabase/manual/rota_remaining.sql`.

**Status 2026-10-09.** Only the one time `setval` has run on the live project (the sequence was at 642, now 659, so
`create_order` works again). The `demo_reset()` part of the file is still pending: until it is applied, every failed
reset from the apps moves the sequence back and `create_order` collides again.

## 2026-10-08 · `demo_reset()` fails from the apps: «UPDATE requires a WHERE clause» (blocker for Demo Day)

**Symptom.** `rpc('demo_reset')` from either app (and the `RUN_SUPABASE=1` contract suite) fails with
`UPDATE requires a WHERE clause`. Run from the SQL Editor it works, which is why the seed succeeded.

**Cause.** Supabase loads `pg-safeupdate` for API sessions (PostgREST). It rejects UPDATE and DELETE without a WHERE
clause, also inside `security definer` functions called through the API. `internal.demo_reset()` has two:

- `update public.employees set on_shift = tab_no in (...);`
- `update public.equipment e set is_stopped = exists (...);`

**Fix (preferred): add `where true` to both statements**, in `supabase/migrations/20261008100007_rota_seed_tools.sql`
and `supabase/manual/rota_remaining.sql`, then re-run the `create or replace function internal.demo_reset()` block in
the SQL Editor:

```sql
update public.employees set on_shift = tab_no in ('1001','2001','2002','2003','2005','2006','2007','2008','2009','2010')
 where true;
...
update public.equipment e
   set is_stopped = exists (...)
 where true;
```

**Fix (one line, if the installed pg-safeupdate supports its switch):**

```sql
alter function internal.demo_reset() set safeupdate.enabled = off;
```

**Check.** `RUN_SUPABASE=1 npx vitest run packages/shared/src/api/supabase/SupabaseApi.contract.test.ts` (7 live
scenarios, every one starts with `demo.reset()`), or «Сбросить демо» in the app.

Other RPCs that run from the apps (`create_order`, `order_action`, `attach_photo`, `ai_check_rules`,
`set_on_shift`, `suggest_assignees`) were exercised in the live two device loop on 2026-10-08 and work.
