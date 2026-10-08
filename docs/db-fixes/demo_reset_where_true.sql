-- Fix for docs/db-requests.md (2026-10-08): demo_reset() failed from the apps because pg-safeupdate rejects
-- UPDATE without WHERE in API sessions. Same function as supabase/manual/rota_remaining.sql, plus two 'where true'.
-- Paste into Supabase Dashboard → SQL Editor → Run. Safe to run again.

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

  return jsonb_build_object(
    'active', (select count(*) from public.orders where is_demo and status not in ('closed','cancelled')),
    'closed_today', (select count(*) from public.orders where is_demo and status = 'closed'),
    'on_shift', (select count(*) from public.employees where role = 'worker' and on_shift));
end $$;
