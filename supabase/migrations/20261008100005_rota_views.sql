-- Rota · read models: worker status, order cards, brigades, AI assignee suggestion (CLAUDE.md §6, §7, §10)
-- Views use security_invoker, so the caller's RLS applies (a worker sees only own orders).

create view public.v_worker_status with (security_invoker = true) as
select e.id, e.tab_no, e.short_name, e.specialty, e.grade, e.brigade_id, e.shift, e.on_shift,
       cur.id     as current_order_id,
       cur.number as current_order_number,
       cur.equipment_name as current_equipment_name,
       coalesce(q.cnt, 0) as queue_count,
       case when not e.on_shift then 'off'
            when cur.id is not null then 'working'
            when coalesce(q.cnt, 0) > 0 then 'queue'
            else 'free' end as status
  from public.employees e
  left join lateral (
        select o.id, o.number, eq.name as equipment_name
          from public.orders o join public.equipment eq on eq.id = o.equipment_id
         where o.assignee_id = e.id and o.status = 'in_progress'
         order by o.started_at desc nulls last
         limit 1) cur on true
  left join lateral (
        select count(*) as cnt
          from public.orders o
         where o.assignee_id = e.id
           and o.status in ('issued','accepted','queued','paused','rework')) q on true
 where e.role = 'worker';

-- board columns (CLAUDE.md §6 map): issued, accepted, queued, in_progress, done, overdue
create view public.v_orders with (security_invoker = true) as
select o.*,
       eq.name        as equipment_name,
       eq.type        as equipment_type,
       eq.criticality as equipment_criticality,
       ar.name        as area_name,
       w.short_name   as assignee_short_name,
       m.short_name   as master_short_name,
       b.name         as brigade_name,
       (o.status in ('issued','accepted','queued','in_progress','paused','rework') and now() > o.due_at) as is_overdue,
       case
         when o.status in ('issued','accepted','queued','in_progress','paused','rework') and now() > o.due_at then 'overdue'
         when o.status in ('issued','rejected') then 'issued'
         when o.status = 'accepted' then 'accepted'
         when o.status = 'queued' then 'queued'
         when o.status in ('in_progress','paused','rework') then 'in_progress'
         when o.status in ('done','ai_review','closed') then 'done'
       end as board_column,
       (select max(ev.created_at) from public.order_events ev
         where ev.order_id = o.id and ev.to_status is distinct from ev.from_status) as status_since,
       (select ev.reason from public.order_events ev
         where ev.order_id = o.id and ev.action in ('reject','pause')
         order by ev.created_at desc limit 1) as last_reason,
       r.verdict             as ai_verdict,
       r.score               as ai_score,
       r.needs_master_review as ai_needs_master_review
  from public.orders o
  join public.equipment eq on eq.id = o.equipment_id
  join public.areas ar     on ar.id = o.area_id
  join public.employees w  on w.id = o.assignee_id
  join public.employees m  on m.id = o.master_id
  left join public.brigades b   on b.id = o.brigade_id
  left join public.ai_reviews r on r.id = o.ai_review_id;

create view public.v_brigade_status with (security_invoker = true) as
select b.id, b.name, b.leader_id, l.short_name as leader_short_name,
       count(ws.id) filter (where ws.on_shift)                    as on_shift_count,
       count(ws.id) filter (where ws.status = 'free')             as free_count,
       count(ws.id) filter (where ws.status in ('working','queue')) as busy_count
  from public.brigades b
  left join public.employees l       on l.id = b.leader_id
  left join public.v_worker_status ws on ws.brigade_id = b.id
 group by b.id, b.name, b.leader_id, l.short_name;

-- score = 0.40·availability + 0.30·skill_on_type + 0.15·grade + 0.10·same_area_today + 0.05·(1 − load)
-- specialty mismatch × 0.3; skill is a Bayesian mean of final scores on this equipment type
create or replace function public.suggest_assignees(
  p_equipment_id       int,
  p_required_specialty text default null,
  p_exclude            uuid default null
)
returns table(employee_id uuid, short_name text, status text, score numeric, reasons text[])
language sql
stable
security definer
set search_path = ''
as $$
  with eq as (
    select e.id, e.type, e.area_id from public.equipment e where e.id = p_equipment_id
  ),
  req as (
    select coalesce(p_required_specialty,
                    (select s.specialty from public.equipment_type_specialty s where s.type = (select type from eq))) as spec,
           (select s.label_plural_dat from public.equipment_type_specialty s where s.type = (select type from eq)) as type_dat
  ),
  cand as (
    select w.* from public.v_worker_status w
     where w.on_shift and (p_exclude is null or w.id <> p_exclude)
  ),
  hist as (
    select o.assignee_id, count(*) as n, avg(o.final_score)::numeric as mean
      from public.orders o join public.equipment e2 on e2.id = o.equipment_id
     where o.status = 'closed' and o.final_score is not null and e2.type = (select type from eq)
     group by o.assignee_id
  ),
  team as (
    select coalesce(avg(o.final_score), 80)::numeric as mean
      from public.orders o join public.equipment e2 on e2.id = o.equipment_id
     where o.status = 'closed' and o.final_score is not null and e2.type = (select type from eq)
  ),
  today as (
    select o.assignee_id,
           bool_or(o.area_id = (select area_id from eq)) as same_area,
           sum(coalesce(o.norm_hours, 1))                 as load_h
      from public.orders o
     where o.created_at >= now() - interval '12 hours'
     group by o.assignee_id
  ),
  scored as (
    select c.id, c.short_name, c.status, c.specialty, c.grade, c.queue_count, c.current_order_number,
           coalesce(h.n, 0) as n, h.mean,
           case c.status when 'free' then 1.0
                         when 'queue' then greatest(0.2, 0.6 - 0.1 * c.queue_count)
                         when 'working' then 0.25
                         else 0 end as availability,
           ((coalesce(h.n, 0) * coalesce(h.mean, t.mean) + 5 * t.mean) / (coalesce(h.n, 0) + 5)) / 100.0 as skill,
           coalesce(c.grade, 3) / 6.0 as grade_norm,
           case when coalesce(td.same_area, false) then 1.0 else 0.0 end as same_area,
           coalesce(td.load_h, 0) as load_h,
           r.spec, r.type_dat
      from cand c
      cross join team t
      cross join req r
      left join hist h  on h.assignee_id = c.id
      left join today td on td.assignee_id = c.id
  ),
  final as (
    select s.*,
           (0.40 * s.availability + 0.30 * s.skill + 0.15 * s.grade_norm + 0.10 * s.same_area
            + 0.05 * (1 - case when max(s.load_h) over () > 0 then s.load_h / max(s.load_h) over () else 0 end))
           * case when s.spec is null or s.specialty = s.spec then 1.0 else 0.3 end as total
      from scored s
  )
  select f.id, f.short_name, f.status, round(f.total, 3),
         array_remove(array[
           case f.status when 'free' then 'Свободен'
                         when 'queue' then 'В очереди ' || f.queue_count
                         when 'working' then 'Выполняет наряд №' || f.current_order_number end,
           initcap(f.specialty) || ' ' || f.grade || ' разряда',
           case when f.n > 0 then f.n || ' ' || internal.plural(f.n, 'наряд', 'наряда', 'нарядов')
                                  || ' по ' || coalesce(f.type_dat, 'этому типу') || ', средняя оценка '
                                  || replace(to_char(round(f.mean / 20.0, 1), 'FM0.0'), '.', ',') end,
           case when f.same_area = 1 then 'Сегодня работал на этом участке' end,
           case when f.spec is not null and f.specialty is distinct from f.spec then 'Другая специальность' end
         ], null)
    from final f
   where internal.require_staff()
   order by f.total desc, f.short_name
   limit 3;
$$;

revoke all on public.v_worker_status, public.v_orders, public.v_brigade_status from anon;
grant select on public.v_worker_status, public.v_orders, public.v_brigade_status to authenticated, service_role;

revoke execute on function public.suggest_assignees(int, text, uuid) from public, anon;
grant execute on function public.suggest_assignees(int, text, uuid) to authenticated, service_role;
