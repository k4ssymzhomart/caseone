# Database requests

Changes the apps need from the architect's database. Newest first. Apply in the Supabase SQL Editor, then mirror
them into `supabase/migrations/` and `supabase/manual/`.

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
