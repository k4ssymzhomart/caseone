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

## 2026-10-09 · weekly digest cron for ai-insights (Phase 6, CLAUDE.md §15)

**Need.** §15 asks for a cron every Monday at 03:00 UTC (08:00 Asia/Qostanay) that runs `ai-insights` for the past
week and sends `weekly_digest` to managers and masters. The function side is deployed (`ai-insights` version 1,
`verify_jwt = false`): `POST {digest: true}` with the secret key in `apikey` computes the cards for the 7 local days
before today (the model when `LLM_PROVIDER=anthropic`, else `insight_cards`), stores them once per week in
`ai_insights` (`scope.key = digest|{monday}`), and inserts one `weekly_digest` row per master and manager itself
(service role, PostgREST upsert, `on conflict (recipient_id, dedupe_key) do nothing`, `dedupe_key =
digest:{monday}`, `order_id` null, url `/analytics`, body «Сводка ИИ за неделю: 7 выводов. Главное: {title}.»). The
`notifications_dispatch` trigger then pushes them as usual; `notify-dispatch` already sends the name free
Telegram text for `weekly_digest`. A second call in the same week finds the stored cards and inserts nothing new.
A week without findings sends nothing. So only the schedule is missing: no notification SQL is needed.

**SQL** (a new migration, for example `20261008100014_rota_weekly_digest.sql`, and `supabase/manual/`), the same
pg_net and Vault pattern as step 5 of `internal.watchdog_tick()`:

```sql
-- the Monday digest: ai-insights computes the week's cards and inserts the weekly_digest notifications itself
create or replace function internal.weekly_digest()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_id  bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'secret_key';
  if v_url is null or v_key is null then
    raise notice 'weekly_digest: project_url or secret_key missing in Vault';
    return null;
  end if;
  select net.http_post(
           url     := v_url || '/functions/v1/ai-insights',
           headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key),
           body    := jsonb_build_object('digest', true, 'source', 'cron'),
           timeout_milliseconds := 60000)
    into v_id;
  return v_id;
end $$;

revoke execute on function internal.weekly_digest() from public;

select cron.schedule('rota-weekly-digest', '0 3 * * 1', $$select internal.weekly_digest()$$);
```

**Check.** `select internal.weekly_digest();` then, a few seconds later,
`select status_code, content::jsonb -> 'digest' from net._http_response order by id desc limit 1` gives `200` and
`{"recipients": 3, "notified": 3}` (2 masters, 1 manager); `select recipient_id, body from public.notifications
where kind = 'weekly_digest'` shows the three rows. Running it again returns `"notified": 0`. Note that the check
sends real pushes to the masters' and the manager's phones.

## 2026-10-09 · `d_post_ppr` puts a small unit before the planted P3 finding

**Symptom.** For the 92 day history `insight_cards` says «Отказы после ППР: Упаковочная машина УМ-50» (4 of 9 ППР
followed by a failure, 44%, base 10%). The planted pattern P3 (`tools/seed/PATTERNS.md`), «Дробилка КМД-1750 №2:
8 of 13 ППР (62%) against 17%, бригада 3», is only the second row, so the rules card and the weekly digest miss it.
The model cards of `ai-insights` see all three rows and name P3, but the rules fallback (mock provider, no budget)
does not.

**Cause.** The detector orders by the lift `share / base` (УМ-50 4.4, КМД-1750 №2 3.6, ЭКГ-10 №7 2.5): a unit with
few ППР and a low base wins.

**Fix.** Order by the failures in excess of the unit's own rate, `(share − base) × planned`: КМД-1750 №2 5.85,
ЭКГ-10 №7 5.33, УМ-50 3.06. In `public.d_post_ppr` of `supabase/migrations/20261008100010_rota_detectors.sql`
replace

```sql
           order by u.share / nullif(u.base, 0) desc nulls last), '[]'::jsonb)
```

with

```sql
           order by (u.share - u.base) * u.n desc, u.share / nullif(u.base, 0) desc nulls last), '[]'::jsonb)
```

and re-run the `create or replace function public.d_post_ppr` block. `insight_cards` takes `post_ppr -> 0`, so its
card becomes the P3 one with no other change.

**Check.** `select c ->> 'title' from jsonb_array_elements(public.insight_cards('2026-07-08 00:00+05',
'2026-10-08 00:00+05', '{}')) c where c ->> 'kind' = 'post_ppr'` gives «Отказы после ППР: Дробилка КМД-1750 №2»;
`npx tsx tools/ai-insights-check.ts --patterns` lists it, and `npx tsx tools/insights-fixtures.ts` refreshes the test
fixtures (the `ai-insights` tests do not depend on the order).

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
