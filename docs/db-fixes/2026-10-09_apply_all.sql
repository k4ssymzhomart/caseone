-- Rota · every pending database change in one file (2026-10-09). See docs/db-requests.md for the why of each.
-- Paste the whole file into Supabase Dashboard → SQL Editor → Run. Safe to run more than once.
-- 1. demo_reset(): works from the apps (pg-safeupdate) and keeps the order number sequence right
-- 2. shift_report(): a paused order stops counting as work; workload share never above 100%
-- 3. d_post_ppr(): the planted P3 (Дробилка КМД-1750 №2) comes first, so the rules card finds it
-- 4. weekly digest: Monday 03:00 UTC (08:00 Qostanay) cron calling ai-insights {digest: true}

begin;

-- ============ 1. demo_reset ============

create or replace function internal.demo_reset()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_hist   bigint := coalesce((select (value #>> '{}')::bigint from public.settings where key = 'history_max_order_id'), 0);
  v_today  date := internal.local_ts(now())::date;
  v_from   timestamptz := least(case when now() >= internal.at_local(v_today, 8) then internal.at_local(v_today, 8)
                                     else now() - interval '10 hours' end,
                                now() - interval '3 hours');
  v_span   double precision;
  v_master uuid := (select id from public.employees where tab_no = '1001');
  r        record;
  i        int := 0;
  v_id     bigint;
  v_t      timestamptz;
  v_rev    bigint;
  v_score  int;
  v_verdict public.verdict_t;
begin
  perform set_config('rota.seeding', 'on', true);
  perform setseed(0.16);

  -- everything created after the history load goes (demo and test orders alike)
  delete from public.orders where id > v_hist or is_demo;
  delete from public.notifications where order_id is null and kind <> 'weekly_digest';
  delete from public.integration_outbox where coalesce((payload ->> 'order_id')::bigint, 0) > v_hist;
  perform setval('public.order_number_seq', (select coalesce(max(number), 100) from public.orders));

  update public.settings set value = '1' where key = 'demo_time_scale';

  -- shift: master Жумабаев; 9 workers on shift, Литвиненко and бригада 3 off
  update public.employees set on_shift = tab_no in ('1001','2001','2002','2003','2005','2006','2007','2008','2009','2010')
   where true;

  -- active orders, all due in 6 hours
  perform internal.demo_order('2002', 12, 'М-02', 'Шум подшипника', 'in_progress', 'high', interval '150 minutes',
                              '{"stopped": true}');
  perform internal.demo_order('2003', 21, 'Э-03', 'Не запускается', 'in_progress', 'normal', interval '50 minutes');
  perform internal.demo_order('2007', 11, 'М-04', 'Сход ленты', 'in_progress', 'high', interval '70 minutes',
                              '{"stopped": true}');
  perform internal.demo_order('2006', 10, 'М-02', 'Шум подшипника', 'queued', 'normal', interval '40 minutes',
                              '{"queue_position": 1}');
  perform internal.demo_order('2006', 8, 'М-04', 'Сильная вибрация', 'queued', 'normal', interval '25 minutes',
                              '{"queue_position": 2}');
  perform internal.demo_order('2008', 24, 'Э-04', 'Не работает концевик', 'accepted', 'normal', interval '20 minutes');
  perform internal.demo_order('2010', 4, 'М-02', 'Перегрев подшипника', 'paused', 'high', interval '110 minutes',
                              '{"comment": "ждём подшипник со склада"}');

  -- 12 orders closed earlier this shift, for the shift report
  v_span := greatest(extract(epoch from (now() - interval '20 minutes' - v_from)), 1800);
  for r in select * from (values
      ('2001', 14, 'С-01', 'ППР: плановая смазка', 'planned', 92),
      ('2009', 22, 'Э-04', 'Не срабатывает датчик', 'normal', 88),
      ('2005', 11, 'С-01', 'ППР: плановая смазка', 'planned', 84),
      ('2007', 15, 'М-02', 'Шум подшипника', 'high', 90),
      ('2002', 15, 'М-06', 'Ослабло крепление', 'normal', 81),
      ('2006', 16, 'М-04', 'Сильная вибрация', 'high', 64),
      ('2003', 17, 'Э-05', 'Срабатывает защита', 'normal', 87),
      ('2008', 19, 'П-02', 'Отказ импульсной продувки', 'normal', 79),
      ('2010', 7, 'М-01', 'Износ брони', 'high', 76),
      ('2001', 20, 'М-04', 'Шум и вибрация', 'normal', 91),
      ('2009', 6, 'П-01', 'Утечка воздуха', 'normal', 85),
      ('2007', 23, 'М-07', 'Заклинило ролик', 'emergency', 89)
    ) as t(tab, eq, code, description, priority, score)
  loop
    i := i + 1;
    v_t := v_from + make_interval(secs => v_span * (i - 1) / 12.0);
    v_id := internal.demo_order(r.tab, r.eq, r.code, r.description, 'issued', r.priority::public.priority_t,
                                now() - v_t, case when r.priority = 'planned' then '{"type":"planned"}'
                                                  when r.priority in ('high','emergency') then '{"stopped": true}'
                                                  else '{}' end::jsonb);
    v_score := r.score;
    v_verdict := case when v_score >= 80 then 'accepted' else 'accepted_with_remarks' end;
    update public.orders
       set status = 'closed',
           due_at = v_t + make_interval(secs => (coalesce(norm_hours, 1) * 3600 * 1.6)::double precision),
           accepted_at = v_t + interval '3 minutes', started_at = v_t + interval '8 minutes',
           done_at = v_t + interval '8 minutes' + make_interval(secs => (coalesce(norm_hours, 1) * 3600 * 0.9)::double precision),
           works_done = internal.works_text(r.code), fault_code = r.code
     where id = v_id;
    update public.orders
       set closed_at = least(done_at + interval '12 minutes', now() - interval '2 minutes'),
           done_at = least(done_at, now() - interval '15 minutes'),
           final_verdict = v_verdict, final_score = v_score
     where id = v_id;
    insert into public.order_materials (order_id, material_id, qty)
    select v_id, (t ->> 'material_id')::int, (t ->> 'qty')::numeric
      from jsonb_array_elements((select typical from public.work_norms where fault_code = r.code)) t
     limit 2;
    insert into public.ai_reviews (order_id, attempt, verdict, score, score5, confidence, checks, feedback_worker,
                                   report_master, model, created_at, master_verdict, master_score, master_id, master_decided_at)
    select v_id, 1, v_verdict, v_score, greatest(1, least(5, round(v_score / 20.0)))::smallint, 0.86,
           internal.seed_checks(v_score),
           jsonb_build_object('good', jsonb_build_array('Работа выполнена'), 'improve', '[]'::jsonb),
           jsonb_build_object('summary', 'Неисправность устранена'), 'seed', o.done_at + interval '20 seconds',
           v_verdict, v_score, v_master, o.closed_at
      from public.orders o where o.id = v_id
    returning id into v_rev;
    update public.orders set ai_review_id = v_rev where id = v_id;
    insert into public.order_events (order_id, actor_id, action, from_status, to_status, created_at)
    select v_id, o.assignee_id, 'accept', 'issued'::public.status_t, 'accepted'::public.status_t, o.accepted_at from public.orders o where o.id = v_id
    union all select v_id, o.assignee_id, 'start', 'accepted', 'in_progress', o.started_at from public.orders o where o.id = v_id
    union all select v_id, o.assignee_id, 'complete', 'in_progress', 'done', o.done_at from public.orders o where o.id = v_id
    union all select v_id, null, 'review_started', 'done', 'ai_review', o.done_at from public.orders o where o.id = v_id
    union all select v_id, null, 'ai_result', 'ai_review', 'ai_review', o.done_at + interval '20 seconds' from public.orders o where o.id = v_id
    union all select v_id, v_master, 'close', 'ai_review', 'closed', o.closed_at from public.orders o where o.id = v_id;
    update public.order_events
       set payload = case action
                       when 'ai_result' then jsonb_build_object('review_id', v_rev, 'verdict', v_verdict, 'score', v_score)
                       when 'close' then jsonb_build_object('final_verdict', v_verdict, 'final_score', v_score,
                                                            'ai_verdict', v_verdict, 'ai_score', v_score, 'changed', false)
                       when 'review_started' then jsonb_build_object('attempt', 1)
                       else payload end
     where order_id = v_id and action in ('ai_result','close','review_started');
  end loop;

  update public.equipment e
     set is_stopped = exists (select 1 from public.orders o
                               where o.equipment_id = e.id and o.equipment_stopped
                                 and o.status in ('issued','accepted','queued','rejected','in_progress','paused','rework'))
   where true;

  perform setval('public.order_number_seq', (select coalesce(max(number), 100) from public.orders));

  return jsonb_build_object(
    'active', (select count(*) from public.orders where is_demo and status not in ('closed','cancelled')),
    'closed_today', (select count(*) from public.orders where is_demo and status = 'closed'),
    'on_shift', (select count(*) from public.employees where role = 'worker' and on_shift));
end $$;

-- one time repair of the live sequence
select setval('public.order_number_seq', (select coalesce(max(number), 100) from public.orders));


-- ============ 2. shift_report ============
create or replace function public.shift_report(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with fl as (select coalesce(p_filters, '{}'::jsonb) as j),
  o as (
    select x.*, e.short_name as assignee_name, eq.name as equipment_name, fc.name as fault_name
      from public.orders x
      join public.employees e on e.id = x.assignee_id
      join public.equipment eq on eq.id = x.equipment_id
      left join public.fault_codes fc on fc.code = x.fault_code, fl
     where (fl.j ->> 'area_id' is null or x.area_id = (fl.j ->> 'area_id')::smallint)
       and (fl.j ->> 'equipment_id' is null or x.equipment_id = (fl.j ->> 'equipment_id')::int)
       and (fl.j ->> 'assignee_id' is null or x.assignee_id = (fl.j ->> 'assignee_id')::uuid)
       and (fl.j ->> 'brigade_id' is null or coalesce(x.brigade_id, e.brigade_id) = (fl.j ->> 'brigade_id')::smallint)
  ),
  ev as (
    select e.* from public.order_events e join o on o.id = e.order_id
     where e.created_at >= p_from and e.created_at < p_to
  ),
  span as (select greatest(extract(epoch from (least(p_to, now()) - p_from)) / 60, 1) as minutes),
  busy as (
    -- a paused order stops counting at paused_since; each worker is capped at the window (db-requests 2026-10-09)
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
  ),
  down as (
    select o.equipment_id, o.equipment_name,
           sum(extract(epoch from (least(coalesce(o.done_at, o.cancelled_at, now()), p_to) - greatest(o.created_at, p_from))) / 3600) as hours,
           count(*) as orders
      from o
     where o.equipment_stopped and o.created_at < p_to and coalesce(o.done_at, o.cancelled_at, now()) > p_from
     group by o.equipment_id, o.equipment_name
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'counts', jsonb_build_object(
      'issued',    (select count(*) from o where o.created_at >= p_from and o.created_at < p_to),
      'accepted',  (select count(distinct order_id) from ev where action = 'accept'),
      'done',      (select count(distinct order_id) from ev where action = 'complete'),
      'closed',    (select count(*) from o where o.closed_at >= p_from and o.closed_at < p_to),
      'overdue',   (select count(*) from o
                     where (o.done_at >= p_from and o.done_at < p_to and o.done_at > o.due_at)
                        or (o.status in ('issued','accepted','queued','in_progress','paused','rework')
                            and o.due_at < least(p_to, now()) and o.created_at < p_to)),
      'rejected',  (select count(*) from ev where action = 'reject'),
      'rework',    (select count(*) from ev where (action = 'ai_result' and to_status = 'rework') or action = 'return'),
      'cancelled', (select count(*) from ev where action = 'cancel'),
      'active_now', (select count(*) from o where o.status in ('issued','accepted','queued','in_progress','paused','rework'))),
    'rejected_reasons', coalesce((select jsonb_agg(jsonb_build_object('reason', r.reason, 'count', r.n) order by r.n desc)
                                   from (select reason, count(*) as n from ev where action = 'reject' group by reason) r), '[]'::jsonb),
    'workload', coalesce((select jsonb_agg(jsonb_build_object(
                             'employee_id', b.assignee_id, 'short_name', b.assignee_name,
                             'busy_min', round(b.minutes),
                             'share', least(1, round((b.minutes / case when s.minutes > 720 then s.minutes / 2 else s.minutes end)::numeric, 2)))
                           order by b.minutes desc)
                           from busy b cross join span s), '[]'::jsonb),
    'downtime', coalesce((select jsonb_agg(jsonb_build_object('equipment_id', d.equipment_id, 'name', d.equipment_name,
                                                              'hours', round(d.hours::numeric, 1), 'orders', d.orders)
                                           order by d.hours desc)
                           from (select * from down order by hours desc limit 10) d), '[]'::jsonb),
    'downtime_hours', (select round(coalesce(sum(hours), 0)::numeric, 1) from down),
    'reaction_avg_min', (select round(avg(extract(epoch from (o.accepted_at - o.issued_at)) / 60)::numeric, 1)
                           from o where o.accepted_at >= p_from and o.accepted_at < p_to),
    'execution_avg_min', (select round(avg(extract(epoch from (o.done_at - o.started_at)) / 60 - o.paused_total_sec / 60.0)::numeric, 1)
                            from o where o.done_at >= p_from and o.done_at < p_to and o.started_at is not null),
    'on_time_share', (select round(avg((o.done_at <= o.due_at)::int)::numeric, 3)
                        from o where o.done_at >= p_from and o.done_at < p_to),
    'verdicts', coalesce((select jsonb_object_agg(v.verdict, v.n)
                            from (select payload ->> 'verdict' as verdict, count(*) as n from ev
                                   where action = 'ai_result' and payload ->> 'verdict' is not null group by 1) v), '{}'::jsonb),
    'master_overrides', (select count(*) from ev where action = 'close' and (payload ->> 'changed')::boolean),
    'top_issues', coalesce((select jsonb_agg(jsonb_build_object('code', t.fault_code, 'name', t.fault_name, 'count', t.n) order by t.n desc)
                              from (select fault_code, fault_name, count(*) as n from o
                                     where o.type = 'unplanned' and o.created_at >= p_from and o.created_at < p_to
                                       and fault_code is not null
                                     group by 1, 2 order by 3 desc limit 5) t), '[]'::jsonb),
    'top_equipment', coalesce((select jsonb_agg(jsonb_build_object('equipment_id', t.equipment_id, 'name', t.equipment_name, 'count', t.n) order by t.n desc)
                                 from (select equipment_id, equipment_name, count(*) as n from o
                                        where o.type = 'unplanned' and o.created_at >= p_from and o.created_at < p_to
                                        group by 1, 2 order by 3 desc limit 5) t), '[]'::jsonb)
  )
  where internal.require_staff()
$$;

-- ============ 3. d_post_ppr ============
create or replace function public.d_post_ppr(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}')
returns jsonb language sql stable security definer set search_path = ''
as $$
  with pl as (
    select o.id, o.equipment_id, coalesce(o.brigade_id, e.brigade_id) as brigade_id, o.done_at,
           (select min(r.id) from public.orders r
             where r.equipment_id = o.equipment_id and r.type = 'unplanned'
               and r.created_at > o.done_at and r.created_at <= o.done_at + interval '5 days') as failure_id
      from public.orders o join public.employees e on e.id = o.assignee_id
     where o.type = 'planned' and o.status = 'closed' and o.done_at >= p_from and o.done_at < p_to
       and (p_filters ->> 'area_id' is null or o.area_id = (p_filters ->> 'area_id')::smallint)
  ),
  win as (
    select pl.equipment_id,
           range_agg(tstzrange(pl.done_at, pl.done_at + interval '5 days', '(]'))
             * tstzmultirange(tstzrange(p_from, p_to)) as mr
      from pl group by pl.equipment_id
  ),
  base as (
    select w.equipment_id,
           greatest(extract(epoch from (p_to - p_from)) / 86400
                    - (select coalesce(sum(extract(epoch from (upper(r) - lower(r))) / 86400), 0) from unnest(w.mr) r), 1) as outside_days,
           (select count(*) from public.orders o
             where o.equipment_id = w.equipment_id and o.type = 'unplanned'
               and o.created_at >= p_from and o.created_at < p_to and not (w.mr @> o.created_at)) as outside_failures
      from win w
  ),
  unit as (
    select pl.equipment_id, count(*) as n, avg((pl.failure_id is not null)::int) as share,
           1 - exp(-5 * max(b.outside_failures) / max(b.outside_days)) as base,
           mode() within group (order by pl.brigade_id) as main_brigade,
           array_agg(pl.id order by pl.done_at) filter (where pl.failure_id is not null) as ppr_ids,
           array_agg(pl.failure_id order by pl.done_at) filter (where pl.failure_id is not null) as failure_ids
      from pl join base b on b.equipment_id = pl.equipment_id
     group by pl.equipment_id
  ),
  overall as (select avg((failure_id is not null)::int) as share from pl)
  select coalesce(jsonb_agg(jsonb_build_object(
           'equipment_id', u.equipment_id, 'name', e.name, 'planned', u.n,
           'followed_by_failure', round(u.share::numeric, 2),
           'unit_base', round(u.base::numeric, 2),
           'fleet_share', round((select share from overall)::numeric, 2),
           'lift', round((u.share / nullif(u.base, 0))::numeric, 1),
           'brigade_id', u.main_brigade, 'brigade', b.name,
           'brigade_planned', (select count(*) from pl where pl.equipment_id = u.equipment_id and pl.brigade_id = u.main_brigade),
           'order_ids', to_jsonb(coalesce(u.ppr_ids, '{}') || coalesce(u.failure_ids, '{}')))
           order by (u.share - u.base) * u.n desc, u.share / nullif(u.base, 0) desc nulls last), '[]'::jsonb)
    from unit u join public.equipment e on e.id = u.equipment_id left join public.brigades b on b.id = u.main_brigade
   where u.n >= 4 and u.share >= 0.4 and u.share >= 2 * u.base
$$;

-- ============ 4. weekly digest ============
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

select cron.unschedule(jobid) from cron.job where jobname = 'rota-weekly-digest';
select cron.schedule('rota-weekly-digest', '0 3 * * 1', $$select internal.weekly_digest()$$);

commit;
