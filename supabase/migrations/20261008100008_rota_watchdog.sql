-- Rota · watchdog: AI deadline control (CLAUDE.md §9). Scheduled every 5 seconds by migration 12 (cron).
-- s = settings.demo_time_scale divides every threshold; messages show real minutes.

create table if not exists internal.ai_retry (
  order_id    bigint not null,
  attempt     int not null,
  tries       int not null default 0,
  last_try_at timestamptz,
  primary key (order_id, attempt)
);

create or replace function internal.watchdog_tick()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  s          numeric := greatest(internal.setting_num('demo_time_scale', 1), 1);
  v_now      timestamptz := now();
  v_remind   interval := make_interval(secs => (internal.setting_num('remind_before_min', 30) * 60 / s)::double precision);
  v_accept   interval := make_interval(secs => (internal.setting_num('accept_timeout_min', 10) * 60 / s)::double precision);
  v_accept_e interval := make_interval(secs => (internal.setting_num('accept_timeout_emergency_min', 3) * 60 / s)::double precision);
  v_repeat   interval := make_interval(secs => (internal.setting_num('overdue_repeat_min', 15) * 60 / s)::double precision);
  v_mgr      interval := make_interval(secs => (internal.setting_num('manager_overdue_min', 60) * 60 / s)::double precision);
  o          public.orders;
  c          record;
  m          record;
  v_since    timestamptz;
  v_k        bigint;
  v_url      text;
  v_key      text;
  v_rows int;
  n_esc int := 0; n_rem int := 0; n_ovd int := 0; n_mgr int := 0; n_retry int := 0;
begin
  -- every rule runs in its own block: one bad row can never silence the other rules
  -- 1. not accepted in time: escalate to the master with the best other candidate, remind the worker
  begin
  for o in select * from public.orders
            where status = 'issued'
              and v_now - issued_at > case when priority = 'emergency' then v_accept_e else v_accept end
              and not exists (select 1 from public.notifications n
                               where n.recipient_id = orders.master_id and n.dedupe_key = 'esc:' || orders.id || ':' || orders.assignee_id)
  loop
    select * into c from public.suggest_assignees(o.equipment_id, null, o.assignee_id) limit 1;
    perform internal.notify(o.master_id, o, 'escalation', 'esc:' || o.id || ':' || o.assignee_id,
      jsonb_build_object('minutes', floor(extract(epoch from (v_now - o.issued_at)) / 60)::int,
                         'cand_short_name', c.short_name,
                         'cand_reason', lower(coalesce(c.reasons[1], 'свободен')),
                         'url', case when c.employee_id is null then null
                                     else '/order/' || o.id || '?reassign=' || c.employee_id end));
    if o.due_at > v_now then
      perform internal.notify(o.assignee_id, o, 'reminder', 'escrem:' || o.id || ':' || o.assignee_id,
        jsonb_build_object('minutes', greatest(1, ceil(extract(epoch from (o.due_at - v_now)) / 60))::int));
    end if;
    n_esc := n_esc + 1;
  end loop;
  exception when others then
    raise warning 'watchdog rule 1: %', sqlerrm;
  end;

  -- 2. deadline close: least(remind_before / s, half of the order's window), so a 1 minute order reminds at 30 s
  begin
  for o in select * from public.orders
            where status in ('issued','accepted','queued','in_progress','paused','rework')
              and due_at > v_now
              and due_at - v_now <= least(v_remind, (due_at - issued_at) * 0.5)
  loop
    perform internal.notify(o.assignee_id, o, 'reminder', 'rem:' || o.id || ':' || floor(extract(epoch from o.due_at))::bigint,
      jsonb_build_object('minutes', greatest(1, ceil(extract(epoch from (o.due_at - v_now)) / 60))::int));
    n_rem := n_rem + 1;
  end loop;
  exception when others then
    raise warning 'watchdog rule 2: %', sqlerrm;
  end;

  -- 3. overdue: worker and issuing master, repeated every overdue_repeat / s (4. managers inside)
  begin
  for o in select * from public.orders
            where status in ('issued','accepted','queued','in_progress','paused','rework') and v_now > due_at
  loop
    v_k := floor(extract(epoch from (v_now - o.due_at)) / greatest(extract(epoch from v_repeat), 1))::bigint;
    select max(ev.created_at) into v_since from public.order_events ev
     where ev.order_id = o.id and ev.to_status is distinct from ev.from_status;
    v_key := 'ovd:' || o.id || ':' || floor(extract(epoch from o.due_at))::bigint || ':' || v_k;
    perform internal.notify(o.assignee_id, o, 'overdue', v_key,
      jsonb_build_object('minutes', greatest(1, floor(extract(epoch from (v_now - o.due_at)) / 60))::int,
                         'status_since', internal.local_hhmm(coalesce(v_since, o.issued_at))));
    perform internal.notify(o.master_id, o, 'overdue', v_key,
      jsonb_build_object('minutes', greatest(1, floor(extract(epoch from (v_now - o.due_at)) / 60))::int,
                         'status_since', internal.local_hhmm(coalesce(v_since, o.issued_at))));
    n_ovd := n_ovd + 1;

    -- 4. long overdue: every manager, once per order
    if v_now - o.due_at > v_mgr then
      for m in select id from public.employees where role = 'manager' loop
        perform internal.notify(m.id, o, 'manager_overdue', 'mgr:' || o.id,
          jsonb_build_object('minutes', floor(extract(epoch from (v_now - o.due_at)) / 60)::int));
      end loop;
      n_mgr := n_mgr + 1;
    end if;
  end loop;
  exception when others then
    raise warning 'watchdog rules 3 and 4: %', sqlerrm;
  end;

  -- 5. stuck AI check: no review for the current attempt after 60 s → call ai-verify again (once a minute, 5 tries)
  if to_regclass('vault.decrypted_secrets') is not null and to_regnamespace('net') is not null then
    begin
    for o in select x.* from public.orders x
              where x.status = 'ai_review'
                and not exists (select 1 from public.ai_reviews r where r.order_id = x.id and r.attempt = x.rework_count + 1)
                and (select max(ev.created_at) from public.order_events ev
                      where ev.order_id = x.id and ev.action = 'review_started') < v_now - interval '60 seconds'
                and not exists (select 1 from internal.ai_retry t
                                 where t.order_id = x.id and t.attempt = x.rework_count + 1
                                   and (t.tries >= 5 or t.last_try_at > v_now - interval '60 seconds'))
    loop
      execute $q$
        select net.http_post(
          url     := s.url || '/functions/v1/ai-verify',
          headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', s.key),
          body    := jsonb_build_object('order_id', $1, 'source', 'watchdog'),
          timeout_milliseconds := 60000)
          from (select (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') as url,
                       (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key')  as key) s
         where s.url is not null and s.key is not null
      $q$ using o.id;
      get diagnostics v_rows = row_count;
      exit when v_rows = 0;          -- secrets not in Vault yet: nothing queued, try again next tick
      insert into internal.ai_retry (order_id, attempt, tries, last_try_at)
      values (o.id, o.rework_count + 1, 1, v_now)
      on conflict (order_id, attempt) do update set tries = internal.ai_retry.tries + 1, last_try_at = v_now;
      n_retry := n_retry + 1;
    end loop;
    exception when others then
      raise warning 'watchdog rule 5: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object('escalations', n_esc, 'reminders', n_rem, 'overdue', n_ovd,
                            'manager_overdue', n_mgr, 'ai_retries', n_retry);
end $$;

revoke execute on all functions in schema internal from public;
revoke all on internal.ai_retry from public;
