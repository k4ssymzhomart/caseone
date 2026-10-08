-- Rota · Phase 1 acceptance: drive orders through every transition, check illegal moves,
-- roles, RLS, idempotency, notifications and the outbox. Run as postgres after the seed.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
update public.employees set on_shift = (tab_no in ('2001','2002','2003','2006','2007'));
select test.claims('1001') as m1, test.claims('2001') as w1, test.claims('2002') as w2,
       test.claims('2006') as w6, test.claims('3001') as mgr, test.claims('9001') as adm \gset

\echo '1. anon has no access'
set role anon;
select test.expect($$select public.create_order('{}'::jsonb)$$, '42501');
select test.expect($$select public.order_action(1, 'accept')$$, '42501');
select test.expect($$select public.order_system_action(1, 'ai_result', '{}')$$, '42501');
select test.expect($$select count(*) from public.orders$$, '42501');
select test.expect($$select count(*) from public.v_worker_status$$, '42501');
select test.expect($$select count(*) from public.employees$$, '42501');

\echo '2. master creates an emergency order (with a before photo uploaded first)'
reset role; set role authenticated;
select set_config('request.jwt.claims', :'m1', false) \g /dev/null
select gen_random_uuid() as ref1 \gset
select test.ok((select order_id is null from public.attach_photo(jsonb_build_object(
  'client_ref', :'ref1', 'kind', 'before', 'source', 'camera',
  'storage_path', 'orders/' || :'ref1' || '/before/p1.jpg', 'sha256', repeat('a', 64)))), 'before photo stored');
select test.expect(format($$select public.attach_photo(jsonb_build_object('client_ref', %L, 'kind', 'before', 'storage_path', 'x/y.jpg'))$$, :'ref1'), 'BAD_INPUT');
select o.id as o1 from public.create_order(jsonb_build_object(
  'type','unplanned','priority','emergency','description','Течь масла из-под крышки',
  'equipment_id', 20, 'assignee_id', test.uid('2001'), 'suggested_fault_code', 'Г-01',
  'equipment_stopped', true, 'client_ref', :'ref1'), 'a0000000-0000-0000-0000-000000000001') o \gset
select test.ok((select id from public.create_order('{}'::jsonb, 'a0000000-0000-0000-0000-000000000001')) = :o1, 'create is idempotent');
select test.ok((select status = 'issued' and area_id = 3 and norm_hours = 1.5
                       and due_at between now() + interval '89 min' and now() + interval '91 min'
                  from public.orders where id = :o1), 'o1 issued in area 3, due by the Г-01 norm');
select test.ok((select is_stopped from public.equipment where id = 20), 'pump marked stopped');
select test.ok((select order_id = :o1 from public.order_photos where client_ref = :'ref1'), 'before photo linked by client_ref');
select test.expect($$select public.create_order(jsonb_build_object('description', '', 'equipment_id', 20, 'assignee_id', test.uid('2001')))$$, 'BAD_INPUT');
select test.expect($$select public.create_order(jsonb_build_object('description', 'x', 'equipment_id', 20, 'assignee_id', test.uid('1001')))$$, 'BAD_INPUT');
select test.expect($$select public.create_order(jsonb_build_object('description', 'x', 'equipment_id', 20, 'assignee_id', test.uid('2004')))$$, 'NOT_ON_SHIFT');
select test.expect(format('select public.order_action(%s, ''ai_result'', ''{}'')', :o1), 'FORBIDDEN');
select test.expect(format('select public.order_system_action(%s, ''ai_result'', ''{}'')', :o1), '42501');

\echo '3. another worker cannot see or touch it'
select set_config('request.jwt.claims', :'w2', false) \g /dev/null
select test.ok((select count(*) from public.orders where id = :o1) = 0, 'w2 does not see o1');
select test.ok((select count(*) from public.v_orders where id = :o1) = 0, 'w2 does not see o1 in v_orders');
select test.expect(format('select public.order_action(%s, ''accept'')', :o1), 'FORBIDDEN');
select test.expect(format('select public.create_order(''{}''::jsonb)'), 'FORBIDDEN');

\echo '4. assignee: illegal moves, queue, accept (idempotent), start, pause, resume'
select set_config('request.jwt.claims', :'w1', false) \g /dev/null
select test.ok((select count(*) from public.notifications where order_id = :o1 and kind = 'emergency'
                  and url = '/emergency/' || :o1 and severity = 'critical') = 1, 'emergency notification');
select test.ok((select body from public.notifications where order_id = :o1 and kind = 'emergency')
               = 'АВАРИЙНЫЙ наряд №' || (select number from public.orders where id = :o1)
                 || '. Насос НШ-32 маслостанции, Участок обогащения. Требует ответа.', 'emergency text');
select test.expect(format('select public.order_action(%s, ''start'')', :o1), 'BAD_TRANSITION');
select test.expect(format('select public.order_action(%s, ''complete'')', :o1), 'BAD_TRANSITION');
select test.expect(format('select public.order_action(%s, ''close'')', :o1), 'FORBIDDEN');
select test.expect(format('select public.order_action(%s, ''reassign'')', :o1), 'FORBIDDEN');
select test.expect(format('select public.order_action(%s, ''fly'')', :o1), 'BAD_TRANSITION');
select test.expect(format('update public.orders set status = ''closed'' where id = %s', :o1), '42501');
select test.expect(format('insert into public.order_events (order_id, action) values (%s, ''x'')', :o1), '42501');
select test.ok((select status = 'queued' and queue_position = 1 from public.order_action(:o1, 'queue')), 'queued at 1');
select test.ok((select status = 'accepted' from public.order_action(:o1, 'accept', '{}', 'b0000000-0000-0000-0000-000000000001')), 'accepted');
select test.ok((select status = 'accepted' from public.order_action(:o1, 'accept', '{}', 'b0000000-0000-0000-0000-000000000001')), 'repeat returns current');
select test.ok((select count(*) from public.order_events where order_id = :o1 and action = 'accept') = 1, 'one accept event');
select test.ok((select status = 'in_progress' and started_at is not null from public.order_action(:o1, 'start')), 'in progress');
select test.expect(format('select public.order_action(%s, ''pause'')', :o1), 'MISSING_REASON');
select test.ok((select status = 'paused' and last_comment = 'ждём кольцо со склада'
                  from public.order_action(:o1, 'pause', '{"reason":"waiting_parts","comment":"ждём кольцо со склада"}')), 'paused');
select test.ok((select status = 'in_progress' and paused_since is null from public.order_action(:o1, 'resume')), 'resumed');

\echo '5. one order in progress per worker'
select set_config('request.jwt.claims', :'m1', false) \g /dev/null
select o.id as o2 from public.create_order(jsonb_build_object(
  'type','unplanned','priority','normal','description','Шум подшипника','equipment_id', 12,
  'assignee_id', test.uid('2001'), 'suggested_fault_code', 'М-02')) o \gset
select set_config('request.jwt.claims', :'w1', false) \g /dev/null
select test.ok((select status = 'accepted' from public.order_action(:o2, 'accept')), 'o2 accepted');
select test.expect(format('select public.order_action(%s, ''start'')', :o2), 'ANOTHER_IN_PROGRESS');
select test.ok((select status = 'in_progress' from public.order_action(:o2, 'start', '{"pause_current": true}')), 'o2 started');
select test.ok((select status = 'paused' and last_comment = 'Переключился на наряд №' || (select number from public.orders where id = :o2)
                  from public.orders where id = :o1), 'o1 auto paused');
select test.expect(format('select public.order_action(%s, ''resume'')', :o1), 'ANOTHER_IN_PROGRESS');
select test.ok((select status = 'paused' from public.order_action(:o2, 'pause', '{"reason":"other","comment":"жду допуск"}')), 'o2 paused');
select test.ok((select status = 'in_progress' from public.order_action(:o1, 'resume')), 'o1 resumed');

\echo '6. after photo, complete, AI result, master close with a changed score'
select test.ok((select order_id = :o1 from public.attach_photo(jsonb_build_object(
  'client_ref', (select client_ref from public.orders where id = :o1), 'kind', 'after', 'source', 'camera',
  'storage_path', 'orders/' || (select client_ref from public.orders where id = :o1) || '/after/a1.jpg'))), 'after photo');
select client_ref as cr1 from public.orders where id = :o1 \gset
select set_config('request.jwt.claims', :'w2', false) \g /dev/null
select test.expect(format($$select public.attach_photo(jsonb_build_object('client_ref', %L, 'kind', 'after', 'storage_path', 'orders/' || %L || '/after/z.jpg'))$$,
                          :'cr1', :'cr1'), 'FORBIDDEN');
select set_config('request.jwt.claims', :'w1', false) \g /dev/null
select test.ok((select status = 'ai_review' and done_at is not null and fault_code = 'Г-01'
                  from public.order_action(:o1, 'complete', jsonb_build_object(
                    'works_done', 'Заменил уплотнительное кольцо крышки, подтянул болты',
                    'fault_code', 'Г-01', 'comment', 'Течи нет',
                    'materials', jsonb_build_array(jsonb_build_object('material_id', 21, 'qty', 2),
                                                   jsonb_build_object('material_id', 17, 'qty', 2),
                                                   jsonb_build_object('material_id', 39, 'qty', 1))),
                    'c0000000-0000-0000-0000-000000000001')), 'complete → ai_review');
select test.ok((select string_agg(action || ':' || coalesce(from_status::text, '') || '>' || coalesce(to_status::text, ''), ',' order by id)
                  from public.order_events where order_id = :o1 and id > (select max(id) - 2 from public.order_events where order_id = :o1))
               = 'complete:in_progress>done,review_started:done>ai_review', 'two events on complete');
select test.ok((select count(*) from public.order_materials where order_id = :o1) = 3, 'three material lines');
select test.ok((select count(*) from public.orders) = 2, 'worker sees own orders only');

reset role; set role service_role;
select set_config('request.jwt.claims', '', false) \g /dev/null
insert into public.ai_reviews (order_id, attempt, verdict, score, score5, confidence, checks)
values (:o1, 1, 'accepted', 88, 4, 0.86, '[{"id":"R1","status":"pass","points":20,"max":20,"message_ru":"всё заполнено"}]')
returning id as r1 \gset
select test.ok((select status = 'ai_review' and ai_review_id = :r1
                  from public.order_system_action(:o1, 'ai_result', jsonb_build_object('review_id', :r1))), 'ai_result keeps ai_review');
select test.ok((select count(*) from public.notifications where order_id = :o1 and kind in ('report','review_ready')) = 2, 'report + review_ready');
select test.ok((select body from public.notifications where order_id = :o1 and kind = 'review_ready')
               = 'Наряд №' || (select number from public.orders where id = :o1) || ' проверен ИИ: Принято, 88 баллов. Подтвердите закрытие.', 'review_ready text');

reset role; set role authenticated;
select set_config('request.jwt.claims', :'m1', false) \g /dev/null
select test.ok((select status = 'closed' and final_verdict = 'accepted' and final_score = 90
                  from public.order_action(:o1, 'close', '{"final_score": 90, "comment": "Согласен"}')), 'closed with override');
select test.ok((select master_score = 90 and master_verdict = 'accepted' from public.ai_reviews where id = :r1), 'review keeps master decision');
select test.ok((select not is_stopped from public.equipment where id = 20), 'pump running again');
select test.expect(format('select public.order_action(%s, ''cancel'', ''{"reason":"x"}'')', :o1), 'BAD_TRANSITION');

\echo '7. rework by AI, rework by master, close'
select set_config('request.jwt.claims', :'w1', false) \g /dev/null
select test.ok((select status = 'in_progress' from public.order_action(:o2, 'resume')), 'o2 resumed');
select test.ok((select status = 'ai_review' from public.order_action(:o2, 'complete', jsonb_build_object(
  'works_done', 'Заменил подшипники', 'fault_code', 'М-02',
  'materials', jsonb_build_array(jsonb_build_object('material_id', 2, 'qty', 6))))), 'o2 submitted');
reset role; set role service_role;
insert into public.ai_reviews (order_id, attempt, verdict, score, score5, confidence, checks)
values (:o2, 1, 'rework', 41, 2, 0.9, '[{"id":"R1","status":"fail","points":0,"max":20,"message_ru":"нет фото после: обязательно для внеплановых работ"},{"id":"R3","status":"fail","points":0,"max":15,"message_ru":"перерасход: подшипник 6 шт при норме до 2"}]')
returning id as r2 \gset
select test.ok((select status = 'rework' and rework_count = 1 and due_at >= now() + interval '89 min'
                  from public.order_system_action(:o2, 'ai_result', jsonb_build_object('review_id', :r2))), 'AI rework');
select test.ok((select body from public.notifications where order_id = :o2 and kind = 'rework')
               = 'Наряд №' || (select number from public.orders where id = :o2) || ' возвращён на доработку. Причина: нет фото после: обязательно для внеплановых работ.', 'rework text');
select test.ok((select count(*) from public.notifications where order_id = :o2 and kind = 'review_rework') = 1, 'master told');
reset role; set role authenticated;
select set_config('request.jwt.claims', :'w1', false) \g /dev/null
select test.ok((select status = 'in_progress' and paused_total_sec >= 0 from public.order_action(:o2, 'resume_rework')), 'resume rework');
select test.ok((select status = 'ai_review' from public.order_action(:o2, 'complete', jsonb_build_object(
  'works_done', 'Заменил подшипники, фото приложил', 'fault_code', 'М-02',
  'materials', jsonb_build_array(jsonb_build_object('material_id', 2, 'qty', 2))))), 'o2 resubmitted');
select test.ok((select payload ->> 'attempt' = '2' from public.order_events where order_id = :o2 and action = 'review_started' order by id desc limit 1), 'attempt 2');
select test.ok((select count(*) from public.order_materials where order_id = :o2 and qty = 2) = 1
               and (select count(*) from public.order_materials where order_id = :o2) = 1, 'materials replaced');
reset role; set role service_role;
insert into public.ai_reviews (order_id, attempt, verdict, score, score5, confidence, needs_master_review, checks)
values (:o2, 2, 'accepted_with_remarks', 72, 4, 0.4, true, '[]') returning id as r3 \gset
select test.ok((select status = 'ai_review' from public.order_system_action(:o2, 'ai_result', jsonb_build_object('review_id', :r3))), 'unsure stays');
select test.ok((select body like '%ждёт вашей проверки: ИИ не уверен%' from public.notifications
                 where order_id = :o2 and kind = 'review_ready'), 'unsure text');
reset role; set role authenticated;
select set_config('request.jwt.claims', :'m1', false) \g /dev/null
select test.expect(format('select public.order_action(%s, ''return'')', :o2), 'MISSING_REASON');
select test.ok((select status = 'rework' and rework_count = 2
                  from public.order_action(:o2, 'return', '{"comment":"Нет фото после замены"}')), 'master return');
select test.ok((select master_verdict = 'rework' from public.ai_reviews where id = :r3), 'review marked rework by master');
select set_config('request.jwt.claims', :'w1', false) \g /dev/null
select test.ok((select status = 'in_progress' from public.order_action(:o2, 'resume_rework')), 'resume rework 2');
select test.ok((select status = 'ai_review' from public.order_action(:o2, 'complete', jsonb_build_object('works_done', 'Готово', 'fault_code', 'М-02', 'no_materials', true))), 'third submit');
select set_config('request.jwt.claims', :'m1', false) \g /dev/null
select test.ok((select ai_review_id is null from public.orders where id = :o2), 'no stale review while checking');
select test.expect(format('select public.order_action(%s, ''close'')', :o2), 'MISSING_REASON');
select test.ok((select status = 'closed' and final_verdict = 'accepted_with_remarks' and final_score = 72
                  from public.order_action(:o2, 'close', '{"final_verdict":"accepted_with_remarks","final_score":72,"comment":"Закрываю сам"}')),
               'master closes without an AI review');

\echo '8. reject, justified reject, reassign, off shift, priority, cancel, brigade'
select o.id as o3 from public.create_order(jsonb_build_object(
  'type','unplanned','priority','normal','description','Шум подшипника','equipment_id', 13,
  'assignee_id', test.uid('2002'), 'due_in_min', 1)) o \gset
select test.ok((select due_at between now() + interval '55 s' and now() + interval '65 s' from public.orders where id = :o3), 'due_in_min');
select set_config('request.jwt.claims', :'w2', false) \g /dev/null
select test.expect(format('select public.order_action(%s, ''reject'')', :o3), 'MISSING_REASON');
select test.expect(format('select public.order_action(%s, ''reject'', ''{"reason":"other"}'')', :o3), 'MISSING_REASON');
select test.ok((select status = 'rejected' from public.order_action(:o3, 'reject', '{"reason":"no_permit"}')), 'rejected');
select test.ok((select board_column = 'issued' and last_reason = 'no_permit' from public.v_orders where id = :o3), 'rejected sits in issued column');
select set_config('request.jwt.claims', :'m1', false) \g /dev/null
select test.ok((select body like '%отклонён%Причина: Нет допуска.' from public.notifications where order_id = :o3 and kind = 'rejected'), 'master told about reject');
select id as rej from public.order_events where order_id = :o3 and action = 'reject' \gset
select test.ok((select status = 'rejected' from public.order_action(:o3, 'mark_reject_justified', jsonb_build_object('reject_event_id', :rej))), 'justified');
select test.ok((select payload ->> 'justified' = 'true' from public.order_events where order_id = :o3 and action = 'mark_reject_justified'), 'justified event');
select test.expect(format($$select public.order_action(%s, 'reassign', jsonb_build_object('assignee_id', test.uid('2004')))$$, :o3), 'NOT_ON_SHIFT');
select test.ok((select status = 'issued' and assignee_id = test.uid('2006') and accepted_at is null and rejected_at is null
                  from public.order_action(:o3, 'reassign', jsonb_build_object('assignee_id', test.uid('2006')))), 'reassigned to 2006');
select test.ok((select status = 'issued' from public.order_action(:o3, 'set_priority', '{"priority":"emergency"}')), 'priority raised');
select set_config('request.jwt.claims', :'w6', false) \g /dev/null
select test.ok((select count(*) from public.notifications where order_id = :o3 and kind in ('new_order','emergency')) = 2, '2006 got new + emergency');
select set_config('request.jwt.claims', :'w2', false) \g /dev/null
select test.ok((select count(*) from public.notifications where order_id = :o3 and kind = 'reassigned') = 1, '2002 told about reassign');
select test.ok((select count(*) from public.orders where id = :o3) = 0, '2002 no longer sees o3');
select set_config('request.jwt.claims', :'m1', false) \g /dev/null
select test.expect(format('select public.order_action(%s, ''cancel'')', :o3), 'MISSING_REASON');
select test.ok((select status = 'cancelled' from public.order_action(:o3, 'cancel', '{"reason":"Дубликат"}')), 'cancelled');
select test.expect(format('select public.order_action(%s, ''set_priority'', ''{"priority":"high"}'')', :o3), 'BAD_TRANSITION');
select o.id as o4 from public.create_order(jsonb_build_object(
  'type','planned','priority','planned','description','ППР дробилки','equipment_id', 9, 'brigade_id', 2)) o \gset
select test.ok((select assignee_id = test.uid('2007') and brigade_id = 2 and due_at > now() + interval '23 hours'
                  from public.orders where id = :o4), 'brigade order goes to the leader');

\echo '9. read models, suggestion, settings, notifications'
select test.ok((select count(*) from public.v_worker_status) = 15, '15 workers');
select test.ok((select status from public.v_worker_status where tab_no = '2004') = 'off', '2004 off');
select test.ok((select status from public.v_worker_status where tab_no = '2003') = 'free', '2003 free');
select test.ok((select count(*) from public.suggest_assignees(20)) = 3, 'three suggestions');
select test.ok((select short_name = 'Ахметов Е.' and reasons[1] = 'Свободен'
                  from public.suggest_assignees(20) limit 1), 'Ахметов first for the pump');
select test.ok((select count(*) from public.v_brigade_status) = 3, 'brigades');
select test.ok((select (value #>> '{}')::boolean from public.set_setting('demo_mode', 'true')), 'master sets demo mode');
select test.expect($$select public.set_setting('ai_confidence_threshold', '0.5')$$, 'FORBIDDEN');
select set_config('request.jwt.claims', :'adm', false) \g /dev/null
select test.ok((select key = 'ai_confidence_threshold' from public.set_setting('ai_confidence_threshold', '0.6')), 'admin sets anything');
select set_config('request.jwt.claims', :'mgr', false) \g /dev/null
select test.ok((select count(*) from public.orders) >= 4, 'manager sees all');
select test.expect($$select public.create_order('{}'::jsonb)$$, 'FORBIDDEN');
select test.expect($$select public.set_setting('demo_mode', 'false')$$, 'FORBIDDEN');
select set_config('request.jwt.claims', :'w1', false) \g /dev/null
select test.ok((select count(*) from public.notifications where recipient_id <> test.uid('2001')) = 0, 'own notifications only');
update public.notifications set read_at = now() where order_id = :o1;
select test.ok((select bool_and(read_at is not null) from public.notifications where order_id = :o1), 'marked read');
select test.expect(format('update public.notifications set body = ''x'' where order_id = %s', :o1), '42501');
select test.expect($$select public.register_push_token('nope')$$, 'BAD_INPUT');
select public.register_push_token('ExponentPushToken[abc123]', 'ios', 'iPhone 16 Simulator');
select test.ok((select count(*) from public.push_tokens) = 1, 'token stored');
select public.set_on_shift(test.uid('2001'), false);
select test.expect($$select public.set_on_shift(test.uid('2002'), false)$$, 'FORBIDDEN');

\echo '10. outbox and audit trail'
reset role;
select test.ok((select count(*) from public.integration_outbox where topic = 'order.closed') = 2, 'two closed in outbox');
select test.ok((select jsonb_array_length(payload -> 'materials') = 3 from public.integration_outbox
                 where topic = 'order.closed' and (payload ->> 'order_id')::bigint = :o1), 'materials in outbox');
select test.ok(not exists (select 1 from public.order_events e where e.to_status is distinct from e.from_status and e.to_status is null), 'events have targets');

\echo '11. watchdog: reminder at half time, overdue to worker and master, escalation, manager'
reset role;
select set_config('request.jwt.claims', :'m1', false) \g /dev/null
set role authenticated;
select o.id as o5 from public.create_order(jsonb_build_object(
  'type','unplanned','priority','normal','description','Перегрев','equipment_id', 17,
  'assignee_id', test.uid('2003'), 'due_in_min', 1)) o \gset
reset role;
select set_config('request.jwt.claims', '', false) \g /dev/null
select test.ok((internal.watchdog_tick() ->> 'reminders')::int = 0, 'no reminder at 60 s left');
update public.orders set issued_at = issued_at - interval '35 seconds', due_at = due_at - interval '35 seconds' where id = :o5;
select internal.watchdog_tick() \g /dev/null
select test.ok((select count(*) from public.notifications where order_id = :o5 and kind = 'reminder') = 1, 'reminder at 25 s left');
select test.ok((select body from public.notifications where order_id = :o5 and kind = 'reminder')
               = 'Через 1 мин истекает срок наряда №' || (select number from public.orders where id = :o5) || '. Вентилятор ВДН-12,5, Участок обогащения.', 'reminder text');
update public.orders set issued_at = issued_at - interval '30 seconds', due_at = due_at - interval '30 seconds' where id = :o5;
select internal.watchdog_tick() \g /dev/null
select internal.watchdog_tick() \g /dev/null
select test.ok((select count(*) from public.notifications where order_id = :o5 and kind = 'overdue') = 2, 'overdue once each to worker and master');
select test.ok((select body like 'Наряд №% просрочен на 1 мин. Вентилятор ВДН-12,5, Участок обогащения. Исполнитель: Нурпеисов А. Статус: Выдан с %.'
                  from public.notifications where order_id = :o5 and kind = 'overdue' limit 1), 'overdue text in the case format');
update public.orders set issued_at = issued_at - interval '11 minutes', due_at = due_at - interval '16 minutes' where id = :o5;
select internal.watchdog_tick() \g /dev/null
select test.ok((select count(*) from public.notifications where order_id = :o5 and kind = 'overdue') = 4, 'overdue repeats after 15 min');
select test.ok((select count(*) from public.notifications where order_id = :o5 and kind = 'escalation'
                  and url like '/order/%?reassign=%') = 1, 'escalation with a one tap reassign target');
select test.ok((select body like 'Наряд №% не принят за 12 мин.%Предлагаем: %' from public.notifications where order_id = :o5 and kind = 'escalation'), 'escalation text');
update public.orders set due_at = due_at - interval '60 minutes' where id = :o5;
select internal.watchdog_tick() \g /dev/null
select test.ok((select count(*) from public.notifications where order_id = :o5 and kind = 'manager_overdue') = 1, 'manager told once');
select internal.watchdog_tick() \g /dev/null
select test.ok((select count(*) from public.notifications where order_id = :o5 and kind = 'manager_overdue') = 1, 'still once');

\echo '12. review regressions: input validation, report access, replay keys'
select set_config('request.jwt.claims', :'w1', false) \g /dev/null
set role authenticated;
select test.expect(format($$select public.attach_photo(jsonb_build_object('client_ref', %L, 'kind', 'after', 'dhash', 'not-a-hex-hash!!', 'storage_path', 'orders/' || %L || '/after/bad.jpg'))$$, :'cr1', :'cr1'), 'BAD_INPUT');
select test.expect($$select public.shift_report(now() - interval '1 day', now())$$, 'FORBIDDEN');
select test.expect($$select public.dashboard(now() - interval '1 day', now())$$, 'FORBIDDEN');
select test.expect($$select * from public.suggest_assignees(20)$$, 'FORBIDDEN');
select test.ok((select count(*) from public.rating(now() - interval '30 days', now())) <= 1, 'a worker sees only their own rating row');
select test.ok((select id from public.order_action(:o1, 'accept', '{}', 'a0000000-0000-0000-0000-000000000001')) = :o1, 'the assignee may replay a key of their own order');
select set_config('request.jwt.claims', :'w2', false) \g /dev/null
select test.expect(format('select public.order_action(%s, ''accept'', ''{}'', ''a0000000-0000-0000-0000-000000000001'')', :o1), 'FORBIDDEN');
select set_config('request.jwt.claims', :'m1', false) \g /dev/null
select test.expect($$select public.set_setting('demo_time_scale', '"x10"')$$, 'BAD_INPUT');
select test.expect($$select public.set_setting('demo_time_scale', '100000')$$, 'BAD_INPUT');
select test.expect($$select public.set_setting('demo_mode', '"да"')$$, 'BAD_INPUT');
select test.ok((select (value #>> '{}')::int = 1 from public.settings where key = 'demo_time_scale'), 'time scale untouched');
reset role;
update public.settings set value = '"broken"' where key = 'remind_before_min';
select test.ok((internal.watchdog_tick() ? 'overdue'), 'watchdog survives a malformed setting');
update public.settings set value = '30' where key = 'remind_before_min';

\echo 'ALL TRANSITION TESTS PASSED'
