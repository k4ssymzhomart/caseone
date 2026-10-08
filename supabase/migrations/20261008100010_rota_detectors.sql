-- Rota · anomaly detectors over the order history (CLAUDE.md §15) and rules-only insight cards.
-- Each detector takes (from, to, filters) and returns jsonb rows with numbers and order_ids as evidence.
-- ai-insights sends public.analytics_bundle() to the LLM; public.insight_cards() is the deterministic
-- fallback (mock mode, budget exhausted) and the reference for the LLM's numbers.

create or replace function internal.local_hour(p_ts timestamptz)
returns int language sql immutable set search_path = ''
as $$ select extract(hour from internal.local_ts(p_ts))::int $$;

create or replace function internal.short_code_name(p_name text)
returns text language sql immutable set search_path = ''
as $$ select lower(btrim(split_part(split_part(p_name, ':', 1), ',', 1))) $$;

create or replace function internal.ru_num(p_value numeric)
returns text language sql immutable set search_path = ''
as $$ select replace(case when p_value = trunc(p_value) then trunc(p_value)::text else rtrim(p_value::text, '0') end, '.', ',') $$;

create or replace function internal.period_label(p_from timestamptz, p_to timestamptz)
returns text language sql immutable set search_path = ''
as $$
  select case
    when d between 6 and 8 then 'неделю'
    when d between 28 and 31 then '30 дней'
    when d between 85 and 95 then '3 месяца'
    else d || ' ' || internal.plural(d, 'день', 'дня', 'дней') end
  from (select round(extract(epoch from (p_to - p_from)) / 86400)::int as d) x
$$;

-- 1. units with the most unplanned failures and downtime, against the fleet median
create or replace function public.d_top_equipment(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}')
returns jsonb language sql stable security definer set search_path = ''
as $$
  with u as (
    select e.id, e.name, e.area_id, a.name as area_name, count(o.id) as n,
           coalesce(sum(extract(epoch from (coalesce(o.done_at, o.cancelled_at, now()) - o.created_at)) / 3600)
                    filter (where o.equipment_stopped), 0) as downtime_h,
           coalesce(array_agg(o.id order by o.created_at) filter (where o.id is not null), '{}') as ids
      from public.equipment e
      join public.areas a on a.id = e.area_id
      left join public.orders o on o.equipment_id = e.id and o.type = 'unplanned'
                               and o.created_at >= p_from and o.created_at < p_to
     group by e.id, e.name, e.area_id, a.name
  ),
  med as (select percentile_cont(0.5) within group (order by n) as m from u),
  codes as (
    select o.equipment_id, o.fault_code, f.name, count(*) as c
      from public.orders o join public.fault_codes f on f.code = o.fault_code
     where o.type = 'unplanned' and o.created_at >= p_from and o.created_at < p_to
     group by 1, 2, 3
  ),
  rows as (
    select jsonb_build_object(
             'equipment_id', u.id, 'name', u.name, 'area', u.area_name, 'unplanned', u.n,
             'downtime_h', round(u.downtime_h::numeric, 1),
             'fleet_median', (select m from med),
             'ratio_to_median', round((u.n / nullif((select m from med), 0))::numeric, 1),
             'top_codes', (select coalesce(jsonb_agg(jsonb_build_object('code', c.fault_code, 'name', c.name, 'count', c.c,
                                                                        'share', round(c.c::numeric / nullif(u.n, 0), 2))
                                                     order by c.c desc), '[]'::jsonb)
                             from (select * from codes c2 where c2.equipment_id = u.id order by c2.c desc limit 3) c),
             'order_ids', to_jsonb(u.ids)) as x, u.n, u.downtime_h
      from u
     where u.n > 0 and (p_filters ->> 'area_id' is null or u.area_id = (p_filters ->> 'area_id')::smallint)
     order by u.n desc, u.downtime_h desc
     limit 5
  )
  select coalesce(jsonb_agg(x order by n desc, downtime_h desc), '[]'::jsonb) from rows
$$;

-- 2. areas by failures per unit and downtime
create or replace function public.d_top_areas(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}')
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by (x ->> 'unplanned')::int desc), '[]'::jsonb)
    from (select jsonb_build_object(
                   'area_id', a.id, 'name', a.name,
                   'units', (select count(*) from public.equipment e where e.area_id = a.id),
                   'unplanned', count(o.id),
                   'per_unit', round(count(o.id)::numeric / nullif((select count(*) from public.equipment e where e.area_id = a.id), 0), 1),
                   'downtime_h', round(coalesce(sum(extract(epoch from (coalesce(o.done_at, o.cancelled_at, now()) - o.created_at)) / 3600)
                                                filter (where o.equipment_stopped), 0)::numeric, 1)) as x
            from public.areas a
            left join public.orders o on o.area_id = a.id and o.type = 'unplanned'
                                     and o.created_at >= p_from and o.created_at < p_to
           where p_filters ->> 'area_id' is null or a.id = (p_filters ->> 'area_id')::smallint
           group by a.id, a.name) t
$$;

-- 3. the same fault code again and again on one unit: the repair does not remove the cause
create or replace function public.d_repeat_faults(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}')
returns jsonb language sql stable security definer set search_path = ''
as $$
  with f as (
    select o.id, o.equipment_id, o.fault_code, o.created_at, o.assignee_id,
           o.created_at - lag(o.created_at) over (partition by o.equipment_id, o.fault_code order by o.created_at) as gap
      from public.orders o
     where o.type = 'unplanned' and o.fault_code is not null and o.created_at >= p_from and o.created_at < p_to
       and (p_filters ->> 'area_id' is null or o.area_id = (p_filters ->> 'area_id')::smallint)
  ),
  g as (
    select f.equipment_id, f.fault_code, count(*) as n,
           percentile_cont(0.5) within group (order by extract(epoch from f.gap) / 86400) as median_days,
           count(distinct f.assignee_id) as workers,
           array_agg(f.id order by f.created_at) as ids
      from f group by 1, 2 having count(*) >= 3
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'equipment_id', g.equipment_id, 'name', e.name, 'code', g.fault_code, 'code_name', fc.name,
           'count', g.n, 'median_days_between', round(g.median_days::numeric, 1), 'workers', g.workers,
           'order_ids', to_jsonb(g.ids)) order by g.n desc), '[]'::jsonb)
    from g join public.equipment e on e.id = g.equipment_id join public.fault_codes fc on fc.code = g.fault_code
$$;

-- 4. failures soon after planned maintenance (within 5 days), against the unit's own failure rate
--    outside those windows: the same unit, the same cadence, only "right after ППР" differs
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
           order by u.share / nullif(u.base, 0) desc nulls last), '[]'::jsonb)
    from unit u join public.equipment e on e.id = u.equipment_id left join public.brigades b on b.id = u.main_brigade
   where u.n >= 4 and u.share >= 0.4 and u.share >= 2 * u.base
$$;

-- 5. links to shift and time of day: area × fault group, night against day, with the peak 3 hour window
create or replace function public.d_time_patterns(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}')
returns jsonb language sql stable security definer set search_path = ''
as $$
  with f as (
    select o.id, o.area_id, fc.grp, internal.local_hour(o.created_at) as h
      from public.orders o join public.fault_codes fc on fc.code = o.fault_code
     where o.type = 'unplanned' and o.created_at >= p_from and o.created_at < p_to
       and (p_filters ->> 'area_id' is null or o.area_id = (p_filters ->> 'area_id')::smallint)
  ),
  g as (
    select f.area_id, f.grp, count(*) as n,
           count(*) filter (where f.h between 8 and 19) as day,
           count(*) filter (where f.h < 8 or f.h >= 20) as night,
           array_agg(f.id) as ids
      from f group by 1, 2 having count(*) >= 8
  ),
  peak as (
    select g.area_id, g.grp, s.h0,
           (select count(*) from f where f.area_id = g.area_id and f.grp = g.grp
                                     and f.h in (s.h0, (s.h0 + 1) % 24, (s.h0 + 2) % 24)) as c
      from g cross join generate_series(0, 23) as s(h0)
  ),
  best as (
    select distinct on (area_id, grp) area_id, grp, h0, c from peak order by area_id, grp, c desc, h0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'area_id', g.area_id, 'area', a.name, 'group', g.grp,
           'group_name', case g.grp when 'М' then 'механические' when 'Э' then 'электрические' when 'Г' then 'гидравлические'
                                    when 'П' then 'пневматические' else 'смазка' end,
           'count', g.n, 'day', g.day, 'night', g.night,
           'night_to_day', round((g.night::numeric / nullif(g.day, 0)), 1),
           'peak_from', lpad(b.h0::text, 2, '0') || ':00', 'peak_to', lpad(((b.h0 + 3) % 24)::text, 2, '0') || ':00',
           'peak_share', round(b.c::numeric / g.n, 2),
           'order_ids', to_jsonb(g.ids))
           order by greatest(g.night::numeric / nullif(g.day, 0), g.day::numeric / nullif(g.night, 0)) desc nulls first), '[]'::jsonb)
    from g join best b on b.area_id = g.area_id and b.grp = g.grp join public.areas a on a.id = g.area_id
   where g.night >= 2 * greatest(g.day, 1) or g.day >= 2 * greatest(g.night, 1)
$$;

-- 6. workers whose repairs come back (same unit and code within 7 days; chronic pairs excluded)
create or replace function public.d_worker_repeats(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}')
returns jsonb language sql stable security definer set search_path = ''
as $$
  with chronic as (select * from internal.chronic_pairs(p_from, p_to)),
  c as (
    select o.id, o.assignee_id, internal.repeat_after(o) as rep, o.rework_count > 0 as rework
      from public.orders o
     where o.type = 'unplanned' and o.status = 'closed' and o.done_at >= p_from and o.done_at < p_to
       and not exists (select 1 from chronic ch where ch.equipment_id = o.equipment_id and ch.fault_code = o.fault_code)
       and (p_filters ->> 'area_id' is null or o.area_id = (p_filters ->> 'area_id')::smallint)
  ),
  team as (select avg(rep::int) as p, avg(rework::int) as rw from c),
  w as (
    select c.assignee_id, count(*) as n, avg(c.rep::int) as p, avg(c.rework::int) as rw,
           array_agg(c.id) filter (where c.rep) as ids
      from c group by c.assignee_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'employee_id', w.assignee_id, 'short_name', e.short_name, 'pseudonym', e.pseudonym,
           'brigade_id', e.brigade_id, 'repairs', w.n,
           'repeat_share', round(w.p::numeric, 2), 'team_share', round(t.p::numeric, 2),
           'rework_share', round(w.rw::numeric, 2), 'team_rework_share', round(t.rw::numeric, 2),
           'z', round(((w.p - t.p) / nullif(sqrt(t.p * (1 - t.p) / w.n), 0))::numeric, 1),
           'order_ids', to_jsonb(coalesce(w.ids, '{}')))
           order by (w.p - t.p) / nullif(sqrt(t.p * (1 - t.p) / w.n), 0) desc), '[]'::jsonb)
    from w cross join team t join public.employees e on e.id = w.assignee_id
   where w.n >= 8 and (w.p - t.p) / nullif(sqrt(t.p * (1 - t.p) / w.n), 0) >= 2
$$;

-- 7. material use against the norm (typical qty), by brigade and by worker
create or replace function public.d_materials(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}')
returns jsonb language sql stable security definer set search_path = ''
as $$
  with l as (
    select o.id as order_id, o.fault_code, m.material_id, m.qty, o.assignee_id,
           coalesce(o.brigade_id, e.brigade_id) as brigade_id,
           (select (t ->> 'qty')::numeric from public.work_norms n, jsonb_array_elements(n.typical) t
             where n.fault_code = o.fault_code and (t ->> 'material_id')::int = m.material_id) as norm
      from public.order_materials m
      join public.orders o on o.id = m.order_id
      join public.employees e on e.id = o.assignee_id
     where o.status = 'closed' and o.done_at >= p_from and o.done_at < p_to
       and (p_filters ->> 'area_id' is null or o.area_id = (p_filters ->> 'area_id')::smallint)
  ),
  ref as (   -- the norm when the material is typical for the code, else the median of actual use
    select l.fault_code, l.material_id,
           coalesce(max(l.norm), percentile_cont(0.5) within group (order by l.qty)) as ref
      from l group by 1, 2
  ),
  r as (select l.*, l.qty / nullif(ref.ref, 0) as ratio from l join ref using (fault_code, material_id)),
  by_brigade as (
    select 'brigade'::text as kind, r.brigade_id::text as who, b.name as who_name, r.fault_code, r.material_id,
           count(*) as n, avg(r.ratio) as ratio, avg(r.qty) as avg_qty, array_agg(r.order_id) as ids
      from r join public.brigades b on b.id = r.brigade_id group by r.brigade_id, b.name, r.fault_code, r.material_id
  ),
  by_worker as (
    select 'worker'::text, r.assignee_id::text, e.short_name, r.fault_code, r.material_id,
           count(*), avg(r.ratio), avg(r.qty), array_agg(r.order_id)
      from r join public.employees e on e.id = r.assignee_id group by r.assignee_id, e.short_name, r.fault_code, r.material_id
  ),
  x as (select * from by_brigade union all select * from by_worker)
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', x.kind, 'id', x.who, 'name', x.who_name, 'code', x.fault_code,
           'material_id', x.material_id, 'material', m.name, 'unit', m.unit, 'orders', x.n,
           'avg_qty', round(x.avg_qty::numeric, 2), 'reference_qty', round(ref.ref::numeric, 2),
           'ratio', round(x.ratio::numeric, 1), 'order_ids', to_jsonb(x.ids))
           order by x.kind desc, x.ratio desc), '[]'::jsonb)
    from x join public.materials m on m.id = x.material_id
    join ref on ref.fault_code = x.fault_code and ref.material_id = x.material_id
   where x.n >= 5 and x.ratio >= 1.8
$$;

-- 8. rising weekly failures on a unit over the last 6 weeks: a likely failure ahead (bonus)
create or replace function public.d_trend(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}')
returns jsonb language sql stable security definer set search_path = ''
as $$
  with d0 as (select internal.at_local(internal.local_ts(p_to)::date, 0) as t),   -- full weeks up to local midnight
  wk as (
    select e.id as equipment_id, s.w,
           (select count(*) from public.orders o
             where o.equipment_id = e.id and o.type = 'unplanned'
               and o.created_at >= (select t from d0) - make_interval(days => 7 * (s.w + 1))
               and o.created_at <  (select t from d0) - make_interval(days => 7 * s.w)) as n
      from public.equipment e cross join generate_series(0, 5) as s(w)
     where p_filters ->> 'area_id' is null or e.area_id = (p_filters ->> 'area_id')::smallint
  ),
  g as (
    select equipment_id,
           regr_slope(n, 5 - w) as slope,
           sum(n) filter (where w in (5, 4)) as first2,
           sum(n) filter (where w in (1, 0)) as last2,
           sum(n) as total,
           jsonb_agg(n order by w desc) as weekly
      from wk group by equipment_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'equipment_id', g.equipment_id, 'name', e.name, 'weekly', g.weekly,
           'slope_per_week', round(g.slope::numeric, 2), 'first_2_weeks', g.first2, 'last_2_weeks', g.last2,
           'order_ids', (select coalesce(jsonb_agg(o.id order by o.created_at), '[]'::jsonb) from public.orders o
                          where o.equipment_id = g.equipment_id and o.type = 'unplanned'
                            and o.created_at >= (select t from d0) - interval '42 days' and o.created_at < (select t from d0)))
           order by g.slope desc), '[]'::jsonb)
    from g join public.equipment e on e.id = g.equipment_id, d0
   where g.slope >= 0.3 and g.last2 >= 2 * greatest(g.first2, 1) and g.total >= 5
$$;

create or replace function public.analytics_bundle(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform internal.require_staff();
  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'label', internal.period_label(p_from, p_to)),
    'area', (select name from public.areas where id = nullif(p_filters ->> 'area_id', '')::smallint),
    'top_equipment',  public.d_top_equipment(p_from, p_to, p_filters),
    'top_areas',      public.d_top_areas(p_from, p_to, p_filters),
    'repeat_faults',  public.d_repeat_faults(p_from, p_to, p_filters),
    'post_ppr',       public.d_post_ppr(p_from, p_to, p_filters),
    'time_patterns',  public.d_time_patterns(p_from, p_to, p_filters),
    'worker_repeats', public.d_worker_repeats(p_from, p_to, p_filters),
    'materials',      public.d_materials(p_from, p_to, p_filters),
    'trend',          public.d_trend(p_from, p_to, p_filters));
end $$;

-- deterministic insight cards from the detectors, in the case's tone; the LLM writes richer ones from the same numbers
create or replace function public.insight_cards(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  b      jsonb := public.analytics_bundle(p_from, p_to, p_filters);
  v_per  text := internal.period_label(p_from, p_to);
  cards  jsonb := '[]'::jsonb;
  x      jsonb;
  c      jsonb;
  v_top  text;
begin
  -- top equipment
  x := b -> 'top_equipment' -> 0;
  if x is not null and coalesce((x ->> 'ratio_to_median')::numeric, 0) >= 2 then
    c := x -> 'top_codes' -> 0;
    v_top := x ->> 'name';
    cards := cards || jsonb_build_object(
      'kind', 'top_equipment', 'severity', 'critical',
      'title', v_top || ' ломается чаще всех',
      'body', format('%s: %s %s за %s, %s из них шифр %s (%s). Это в %s раза больше медианы по парку, простой %s ч.',
                     v_top, x ->> 'unplanned',
                     internal.plural((x ->> 'unplanned')::int, 'внеплановая остановка', 'внеплановые остановки', 'внеплановых остановок'),
                     v_per, c ->> 'count', c ->> 'code', internal.short_code_name(c ->> 'name'),
                     internal.ru_num((x ->> 'ratio_to_median')::numeric), internal.ru_num((x ->> 'downtime_h')::numeric)),
      'recommendation', case when c ->> 'code' = 'М-02'
                             then 'Рекомендуем проверить соосность привода и смазку подшипниковых узлов и включить узел в план ППР.'
                             else 'Рекомендуем разобрать причины отказов и включить узел в план ППР.' end,
      'evidence', jsonb_build_object('order_ids', x -> 'order_ids', 'stats', x));
  end if;

  -- repeat faults on a unit not already named above
  for x in select * from jsonb_array_elements(b -> 'repeat_faults') loop
    continue when x ->> 'name' = v_top or (x ->> 'count')::int < 4;
    cards := cards || jsonb_build_object(
      'kind', 'repeat_faults', 'severity', 'warning',
      'title', 'Повторный шифр ' || (x ->> 'code') || ': ' || (x ->> 'name'),
      'body', format('%s: шифр %s повторился %s раз за %s, в среднем каждые %s дн. Ремонт не устраняет причину.',
                     x ->> 'name', x ->> 'code', x ->> 'count', v_per, internal.ru_num((x ->> 'median_days_between')::numeric)),
      'recommendation', 'Рекомендуем провести разбор причин отказа с осмотром всего узла.',
      'evidence', jsonb_build_object('order_ids', x -> 'order_ids', 'stats', x));
    exit;
  end loop;

  -- failures soon after planned maintenance
  x := b -> 'post_ppr' -> 0;
  if x is not null then
    cards := cards || jsonb_build_object(
      'kind', 'post_ppr', 'severity', 'warning',
      'title', 'Отказы после ППР: ' || (x ->> 'name'),
      'body', format('%s: после %s из %s плановых ремонтов отказ в течение 5 дней (%s%%%s). ППР выполняла %s.',
                     x ->> 'name', round((x ->> 'followed_by_failure')::numeric * (x ->> 'planned')::int),
                     x ->> 'planned', round((x ->> 'followed_by_failure')::numeric * 100),
                     case when (x ->> 'unit_base')::numeric < 0.05 then ', в остальное время узел почти не отказывает'
                          else ', в остальное время ' || round((x ->> 'unit_base')::numeric * 100) || '%' end,
                     lower(coalesce(x ->> 'brigade', 'бригада'))),
      'recommendation', 'Рекомендуем проверить качество ППР: приёмка работ мастером по чек листу, контроль затяжки и центровки.',
      'evidence', jsonb_build_object('order_ids', x -> 'order_ids', 'stats', x));
  end if;

  -- shift and time of day
  x := b -> 'time_patterns' -> 0;
  if x is not null then
    cards := cards || jsonb_build_object(
      'kind', 'time_patterns', 'severity', 'warning',
      'title', initcap(x ->> 'group_name') || ' отказы ночью: ' || (x ->> 'area'),
      'body', format('%s: %s отказы ночью случаются в %s раза чаще, чем днём (%s против %s), пик с %s до %s.',
                     x ->> 'area', x ->> 'group_name', internal.ru_num((x ->> 'night_to_day')::numeric),
                     x ->> 'night', x ->> 'day', x ->> 'peak_from', x ->> 'peak_to'),
      'recommendation', 'Рекомендуем проверить нагрузку и охлаждение электрооборудования ночью и назначить осмотр перед ночной сменой.',
      'evidence', jsonb_build_object('order_ids', x -> 'order_ids', 'stats', x));
  end if;

  -- worker with repeat failures
  x := b -> 'worker_repeats' -> 0;
  if x is not null then
    cards := cards || jsonb_build_object(
      'kind', 'worker_repeats', 'severity', 'warning',
      'title', 'Повторные отказы после ремонтов: ' || (x ->> 'short_name'),
      'body', format('%s: %s%% ремонтов с повторным отказом того же узла в течение 7 дней, по команде %s%%. На доработку уходило %s%% нарядов.',
                     x ->> 'short_name', round((x ->> 'repeat_share')::numeric * 100), round((x ->> 'team_share')::numeric * 100),
                     round((x ->> 'rework_share')::numeric * 100)),
      'recommendation', 'Рекомендуем разобрать последние ремонты с мастером и назначить наставника.',
      'evidence', jsonb_build_object('order_ids', x -> 'order_ids', 'stats', x));
  end if;

  -- materials
  for x in select * from jsonb_array_elements(b -> 'materials') loop
    continue when x ->> 'kind' <> 'brigade';
    cards := cards || jsonb_build_object(
      'kind', 'materials', 'severity', 'warning',
      'title', 'Перерасход: ' || (x ->> 'material') || ', ' || lower(x ->> 'name'),
      'body', format('%s: расход «%s» по шифру %s в %s раза выше нормы (в среднем %s %s при норме %s, %s нарядов).',
                     x ->> 'name', x ->> 'material', x ->> 'code', internal.ru_num((x ->> 'ratio')::numeric),
                     internal.ru_num((x ->> 'avg_qty')::numeric), x ->> 'unit', internal.ru_num((x ->> 'reference_qty')::numeric), x ->> 'orders'),
      'recommendation', 'Рекомендуем проверить списание материалов и технологию работ в бригаде.',
      'evidence', jsonb_build_object('order_ids', x -> 'order_ids', 'stats', x));
    exit;
  end loop;

  -- trend
  x := b -> 'trend' -> 0;
  if x is not null then
    cards := cards || jsonb_build_object(
      'kind', 'trend', 'severity', 'critical',
      'title', 'Растёт число отказов: ' || (x ->> 'name'),
      'body', format('%s: внеплановые отказы по неделям %s. За последние 2 недели %s против %s за первые две. Вероятен отказ.',
                     x ->> 'name', replace(replace(replace(x ->> 'weekly', '[', ''), ']', ''), ',', ' →'),
                     x ->> 'last_2_weeks', x ->> 'first_2_weeks'),
      'recommendation', 'Рекомендуем запланировать диагностику и ремонт до отказа.',
      'evidence', jsonb_build_object('order_ids', x -> 'order_ids', 'stats', x));
  end if;

  return cards;
end $$;

revoke execute on all functions in schema internal from public;
revoke execute on function
  public.d_top_equipment(timestamptz, timestamptz, jsonb), public.d_top_areas(timestamptz, timestamptz, jsonb),
  public.d_repeat_faults(timestamptz, timestamptz, jsonb), public.d_post_ppr(timestamptz, timestamptz, jsonb),
  public.d_time_patterns(timestamptz, timestamptz, jsonb), public.d_worker_repeats(timestamptz, timestamptz, jsonb),
  public.d_materials(timestamptz, timestamptz, jsonb), public.d_trend(timestamptz, timestamptz, jsonb),
  public.analytics_bundle(timestamptz, timestamptz, jsonb), public.insight_cards(timestamptz, timestamptz, jsonb)
from public, anon, authenticated;
grant execute on function
  public.analytics_bundle(timestamptz, timestamptz, jsonb), public.insight_cards(timestamptz, timestamptz, jsonb)
to authenticated, service_role;
grant execute on function
  public.d_top_equipment(timestamptz, timestamptz, jsonb), public.d_top_areas(timestamptz, timestamptz, jsonb),
  public.d_repeat_faults(timestamptz, timestamptz, jsonb), public.d_post_ppr(timestamptz, timestamptz, jsonb),
  public.d_time_patterns(timestamptz, timestamptz, jsonb), public.d_worker_repeats(timestamptz, timestamptz, jsonb),
  public.d_materials(timestamptz, timestamptz, jsonb), public.d_trend(timestamptz, timestamptz, jsonb)
to service_role;
