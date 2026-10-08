\pset footer off
\echo P1 unplanned per unit (92 d): K-3 vs median, last 30 days
with u as (select e.id, e.name, count(o.id) filter (where o.type='unplanned') n,
                  count(o.id) filter (where o.type='unplanned' and o.fault_code='М-02') m02,
                  count(o.id) filter (where o.type='unplanned' and o.created_at > now() - interval '30 days') n30,
                  count(o.id) filter (where o.type='unplanned' and o.fault_code='М-02' and o.created_at > now() - interval '30 days') m02_30,
                  round(sum(extract(epoch from (o.done_at - o.created_at))/3600) filter (where o.equipment_stopped), 1) downtime_h
           from equipment e left join orders o on o.equipment_id = e.id group by e.id, e.name)
select (select percentile_cont(0.5) within group (order by n) from u) median_all,
       (select round(avg(n),1) from u where id in (11,12,23)) other_conveyors_avg,
       n k3, m02 k3_m02, n30 k3_30d, m02_30 k3_m02_30d, downtime_h k3_downtime,
       (select max(downtime_h) from u where id <> 13) next_downtime
from u where id = 13;
\echo top 5 by unplanned
select e.name, count(*) n from orders o join equipment e on e.id=o.equipment_id where o.type='unplanned' group by e.name order by n desc limit 5;

\echo P2 repeat failure share per worker (same unit + code within 7 days after done)
with c as (
  select o.id, o.assignee_id, exists (select 1 from orders r where r.equipment_id = o.equipment_id and r.type='unplanned'
             and r.fault_code = o.fault_code and r.created_at > o.done_at and r.created_at <= o.done_at + interval '7 days') rep
  from orders o where o.type='unplanned' and o.status='closed')
select e.short_name, count(*) n, round(avg(rep::int),3) share
from c join employees e on e.id = c.assignee_id group by e.short_name order by share desc limit 6;
with c as (
  select o.id, o.assignee_id, exists (select 1 from orders r where r.equipment_id = o.equipment_id and r.type='unplanned'
             and r.fault_code = o.fault_code and r.created_at > o.done_at and r.created_at <= o.done_at + interval '7 days') rep
  from orders o where o.type='unplanned' and o.status='closed')
select round(avg(rep::int) filter (where assignee_id <> (select id from employees where tab_no='2006')),3) team_excl_serikov,
       round(avg(rep::int) filter (where assignee_id = (select id from employees where tab_no='2006')),3) serikov,
       round(avg(rep::int) filter (where assignee_id <> (select id from employees where tab_no='2006')
                                    and (select equipment_id from orders where id = c.id) <> 13),3) team_excl_k3
from c;
\echo P2 rework share
select e.short_name, count(*) n, round(avg((o.rework_count>0)::int),3) rework from orders o join employees e on e.id=o.assignee_id
group by e.short_name order by rework desc limit 4;

\echo P3 planned closures followed by an unplanned failure on the unit within 2 to 5 days
with p as (select o.id, o.equipment_id, o.brigade_id, o.done_at,
                  exists (select 1 from orders r where r.equipment_id=o.equipment_id and r.type='unplanned'
                          and r.created_at between o.done_at + interval '2 days' and o.done_at + interval '5 days') f25,
                  exists (select 1 from orders r where r.equipment_id=o.equipment_id and r.type='unplanned'
                          and r.created_at between o.done_at and o.done_at + interval '7 days') f7
           from orders o where o.type='planned')
select case when equipment_id = 9 then 'КМД-1750 №2' else 'other units' end grp, count(*) n,
       round(avg(f25::int),3) share_2_5d, round(avg(f7::int),3) share_7d
from p group by 1;

\echo P4 Участок обогащения, Э faults by shift; hour histogram at night
select case when extract(hour from (o.created_at at time zone 'UTC') + interval '5 hours') between 8 and 19 then 'day' else 'night' end shift,
       count(*) from orders o join fault_codes f on f.code=o.fault_code where o.area_id=3 and f.grp='Э' and o.type='unplanned' group by 1;
select extract(hour from (o.created_at at time zone 'UTC') + interval '5 hours')::int h, count(*)
from orders o join fault_codes f on f.code=o.fault_code where o.area_id=3 and f.grp='Э' and o.type='unplanned' group by 1 order by 1;

\echo P5 Литол on С-01: qty vs typical 0.8 by brigade
select coalesce(o.brigade_id, e.brigade_id) brigade, count(*) n, round(avg(m.qty),2) avg_qty, round(avg(m.qty)/0.8,2) ratio
from orders o join order_materials m on m.order_id=o.id and m.material_id=18 join employees e on e.id=o.assignee_id
where o.fault_code='С-01' group by 1 order by 1;

\echo P6 ЦНС-300 №2 unplanned per week (oldest first, last 13 weeks)
with b as (select internal.at_local(internal.local_ts(now())::date, 0) d0)
select w, count(o.id) from b cross join generate_series(12,0,-1) w
left join orders o on o.equipment_id=5 and o.type='unplanned'
  and o.created_at >= b.d0 - make_interval(days => 7*(w+1)) and o.created_at < b.d0 - make_interval(days => 7*w)
group by w order by w desc;
