-- Rota · order state machine and notifications (CLAUDE.md §6, §8)
-- Every order mutation goes through create_order / order_action / order_system_action.
-- Errors carry the code as the message: FORBIDDEN, BAD_TRANSITION, MISSING_REASON,
-- ANOTHER_IN_PROGRESS, NOT_ON_SHIFT, BAD_INPUT. The detail holds context (JSON for ANOTHER_IN_PROGRESS).

------------------------------------------------------------------------------
-- helpers
------------------------------------------------------------------------------

create or replace function internal.fail(p_code text, p_detail text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using message = p_code, detail = coalesce(p_detail, p_code), errcode = 'P0001';
end $$;

-- Asia/Qostanay is UTC+5 all year: a fixed offset, no tz database involved
create or replace function internal.local_hhmm(p_ts timestamptz)
returns text
language sql immutable
set search_path = ''
as $$ select to_char((p_ts at time zone 'UTC') + interval '5 hours', 'HH24:MI') $$;

create or replace function internal.plural(p_n bigint, p_one text, p_few text, p_many text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when abs(p_n) % 100 between 11 and 14 then p_many
    when abs(p_n) % 10 = 1 then p_one
    when abs(p_n) % 10 between 2 and 4 then p_few
    else p_many
  end
$$;

create or replace function internal.status_label(p public.status_t)
returns text language sql immutable set search_path = ''
as $$
  select case p
    when 'issued' then 'Выдан' when 'accepted' then 'Принят в работу' when 'queued' then 'В очереди'
    when 'rejected' then 'Отклонён' when 'in_progress' then 'В работе' when 'paused' then 'Приостановлен'
    when 'done' then 'Исполнено' when 'ai_review' then 'Проверка ИИ' when 'rework' then 'На доработку'
    when 'closed' then 'Закрыт' when 'cancelled' then 'Отменён' end
$$;

create or replace function internal.priority_label(p public.priority_t)
returns text language sql immutable set search_path = ''
as $$
  select case p when 'emergency' then 'Аварийный' when 'high' then 'Высокий'
                when 'normal' then 'Обычный' when 'planned' then 'Плановый' end
$$;

create or replace function internal.verdict_label(p public.verdict_t)
returns text language sql immutable set search_path = ''
as $$
  select case p when 'accepted' then 'Принято' when 'accepted_with_remarks' then 'Принято с замечаниями'
                when 'rework' then 'Требует доработки' end
$$;

create or replace function internal.reject_label(p text)
returns text language sql immutable set search_path = ''
as $$
  select case p when 'no_materials' then 'Нет материалов' when 'no_permit' then 'Нет допуска'
                when 'busy_emergency' then 'Занят аварийным' when 'equipment_running' then 'Оборудование работает'
                when 'other' then 'Другое' else p end
$$;

create or replace function internal.pause_label(p text)
returns text language sql immutable set search_path = ''
as $$
  select case p when 'waiting_parts' then 'Ожидание запчастей' when 'waiting_stop' then 'Ожидание остановки'
                when 'waiting_permit' then 'Ожидание допуска' when 'other' then 'Другое' else p end
$$;

-- settings readers fall back to the default on a missing or malformed value, so one bad admin edit
-- cannot stop the watchdog or order creation
create or replace function internal.setting_num(p_key text, p_default numeric)
returns numeric language plpgsql stable set search_path = ''
as $$
begin
  return coalesce((select (value #>> '{}')::numeric from public.settings where key = p_key), p_default);
exception when others then
  return p_default;
end $$;

create or replace function internal.setting_bool(p_key text, p_default boolean)
returns boolean language plpgsql stable set search_path = ''
as $$
begin
  return coalesce((select (value #>> '{}')::boolean from public.settings where key = p_key), p_default);
exception when others then
  return p_default;
end $$;

-- the unit is stopped while an order with equipment_stopped on it is still open
create or replace function internal.refresh_equipment(p_equipment_id int)
returns void
language sql
set search_path = ''
as $$
  update public.equipment e
     set is_stopped = exists (
           select 1 from public.orders o
            where o.equipment_id = e.id and o.equipment_stopped
              and o.status in ('issued','accepted','queued','rejected','in_progress','paused','rework'))
   where e.id = p_equipment_id;
$$;

------------------------------------------------------------------------------
-- notifications (templates of CLAUDE.md §8)
------------------------------------------------------------------------------

create or replace function internal.notify(
  p_recipient uuid,
  p_order     public.orders,
  p_kind      text,
  p_key       text,
  p_vars      jsonb default '{}'
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  n       int := p_order.number;
  v_eq    text;
  v_area  text;
  v_who   text;
  v_who_e text;     -- the name closing a sentence: «Иванов С.» already ends with a period
  v_title text;
  v_body  text;
  v_sev   text := 'info';
  v_url   text := '/order/' || p_order.id;
  v_score int  := nullif(p_vars ->> 'score', '')::int;
  v_points text;
begin
  if p_recipient is null then
    return;
  end if;

  select e.name, a.name into v_eq, v_area
    from public.equipment e join public.areas a on a.id = e.area_id
   where e.id = p_order.equipment_id;
  select short_name into v_who from public.employees where id = p_order.assignee_id;
  v_who_e := case when right(v_who, 1) = '.' then v_who else v_who || '.' end;
  v_points := case when v_score is null then ''
                   else ', ' || v_score || ' ' || internal.plural(v_score, 'балл', 'балла', 'баллов') end;

  case p_kind
    when 'new_order' then
      v_title := 'Новый наряд №' || n;
      v_body  := format('Новый наряд №%s. %s, %s. Срок до %s. Приоритет: %s.',
                        n, v_eq, v_area, internal.local_hhmm(p_order.due_at),
                        lower(internal.priority_label(p_order.priority)));
    when 'emergency' then
      v_title := 'Аварийный наряд №' || n;
      v_body  := format('АВАРИЙНЫЙ наряд №%s. %s, %s. Требует ответа.', n, v_eq, v_area);
      v_sev   := 'critical';
      v_url   := '/emergency/' || p_order.id;
    when 'reminder' then
      v_title := 'Скоро срок №' || n;
      v_body  := format('Через %s мин истекает срок наряда №%s. %s, %s.', p_vars ->> 'minutes', n, v_eq, v_area);
      v_sev   := 'warning';
    when 'overdue' then
      v_title := 'Просрочен №' || n;
      v_body  := format('Наряд №%s просрочен на %s мин. %s, %s. Исполнитель: %s Статус: %s с %s.',
                        n, p_vars ->> 'minutes', v_eq, v_area, v_who_e,
                        internal.status_label(p_order.status), p_vars ->> 'status_since')
                 || case when nullif(btrim(coalesce(p_order.last_comment, '')), '') is null then ''
                         else format(' Последний комментарий: “%s”.', p_order.last_comment) end;
      v_sev   := 'critical';
    when 'escalation' then
      v_title := 'Не принят №' || n;
      v_body  := format('Наряд №%s не принят за %s мин. %s, %s. Исполнитель: %s',
                        n, p_vars ->> 'minutes', v_eq, v_area, v_who_e)
                 || case when p_vars ->> 'cand_short_name' is null then ''
                         else format(' Предлагаем: %s, %s.', p_vars ->> 'cand_short_name',
                                     coalesce(p_vars ->> 'cand_reason', 'свободен')) end;
      v_sev   := 'warning';
    when 'manager_overdue' then
      v_title := 'Длительная просрочка №' || n;
      v_body  := format('Длительная просрочка: наряд №%s просрочен на %s мин. %s, %s. Исполнитель: %s',
                        n, p_vars ->> 'minutes', v_eq, v_area, v_who_e);
      v_sev   := 'critical';
    when 'rework' then
      v_title := 'На доработку №' || n;
      v_body  := format('Наряд №%s возвращён на доработку. Причина: %s.', n, rtrim(coalesce(p_vars ->> 'top_reason', 'см. отчёт'), '.'));
      v_sev   := 'critical';
    when 'review_ready' then
      v_title := 'Проверка ИИ №' || n;
      v_body  := case when coalesce((p_vars ->> 'unsure')::boolean, false)
                      then format('Наряд №%s ждёт вашей проверки: ИИ не уверен в оценке.', n)
                      else format('Наряд №%s проверен ИИ: %s%s. Подтвердите закрытие.',
                                  n, p_vars ->> 'verdict_label', v_points) end;
      v_url   := '/order/' || p_order.id || '/review';
    when 'review_rework' then
      v_title := 'ИИ вернул №' || n;
      v_body  := format('ИИ вернул наряд №%s на доработку. Причина: %s. Исполнитель: %s',
                        n, rtrim(coalesce(p_vars ->> 'top_reason', 'см. отчёт'), '.'), v_who_e);
      v_sev   := 'critical';
      v_url   := '/order/' || p_order.id || '/review';
    when 'report' then
      v_title := 'Отчёт ИИ №' || n;
      v_body  := format('Наряд №%s проверен ИИ: %s%s. Ждёт подтверждения мастера.',
                        n, p_vars ->> 'verdict_label', v_points);
      v_url   := '/order/' || p_order.id || '/review';
    when 'rejected' then
      v_title := 'Отклонён №' || n;
      v_body  := format('Наряд №%s отклонён. %s, %s. Исполнитель: %s Причина: %s.',
                        n, v_eq, v_area, v_who_e, rtrim(p_vars ->> 'reason_label', '.'));
      v_sev   := 'warning';
    when 'reassigned' then
      v_title := 'Передан №' || n;
      v_body  := format('Наряд №%s передан другому исполнителю. %s, %s.', n, v_eq, v_area);
    when 'closed' then
      v_title := 'Закрыт №' || n;
      v_body  := format('Наряд №%s закрыт. Итог: %s%s.', n, p_vars ->> 'verdict_label', v_points);
    when 'cancelled' then
      v_title := 'Отменён №' || n;
      v_body  := format('Наряд №%s отменён. %s, %s. Причина: %s.', n, v_eq, v_area, rtrim(p_vars ->> 'reason', '.'));
      v_sev   := 'warning';
    else
      perform internal.fail('BAD_INPUT', 'unknown notification kind ' || p_kind);
  end case;

  insert into public.notifications (recipient_id, order_id, kind, severity, title, body, url, dedupe_key)
  values (p_recipient, p_order.id, p_kind, v_sev, v_title, v_body,
          coalesce(nullif(p_vars ->> 'url', ''), v_url), p_key)
  on conflict (recipient_id, dedupe_key) do nothing;
end $$;

------------------------------------------------------------------------------
-- triggers on orders
------------------------------------------------------------------------------

-- repeat failure link: a new unplanned order on a unit repaired in the previous 7 days,
-- with the same fault code (or no code chosen yet)
create or replace function internal.orders_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'unplanned' and new.repeat_of_order_id is null then
    select o.id into new.repeat_of_order_id
      from public.orders o
     where o.equipment_id = new.equipment_id
       and o.status in ('done','ai_review','rework','closed')
       and o.done_at >= new.created_at - interval '7 days'
       and o.done_at <= new.created_at
       and (new.suggested_fault_code is null or o.fault_code = new.suggested_fault_code)
     order by o.done_at desc
     limit 1;
  end if;
  return new;
end $$;

create trigger orders_repeat_link
  before insert on public.orders
  for each row execute function internal.orders_before_insert();

-- 1С / ТОиР integration seam (CLAUDE.md §5); the history loader sets rota.seeding to skip it
create or replace function internal.orders_outbox()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('rota.seeding', true), '') = 'on' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.integration_outbox (topic, payload)
    values ('order.created', jsonb_build_object(
      'order_id', new.id, 'number', new.number, 'type', new.type, 'priority', new.priority,
      'equipment_id', new.equipment_id,
      'inventory_no', (select inventory_no from public.equipment where id = new.equipment_id),
      'area_id', new.area_id, 'description', new.description,
      'assignee_tab_no', (select tab_no from public.employees where id = new.assignee_id),
      'due_at', new.due_at, 'created_at', new.created_at));
  elsif new.status = 'closed' and old.status is distinct from 'closed' then
    insert into public.integration_outbox (topic, payload)
    values ('order.closed', jsonb_build_object(
      'order_id', new.id, 'number', new.number, 'equipment_id', new.equipment_id,
      'inventory_no', (select inventory_no from public.equipment where id = new.equipment_id),
      'fault_code', new.fault_code, 'works_done', new.works_done,
      'assignee_tab_no', (select tab_no from public.employees where id = new.assignee_id),
      'started_at', new.started_at, 'done_at', new.done_at, 'closed_at', new.closed_at,
      'paused_total_sec', new.paused_total_sec,
      'final_verdict', new.final_verdict, 'final_score', new.final_score,
      'materials', (select coalesce(jsonb_agg(jsonb_build_object(
                      'material_id', m.material_id, 'sku', mt.sku, 'qty', m.qty, 'unit', mt.unit)), '[]'::jsonb)
                      from public.order_materials m join public.materials mt on mt.id = m.material_id
                     where m.order_id = new.id)));
  end if;
  return null;
end $$;

create trigger orders_outbox_insert
  after insert on public.orders
  for each row execute function internal.orders_outbox();
create trigger orders_outbox_close
  after update of status on public.orders
  for each row execute function internal.orders_outbox();

------------------------------------------------------------------------------
-- one order in progress per worker
------------------------------------------------------------------------------

create or replace function internal.ensure_single_in_progress(p_order public.orders, p_payload jsonb, p_now timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_other   public.orders;
  v_comment text;
begin
  perform 1 from public.employees where id = p_order.assignee_id for update;   -- one start at a time per worker
  select * into v_other
    from public.orders
   where assignee_id = p_order.assignee_id and status = 'in_progress' and id <> p_order.id
   order by started_at desc nulls last
   limit 1
   for update;
  if not found then
    return;
  end if;
  if not coalesce((p_payload ->> 'pause_current')::boolean, false) then
    perform internal.fail('ANOTHER_IN_PROGRESS',
                          jsonb_build_object('order_id', v_other.id, 'number', v_other.number)::text);
  end if;
  v_comment := case when p_order.priority = 'emergency' then 'Аварийный наряд №' || p_order.number
                    else 'Переключился на наряд №' || p_order.number end;
  update public.orders
     set status = 'paused', paused_since = p_now, last_comment = v_comment
   where id = v_other.id;
  insert into public.order_events (order_id, actor_id, action, from_status, to_status, reason, comment, payload)
  values (v_other.id, (select auth.uid()), 'pause', 'in_progress', 'paused', 'other', v_comment,
          jsonb_build_object('auto', true, 'for_order_id', p_order.id));
end $$;

------------------------------------------------------------------------------
-- the transition engine
------------------------------------------------------------------------------

create or replace function internal.apply_action(
  p_order_id         bigint,
  p_action           text,
  p_payload          jsonb,
  p_client_action_id uuid,
  p_system           boolean
)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  o            public.orders;
  v_uid        uuid := (select auth.uid());
  v_role       public.role_t := public.my_role();
  v_now        timestamptz := now();
  v_from       public.status_t;
  v_to         public.status_t;
  v_reason     text;
  v_comment    text := nullif(btrim(coalesce(p_payload ->> 'comment', '')), '');
  v_ev_payload jsonb := '{}'::jsonb;
  v_event_id   bigint;
  v_notes      jsonb := '[]'::jsonb;     -- [{to, kind, vars}] sent after the event exists
  v_note       jsonb;
  v_rev        public.ai_reviews;
  v_verdict    public.verdict_t;
  v_score      int;
  v_new        uuid;
  v_brigade    smallint;
  v_worker     public.employees;
  v_prev       uuid;
  v_priority   public.priority_t;
  v_top        text;
  v_extend     interval;
begin
  -- a repeated client_action_id returns the current order without applying the action twice
  if p_client_action_id is not null then
    select o2.* into o
      from public.orders o2 join public.order_events e on e.order_id = o2.id
     where e.client_action_id = p_client_action_id and e.order_id = p_order_id
       and (p_system or public.is_staff() or o2.assignee_id = v_uid);
    if found then
      return o;
    end if;
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    perform internal.fail('BAD_INPUT', 'order not found');
  end if;
  -- a replay that waited for the first call's lock: the event is visible now
  if p_client_action_id is not null
     and (p_system or public.is_staff() or o.assignee_id = v_uid)
     and exists (select 1 from public.order_events e where e.client_action_id = p_client_action_id and e.order_id = o.id) then
    return o;
  end if;
  v_from := o.status;

  -- who may do what
  if p_action = 'ai_result' then
    if not p_system then
      perform internal.fail('FORBIDDEN', 'system action');
    end if;
  elsif p_action in ('accept','queue','reject','start','pause','resume','complete','resume_rework') then
    if v_uid is null or v_uid <> o.assignee_id then
      perform internal.fail('FORBIDDEN', 'only the assignee');
    end if;
  elsif p_action in ('close','return','reassign','cancel','set_priority','mark_reject_justified') then
    if v_role is null or v_role not in ('master','admin') then
      perform internal.fail('FORBIDDEN', 'only a master');
    end if;
  else
    perform internal.fail('BAD_TRANSITION', 'unknown action ' || coalesce(p_action, 'null'));
  end if;

  case p_action

  when 'accept' then
    if v_from not in ('issued','queued') then perform internal.fail('BAD_TRANSITION'); end if;
    v_to := 'accepted';
    update public.orders
       set status = v_to, accepted_at = coalesce(accepted_at, v_now), queue_position = null
     where id = o.id;
    update public.employees set on_shift = true where id = v_uid and not on_shift;

  when 'queue' then
    if v_from <> 'issued' then perform internal.fail('BAD_TRANSITION'); end if;
    v_to := 'queued';
    update public.orders
       set status = v_to, queued_at = v_now,
           queue_position = (select coalesce(max(q.queue_position), 0) + 1 from public.orders q
                              where q.assignee_id = o.assignee_id and q.status = 'queued')
     where id = o.id;

  when 'reject' then
    if v_from not in ('issued','queued','accepted') then perform internal.fail('BAD_TRANSITION'); end if;
    v_reason := p_payload ->> 'reason';
    if v_reason is null or v_reason not in ('no_materials','no_permit','busy_emergency','equipment_running','other') then
      perform internal.fail('MISSING_REASON', 'reject reason');
    end if;
    if v_reason = 'other' and v_comment is null then
      perform internal.fail('MISSING_REASON', 'comment required for other');
    end if;
    v_to := 'rejected';
    update public.orders set status = v_to, rejected_at = v_now, queue_position = null where id = o.id;
    v_notes := v_notes || jsonb_build_object('to', o.master_id, 'kind', 'rejected',
                 'vars', jsonb_build_object('reason_label', internal.reject_label(v_reason)
                                            || case when v_reason = 'other' and v_comment is not null
                                                    then ': ' || lower(left(v_comment, 1)) || substr(v_comment, 2) else '' end));

  when 'start' then
    if v_from not in ('accepted','queued') then perform internal.fail('BAD_TRANSITION'); end if;
    perform internal.ensure_single_in_progress(o, p_payload, v_now);
    v_to := 'in_progress';
    update public.orders
       set status = v_to, started_at = coalesce(started_at, v_now),
           accepted_at = coalesce(accepted_at, v_now), queue_position = null
     where id = o.id;
    update public.employees set on_shift = true where id = v_uid and not on_shift;

  when 'pause' then
    if v_from <> 'in_progress' then perform internal.fail('BAD_TRANSITION'); end if;
    v_reason := p_payload ->> 'reason';
    if v_reason is null or v_reason not in ('waiting_parts','waiting_stop','waiting_permit','other') then
      perform internal.fail('MISSING_REASON', 'pause reason');
    end if;
    v_to := 'paused';
    update public.orders set status = v_to, paused_since = v_now where id = o.id;

  when 'resume' then
    if v_from <> 'paused' then perform internal.fail('BAD_TRANSITION'); end if;
    perform internal.ensure_single_in_progress(o, p_payload, v_now);
    v_to := 'in_progress';
    update public.orders
       set status = v_to,
           paused_total_sec = paused_total_sec
                              + coalesce(floor(extract(epoch from (v_now - paused_since)))::int, 0),
           paused_since = null
     where id = o.id;

  when 'complete' then
    if v_from <> 'in_progress' then perform internal.fail('BAD_TRANSITION'); end if;
    delete from public.order_materials where order_id = o.id;
    insert into public.order_materials (order_id, material_id, qty)
    select o.id, (m ->> 'material_id')::int, (m ->> 'qty')::numeric
      from jsonb_array_elements(coalesce(p_payload -> 'materials', '[]'::jsonb)) m
     where coalesce((m ->> 'qty')::numeric, 0) > 0;
    -- ai_review_id is cleared so no stale verdict shows while the new attempt is checked
    update public.orders
       set status = 'done', done_at = v_now,
           works_done = nullif(btrim(coalesce(p_payload ->> 'works_done', '')), ''),
           fault_code = nullif(p_payload ->> 'fault_code', ''),
           closing_comment = v_comment,
           ai_review_id = null
     where id = o.id;
    v_ev_payload := jsonb_build_object(
      'works_done', p_payload ->> 'works_done', 'fault_code', p_payload ->> 'fault_code',
      'materials', coalesce(p_payload -> 'materials', '[]'::jsonb),
      'no_materials', coalesce((p_payload ->> 'no_materials')::boolean, false));
    v_to := 'done';

  when 'ai_result' then
    if v_from <> 'ai_review' then perform internal.fail('BAD_TRANSITION'); end if;
    select * into v_rev from public.ai_reviews
     where id = (p_payload ->> 'review_id')::bigint and order_id = o.id;
    if not found then perform internal.fail('BAD_INPUT', 'review not found'); end if;
    v_ev_payload := jsonb_build_object('review_id', v_rev.id, 'verdict', v_rev.verdict, 'score', v_rev.score,
                                       'needs_master_review', v_rev.needs_master_review);
    if v_rev.verdict = 'rework' and not v_rev.needs_master_review then
      v_to := 'rework';
      select c ->> 'message_ru' into v_top
        from jsonb_array_elements(v_rev.checks) with ordinality as t(c, i)
       where c ->> 'status' = 'fail'
       order by i
       limit 1;
      v_top := coalesce(v_top, 'низкая оценка ИИ');
      v_extend := greatest(interval '30 minutes',
                           make_interval(secs => (coalesce(o.norm_hours, 1) * 1800)::double precision));
      update public.orders
         set status = v_to, ai_review_id = v_rev.id, rework_count = rework_count + 1,
             due_at = greatest(due_at, v_now + v_extend)
       where id = o.id;
      v_notes := v_notes
        || jsonb_build_object('to', o.assignee_id, 'kind', 'rework', 'vars', jsonb_build_object('top_reason', v_top))
        || jsonb_build_object('to', o.master_id, 'kind', 'review_rework', 'vars', jsonb_build_object('top_reason', v_top));
    else
      v_to := 'ai_review';
      update public.orders set ai_review_id = v_rev.id where id = o.id;
      v_notes := v_notes
        || jsonb_build_object('to', o.assignee_id, 'kind', 'report',
             'vars', jsonb_build_object('verdict_label', internal.verdict_label(v_rev.verdict), 'score', v_rev.score))
        || jsonb_build_object('to', o.master_id, 'kind', 'review_ready',
             'vars', jsonb_build_object('verdict_label', internal.verdict_label(v_rev.verdict), 'score', v_rev.score,
                                        'unsure', v_rev.needs_master_review));
    end if;

  when 'close' then
    if v_from not in ('ai_review','rework') then perform internal.fail('BAD_TRANSITION'); end if;
    select * into v_rev from public.ai_reviews where id = o.ai_review_id;
    v_verdict := coalesce(nullif(p_payload ->> 'final_verdict', '')::public.verdict_t, v_rev.verdict);
    v_score   := coalesce(nullif(p_payload ->> 'final_score', '')::int, v_rev.score);
    if v_verdict is null then
      perform internal.fail('MISSING_REASON', 'final_verdict required without an AI review');
    end if;
    v_to := 'closed';
    update public.orders
       set status = v_to, closed_at = v_now, final_verdict = v_verdict, final_score = v_score
     where id = o.id;
    if v_rev.id is not null then
      update public.ai_reviews
         set master_verdict = v_verdict, master_score = v_score, master_comment = v_comment,
             master_id = v_uid, master_decided_at = v_now
       where id = v_rev.id;
    end if;
    v_ev_payload := jsonb_build_object('final_verdict', v_verdict, 'final_score', v_score,
                                       'ai_verdict', v_rev.verdict, 'ai_score', v_rev.score,
                                       'changed', v_rev.id is not null
                                                  and (v_rev.verdict is distinct from v_verdict
                                                       or v_rev.score is distinct from v_score));
    v_notes := v_notes || jsonb_build_object('to', o.assignee_id, 'kind', 'closed',
                 'vars', jsonb_build_object('verdict_label', internal.verdict_label(v_verdict), 'score', v_score));

  when 'return' then
    if v_from <> 'ai_review' then perform internal.fail('BAD_TRANSITION'); end if;
    if v_comment is null then perform internal.fail('MISSING_REASON', 'comment required'); end if;
    v_to := 'rework';
    v_extend := greatest(interval '30 minutes',
                         make_interval(secs => (coalesce(o.norm_hours, 1) * 1800)::double precision));
    update public.orders
       set status = v_to, rework_count = rework_count + 1, due_at = greatest(due_at, v_now + v_extend)
     where id = o.id;
    update public.ai_reviews
       set master_verdict = 'rework', master_comment = v_comment, master_id = v_uid, master_decided_at = v_now
     where id = o.ai_review_id;
    v_notes := v_notes || jsonb_build_object('to', o.assignee_id, 'kind', 'rework',
                 'vars', jsonb_build_object('top_reason', v_comment));

  when 'resume_rework' then
    if v_from <> 'rework' then perform internal.fail('BAD_TRANSITION'); end if;
    perform internal.ensure_single_in_progress(o, p_payload, v_now);
    v_to := 'in_progress';
    -- the time between the first submission and the restart counts as a pause, so work time stays honest
    update public.orders
       set status = v_to,
           paused_total_sec = paused_total_sec
                              + coalesce(floor(extract(epoch from (v_now - done_at)))::int, 0),
           paused_since = null
     where id = o.id;

  when 'reassign' then
    if v_from not in ('issued','queued','accepted','rejected','paused','in_progress','rework') then
      perform internal.fail('BAD_TRANSITION');
    end if;
    v_brigade := nullif(p_payload ->> 'brigade_id', '')::smallint;
    v_new := nullif(p_payload ->> 'assignee_id', '')::uuid;
    if v_new is null and v_brigade is not null then
      select leader_id into v_new from public.brigades where id = v_brigade;
    end if;
    select * into v_worker from public.employees where id = v_new;
    if v_worker.id is null or v_worker.role <> 'worker' then
      perform internal.fail('BAD_INPUT', 'assignee must be a worker');
    end if;
    if not v_worker.on_shift and not coalesce((p_payload ->> 'allow_off_shift')::boolean, false) then
      perform internal.fail('NOT_ON_SHIFT', v_worker.short_name);
    end if;
    v_prev := o.assignee_id;
    v_to := 'issued';
    update public.orders
       set status = v_to, assignee_id = v_new, brigade_id = v_brigade, issued_at = v_now,
           accepted_at = null, queued_at = null, rejected_at = null, started_at = null,
           paused_since = null, paused_total_sec = 0, queue_position = null
     where id = o.id;
    v_ev_payload := jsonb_build_object('from_assignee_id', v_prev, 'to_assignee_id', v_new, 'brigade_id', v_brigade);
    v_notes := v_notes || jsonb_build_object('to', v_new,
                 'kind', case when o.priority = 'emergency' then 'emergency' else 'new_order' end, 'vars', '{}'::jsonb);
    if v_prev is distinct from v_new then
      v_notes := v_notes || jsonb_build_object('to', v_prev, 'kind', 'reassigned', 'vars', '{}'::jsonb);
    end if;

  when 'cancel' then
    if v_from in ('closed','cancelled') then perform internal.fail('BAD_TRANSITION'); end if;
    v_reason := coalesce(nullif(btrim(coalesce(p_payload ->> 'reason', '')), ''), v_comment);
    if v_reason is null then perform internal.fail('MISSING_REASON', 'cancel reason'); end if;
    v_to := 'cancelled';
    update public.orders
       set status = v_to, cancelled_at = v_now, queue_position = null, paused_since = null
     where id = o.id;
    v_notes := v_notes || jsonb_build_object('to', o.assignee_id, 'kind', 'cancelled',
                 'vars', jsonb_build_object('reason', v_reason));

  when 'set_priority' then
    if v_from not in ('issued','accepted','queued','in_progress','paused','rework') then
      perform internal.fail('BAD_TRANSITION');
    end if;
    v_priority := nullif(p_payload ->> 'priority', '')::public.priority_t;
    if v_priority is null then perform internal.fail('BAD_INPUT', 'priority required'); end if;
    v_to := v_from;
    update public.orders set priority = v_priority where id = o.id;
    v_ev_payload := jsonb_build_object('from_priority', o.priority, 'to_priority', v_priority);
    if v_priority = 'emergency' and o.priority <> 'emergency' then
      v_notes := v_notes || jsonb_build_object('to', o.assignee_id, 'kind', 'emergency', 'vars', '{}'::jsonb);
    end if;

  when 'mark_reject_justified' then
    if not exists (select 1 from public.order_events
                    where id = nullif(p_payload ->> 'reject_event_id', '')::bigint
                      and order_id = o.id and action = 'reject') then
      perform internal.fail('BAD_INPUT', 'reject event not found');
    end if;
    v_to := v_from;
    v_ev_payload := jsonb_build_object('justified', true,
                                       'reject_event_id', (p_payload ->> 'reject_event_id')::bigint);
  end case;

  if v_comment is not null then
    update public.orders set last_comment = v_comment where id = o.id;
  end if;

  insert into public.order_events
         (order_id, actor_id, action, from_status, to_status, reason, comment, payload, client_action_id)
  values (o.id, case when p_system then null else v_uid end, p_action, v_from, v_to,
          v_reason, v_comment, v_ev_payload, p_client_action_id)
  returning id into v_event_id;

  -- complete: the second step (done → ai_review) is a system event in the same transaction
  if p_action = 'complete' then
    update public.orders set status = 'ai_review' where id = o.id;
    insert into public.order_events (order_id, actor_id, action, from_status, to_status, payload)
    values (o.id, null, 'review_started', 'done', 'ai_review',
            jsonb_build_object('attempt', o.rework_count + 1));
  end if;

  perform internal.refresh_equipment(o.equipment_id);

  select * into o from public.orders where id = o.id;
  for v_note in select * from jsonb_array_elements(v_notes) loop
    perform internal.notify((v_note ->> 'to')::uuid, o, v_note ->> 'kind',
                            'ev:' || v_event_id || ':' || (v_note ->> 'kind'), v_note -> 'vars');
  end loop;

  return o;
end $$;

------------------------------------------------------------------------------
-- public RPCs
------------------------------------------------------------------------------

create or replace function public.order_action(
  p_order_id         bigint,
  p_action           text,
  p_payload          jsonb default '{}',
  p_client_action_id uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  if (select auth.uid()) is null then
    perform internal.fail('FORBIDDEN', 'sign in required');
  end if;
  begin
    o := internal.apply_action(p_order_id, p_action, coalesce(p_payload, '{}'::jsonb), p_client_action_id, false);
  exception when unique_violation then
    -- a concurrent call with the same client_action_id won the race: return its result to the same caller
    if p_client_action_id is not null then
      select o2.* into o from public.orders o2 join public.order_events e on e.order_id = o2.id
       where e.client_action_id = p_client_action_id and e.order_id = p_order_id
         and (public.is_staff() or o2.assignee_id = (select auth.uid()));
      if found then
        return o;
      end if;
    end if;
    raise;
  end;
  return o;
end $$;

-- AI results: only the secret key (service_role) may call this
create or replace function public.order_system_action(
  p_order_id bigint,
  p_action   text,
  p_payload  jsonb default '{}'
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
begin
  return internal.apply_action(p_order_id, p_action, coalesce(p_payload, '{}'::jsonb), null, true);
end $$;

create or replace function public.create_order(p jsonb, p_client_action_id uuid default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  o          public.orders;
  v_uid      uuid := (select auth.uid());
  v_role     public.role_t := public.my_role();
  v_eq       public.equipment;
  v_desc     text := nullif(btrim(coalesce(p ->> 'description', '')), '');
  v_comment  text := nullif(btrim(coalesce(p ->> 'comment', '')), '');
  v_type     public.order_type_t := coalesce(nullif(p ->> 'type', '')::public.order_type_t, 'unplanned');
  v_priority public.priority_t := coalesce(nullif(p ->> 'priority', '')::public.priority_t, 'normal');
  v_code     text := nullif(p ->> 'suggested_fault_code', '');
  v_brigade  smallint := nullif(p ->> 'brigade_id', '')::smallint;
  v_assignee uuid := nullif(p ->> 'assignee_id', '')::uuid;
  v_ref      uuid := coalesce(nullif(p ->> 'client_ref', '')::uuid, gen_random_uuid());
  v_worker   public.employees;
  v_norm     numeric;
  v_due      timestamptz;
  v_event_id bigint;
begin
  if v_uid is null or v_role is null or v_role not in ('master','admin') then
    perform internal.fail('FORBIDDEN', 'only a master');
  end if;

  -- idempotency: by client_action_id, then by client_ref
  if p_client_action_id is not null then
    select o2.* into o from public.orders o2 join public.order_events e on e.order_id = o2.id
     where e.client_action_id = p_client_action_id;
    if found then return o; end if;
  end if;
  select * into o from public.orders where client_ref = v_ref;
  if found then return o; end if;

  select * into v_eq from public.equipment where id = nullif(p ->> 'equipment_id', '')::int;
  if v_desc is null or v_eq.id is null then
    perform internal.fail('BAD_INPUT', 'description and equipment required');
  end if;

  if v_assignee is null and v_brigade is not null then
    select leader_id into v_assignee from public.brigades where id = v_brigade;
  end if;
  select * into v_worker from public.employees where id = v_assignee;
  if v_worker.id is null or v_worker.role <> 'worker' then
    perform internal.fail('BAD_INPUT', 'assignee must be a worker');
  end if;
  if not v_worker.on_shift and not coalesce((p ->> 'allow_off_shift')::boolean, false) then
    perform internal.fail('NOT_ON_SHIFT', v_worker.short_name);
  end if;

  v_norm := coalesce(nullif(p ->> 'norm_hours', '')::numeric,
                     (select norm_hours from public.work_norms where fault_code = v_code));
  v_due := coalesce(
    nullif(p ->> 'due_at', '')::timestamptz,
    now() + make_interval(secs => (nullif(p ->> 'due_in_min', '')::numeric * 60)::double precision),
    now() + make_interval(secs => (v_norm * 3600)::double precision),
    now() + case v_priority when 'emergency' then interval '2 hours' when 'high' then interval '4 hours'
                            when 'normal' then interval '8 hours' else interval '24 hours' end);

  insert into public.orders
         (client_ref, type, priority, description, comment, area_id, equipment_id, assignee_id, brigade_id,
          master_id, status, due_at, norm_hours, equipment_stopped, suggested_fault_code, is_demo, last_comment)
  values (v_ref, v_type, v_priority, v_desc, v_comment, v_eq.area_id, v_eq.id, v_assignee, v_brigade,
          v_uid, 'issued', v_due, v_norm, coalesce((p ->> 'equipment_stopped')::boolean, false), v_code,
          internal.setting_bool('demo_mode', false), v_comment)
  returning * into o;

  begin
    insert into public.order_events (order_id, actor_id, action, from_status, to_status, comment, payload, client_action_id)
    values (o.id, v_uid, 'create', null, 'issued', v_comment,
            jsonb_build_object('assignee_id', v_assignee, 'brigade_id', v_brigade, 'priority', v_priority,
                               'type', v_type, 'due_at', v_due, 'equipment_stopped', o.equipment_stopped),
            p_client_action_id)
    returning id into v_event_id;
  exception when unique_violation then
    raise exception using message = 'BAD_INPUT', detail = 'duplicate client_action_id', errcode = 'P0001';
  end;

  update public.order_photos set order_id = o.id where client_ref = v_ref and order_id is null;
  perform internal.refresh_equipment(v_eq.id);
  perform internal.notify(v_assignee, o, case when v_priority = 'emergency' then 'emergency' else 'new_order' end,
                          'ev:' || v_event_id || ':new');
  return o;
end $$;

create or replace function public.attach_photo(p jsonb)
returns public.order_photos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_role public.role_t := public.my_role();
  v_ref  uuid := nullif(p ->> 'client_ref', '')::uuid;
  v_kind public.photo_kind_t := nullif(p ->> 'kind', '')::public.photo_kind_t;
  v_path text := nullif(p ->> 'storage_path', '');
  o      public.orders;
  r      public.order_photos;
begin
  if v_uid is null then perform internal.fail('FORBIDDEN', 'sign in required'); end if;
  if v_ref is null or v_kind is null or v_path is null then
    perform internal.fail('BAD_INPUT', 'client_ref, kind and storage_path required');
  end if;
  if v_path not like 'orders/' || v_ref::text || '/' || v_kind::text || '/%' then
    perform internal.fail('BAD_INPUT', 'storage_path must be orders/{client_ref}/{kind}/{file}');
  end if;

  if coalesce(p ->> 'dhash', '') !~ '^([0-9a-f]{16})?$' or coalesce(p ->> 'sha256', '') !~ '^([0-9a-f]{64})?$' then
    perform internal.fail('BAD_INPUT', 'dhash: 16 hex, sha256: 64 hex');
  end if;
  select * into o from public.orders where client_ref = v_ref;
  if v_kind = 'after' then
    if o.id is null or o.assignee_id <> v_uid then
      perform internal.fail('FORBIDDEN', 'after photos belong to the assignee');
    end if;
  elsif not (v_role in ('master','admin') or (o.id is not null and o.assignee_id = v_uid)) then
    perform internal.fail('FORBIDDEN', 'before photos: master or assignee');
  end if;

  select * into r from public.order_photos where storage_path = v_path;
  if found then return r; end if;

  insert into public.order_photos
         (order_id, client_ref, kind, storage_path, author_id, source, captured_at,
          dhash, sha256, width, height, bytes, exif)
  values (o.id, v_ref, v_kind, v_path, v_uid, coalesce(nullif(p ->> 'source', ''), 'camera'),
          nullif(p ->> 'captured_at', '')::timestamptz, nullif(p ->> 'dhash', ''), nullif(p ->> 'sha256', ''),
          nullif(p ->> 'width', '')::int, nullif(p ->> 'height', '')::int, nullif(p ->> 'bytes', '')::int,
          p -> 'exif')
  returning * into r;
  return r;
end $$;

create or replace function public.set_on_shift(p_employee_id uuid, p_on_shift boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_role public.role_t := public.my_role();
begin
  if v_uid is null then perform internal.fail('FORBIDDEN', 'sign in required'); end if;
  if p_employee_id <> v_uid and (v_role is null or v_role not in ('master','admin')) then
    perform internal.fail('FORBIDDEN', 'only yourself or a master');
  end if;
  update public.employees set on_shift = p_on_shift where id = p_employee_id;
end $$;

create or replace function public.register_push_token(p_token text, p_platform text default null, p_device_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then perform internal.fail('FORBIDDEN', 'sign in required'); end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[.+\]$' then
    perform internal.fail('BAD_INPUT', 'not an Expo push token');
  end if;
  insert into public.push_tokens (employee_id, expo_token, platform, device_name, last_seen_at)
  values ((select auth.uid()), p_token, p_platform, p_device_name, now())
  on conflict (expo_token) do update
     set employee_id = excluded.employee_id, platform = excluded.platform,
         device_name = excluded.device_name, last_seen_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where expo_token = p_token and employee_id = (select auth.uid());
$$;

-- demo controls for masters, every setting for admins
create or replace function public.set_setting(p_key text, p_value jsonb)
returns public.settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.role_t := public.my_role();
  r      public.settings;
begin
  if not (v_role = 'admin' or (v_role = 'master' and p_key in ('demo_mode','demo_time_scale'))) then
    perform internal.fail('FORBIDDEN', 'setting ' || coalesce(p_key, 'null'));
  end if;
  if p_key = 'demo_mode' and jsonb_typeof(p_value) is distinct from 'boolean'
     or p_key = 'demo_time_scale' and (jsonb_typeof(p_value) is distinct from 'number' or (p_value #>> '{}')::numeric not between 1 and 10) then
    perform internal.fail('BAD_INPUT', 'invalid value for ' || p_key);
  end if;
  insert into public.settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value
  returning * into r;
  return r;
end $$;

------------------------------------------------------------------------------
-- grants
------------------------------------------------------------------------------

revoke execute on all functions in schema internal from public;

revoke execute on function
  public.my_role(), public.is_staff(),
  public.create_order(jsonb, uuid), public.order_action(bigint, text, jsonb, uuid),
  public.order_system_action(bigint, text, jsonb), public.attach_photo(jsonb),
  public.set_on_shift(uuid, boolean), public.register_push_token(text, text, text),
  public.unregister_push_token(text), public.set_setting(text, jsonb)
from public, anon;

grant execute on function
  public.my_role(), public.is_staff(),
  public.create_order(jsonb, uuid), public.order_action(bigint, text, jsonb, uuid),
  public.attach_photo(jsonb), public.set_on_shift(uuid, boolean),
  public.register_push_token(text, text, text), public.unregister_push_token(text),
  public.set_setting(text, jsonb)
to authenticated;

revoke execute on function public.order_system_action(bigint, text, jsonb) from authenticated;
grant execute on function public.order_system_action(bigint, text, jsonb) to service_role;
grant execute on function public.my_role(), public.is_staff() to service_role;
