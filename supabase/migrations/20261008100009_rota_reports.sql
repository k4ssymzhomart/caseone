-- Rota · reports: rating (CLAUDE.md §13), shift report (§14), manager dashboard (§15).
-- Every report takes the shared filter: {area_id, equipment_id, assignee_id, brigade_id}.

-- unit + fault code pairs that recur 5 or more times in a window: a chronic equipment fault,
-- reported by d_repeat_faults and not counted against the worker in first time fix
create or replace function internal.chronic_pairs(p_from timestamptz, p_to timestamptz)
returns table(equipment_id int, fault_code text)
language sql stable set search_path = ''
as $$
  select o.equipment_id, o.fault_code
    from public.orders o
   where o.type = 'unplanned' and o.fault_code is not null
     and o.created_at >= p_from - interval '7 days' and o.created_at < p_to
   group by 1, 2
  having count(*) >= 5
$$;

-- a closed order counts as not fixed the first time if it went to rework, or the same fault on the same
-- unit came back within 7 days (chronic pairs excluded)
create or replace function internal.repeat_after(p_order public.orders)
returns boolean
language sql stable set search_path = ''
as $$
  select p_order.type = 'unplanned' and p_order.done_at is not null and exists (
    select 1 from public.orders r
     where r.equipment_id = p_order.equipment_id and r.type = 'unplanned'
       and r.fault_code = p_order.fault_code
       and r.created_at > p_order.done_at and r.created_at <= p_order.done_at + interval '7 days')
$$;

create or replace function public.rating(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}')
returns table(kind text, id text, name text, brigade_id smallint, closed int,
              q numeric, t numeric, f numeric, v numeric, d numeric, score numeric, rank int, note text)
language sql
stable
security definer
set search_path = ''
as $$
  with fl as (select coalesce(p_filters, '{}'::jsonb) as j),
  chronic as (select * from internal.chronic_pairs(p_from, p_to)),
  closed as (
    select o.*
      from public.orders o, fl
     where o.status = 'closed' and o.closed_at >= p_from and o.closed_at < p_to
       and (fl.j ->> 'area_id' is null or o.area_id = (fl.j ->> 'area_id')::smallint)
       and (fl.j ->> 'equipment_id' is null or o.equipment_id = (fl.j ->> 'equipment_id')::int)
  ),
  per_order as (
    select c.id, c.assignee_id, c.final_score,
           (c.done_at <= c.due_at) as on_time,
           (c.rework_count > 0
            or (internal.repeat_after(c)
                and not exists (select 1 from chronic ch
                                 where ch.equipment_id = c.equipment_id and ch.fault_code = c.fault_code))) as not_first_fix,
           coalesce(c.norm_hours, 1) * case c.priority when 'emergency' then 1.3 when 'high' then 1.15
                                                       when 'normal' then 1.0 else 0.9 end as volume
      from closed c
  ),
  w as (
    select e.id, e.short_name, e.brigade_id
      from public.employees e, fl
     where e.role = 'worker'
  ),
  agg as (
    select w.id, w.short_name, w.brigade_id,
           count(p.id) as n,
           avg(p.final_score) / 100.0 as q_raw,
           avg(p.on_time::int) as t_raw,
           1 - avg(p.not_first_fix::int) as f_raw,
           coalesce(sum(p.volume), 0) as vol
      from w left join per_order p on p.assignee_id = w.id
     group by w.id, w.short_name, w.brigade_id
  ),
  team as (
    select avg(final_score) / 100.0 as q, avg(on_time::int) as t, 1 - avg(not_first_fix::int) as f from per_order
  ),
  assigned as (   -- orders ever assigned to the worker, from events, because reassign rewrites the assignee
    select x.worker, count(distinct x.order_id) as n
      from (select (ev.payload ->> 'assignee_id')::uuid as worker, ev.order_id
              from public.order_events ev
             where ev.action = 'create' and ev.created_at >= p_from and ev.created_at < p_to
            union all
            select (ev.payload ->> 'to_assignee_id')::uuid, ev.order_id
              from public.order_events ev
             where ev.action = 'reassign' and ev.created_at >= p_from and ev.created_at < p_to) x
     group by x.worker
  ),
  rejects as (
    select ev.actor_id as worker,
           count(*) filter (where ev.reason = 'other' and not exists (
             select 1 from public.order_events j
              where j.order_id = ev.order_id and j.action = 'mark_reject_justified'
                and (j.payload ->> 'reject_event_id')::bigint = ev.id)) as unjust
      from public.order_events ev
     where ev.action = 'reject' and ev.created_at >= p_from and ev.created_at < p_to
     group by ev.actor_id
  ),
  scored as (
    select a.id, a.short_name, a.brigade_id, a.n,
           case when a.n > 0 then (a.n * a.q_raw + 5 * tm.q) / (a.n + 5) end as q,
           case when a.n > 0 then (a.n * a.t_raw + 5 * tm.t) / (a.n + 5) end as t,
           case when a.n > 0 then (a.n * a.f_raw + 5 * tm.f) / (a.n + 5) end as f,
           a.vol / nullif(max(a.vol) over (), 0) as v,
           coalesce(1 - coalesce(r.unjust, 0)::numeric / nullif(asg.n, 0), 1) as d
      from agg a cross join team tm
      left join assigned asg on asg.worker = a.id
      left join rejects r on r.worker = a.id
  ),
  workers as (
    select 'worker'::text as kind, s.id::text as id, s.short_name as name, s.brigade_id, s.n::int as closed,
           round(s.q, 3) as q, round(s.t, 3) as t, round(s.f, 3) as f, round(coalesce(s.v, 0), 3) as v, round(s.d, 3) as d,
           case when s.n > 0
                then round(100 * (0.35 * s.q + 0.25 * s.t + 0.20 * s.f + 0.10 * coalesce(s.v, 0) + 0.10 * s.d), 1) end as score
      from scored s
  ),
  brigades as (
    select 'brigade'::text, b.id::text, b.name, b.id, sum(w.closed)::int,
           round(sum(w.q * w.closed) / nullif(sum(w.closed), 0), 3),
           round(sum(w.t * w.closed) / nullif(sum(w.closed), 0), 3),
           round(sum(w.f * w.closed) / nullif(sum(w.closed), 0), 3),
           round(sum(w.v * w.closed) / nullif(sum(w.closed), 0), 3),
           round(sum(w.d * w.closed) / nullif(sum(w.closed), 0), 3),
           round(sum(w.score * w.closed) / nullif(sum(w.closed), 0), 1)
      from public.brigades b join workers w on w.brigade_id = b.id
     where w.score is not null
     group by b.id, b.name
  ),
  allrows as (select * from workers union all select * from brigades)
  select x.kind, x.id, x.name, x.brigade_id, x.closed, x.q, x.t, x.f, x.v, x.d, x.score,
         (rank() over (partition by x.kind order by x.score desc nulls last))::int,
         case when x.closed = 0 then 'нет закрытых нарядов' end
    from allrows x, fl
   where (fl.j ->> 'brigade_id' is null or x.brigade_id = (fl.j ->> 'brigade_id')::smallint)
     and (fl.j ->> 'assignee_id' is null or (x.kind = 'worker' and x.id = fl.j ->> 'assignee_id'))
     -- a worker sees only their own row («Из чего сложился рейтинг»); staff see everyone
     and (internal.staff_or_system() or (x.kind = 'worker' and x.id = (select auth.uid())::text))
   order by x.kind desc, x.score desc nulls last, x.name
$$;

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
    select o.assignee_id, o.assignee_name,
           sum(greatest(0, extract(epoch from (least(coalesce(o.done_at, o.cancelled_at, now()), p_to) - greatest(o.started_at, p_from))) / 60)
               * (1 - least(1, o.paused_total_sec / greatest(extract(epoch from (coalesce(o.done_at, o.cancelled_at, now()) - o.started_at)), 1)))) as minutes
      from o
     where o.started_at is not null and o.started_at < p_to and coalesce(o.done_at, o.cancelled_at, now()) > p_from
     group by o.assignee_id, o.assignee_name
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
                             'share', round((b.minutes / case when s.minutes > 720 then s.minutes / 2 else s.minutes end)::numeric, 2))
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

create or replace function public.dashboard(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'in_progress_now', (r -> 'counts' ->> 'active_now')::int,
    'overdue_now', (select count(*) from public.orders o
                     where o.status in ('issued','accepted','queued','in_progress','paused','rework') and o.due_at < now()
                       and ((p_filters ->> 'area_id') is null or o.area_id = (p_filters ->> 'area_id')::smallint)),
    'reaction_avg_min', r -> 'reaction_avg_min',
    'execution_avg_min', r -> 'execution_avg_min',
    'downtime_hours', r -> 'downtime_hours',
    'on_time_share', r -> 'on_time_share',
    'closed', r -> 'counts' -> 'closed',
    'top_equipment', (select coalesce(jsonb_agg(x order by (x ->> 'unplanned')::int desc), '[]'::jsonb)
                        from (select jsonb_build_object('equipment_id', e.id, 'name', e.name, 'unplanned', count(o.id),
                                       'downtime_h', round(coalesce(sum(extract(epoch from (coalesce(o.done_at, o.cancelled_at, now()) - o.created_at)) / 3600)
                                                                    filter (where o.equipment_stopped), 0)::numeric, 1)) as x
                                from public.equipment e
                                join public.orders o on o.equipment_id = e.id and o.type = 'unplanned'
                                 and o.created_at >= p_from and o.created_at < p_to
                               where (p_filters ->> 'area_id') is null or e.area_id = (p_filters ->> 'area_id')::smallint
                               group by e.id, e.name
                               order by count(o.id) desc
                               limit 5) t),
    'best_workers', (select coalesce(jsonb_agg(jsonb_build_object('employee_id', x.id, 'short_name', x.name,
                                                                  'score', x.score, 'closed', x.closed) order by x.score desc), '[]'::jsonb)
                       from (select * from public.rating(p_from, p_to, p_filters)
                              where kind = 'worker' and score is not null and closed >= 3
                              order by score desc limit 3) x))
    from (select public.shift_report(p_from, p_to, p_filters) as r) s
   where internal.require_staff()
$$;

revoke execute on function internal.chronic_pairs(timestamptz, timestamptz), internal.repeat_after(public.orders) from public;
revoke execute on function public.rating(timestamptz, timestamptz, jsonb), public.shift_report(timestamptz, timestamptz, jsonb),
                           public.dashboard(timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.rating(timestamptz, timestamptz, jsonb), public.shift_report(timestamptz, timestamptz, jsonb),
                          public.dashboard(timestamptz, timestamptz, jsonb) to authenticated, service_role;
