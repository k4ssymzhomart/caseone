-- Rota · AI check scoring (rules R1..R4 + LLM L1/L2), verdicts, idempotency. Run after transitions.sql.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
reset role;
update public.settings set value = 'false' where key = 'demo_mode';
\set good_llm '{"work_match":{"verdict":"full","explanation":"Течь устранена заменой кольца"},"code_consistent":true,"suggested_code":"Г-01","materials_logic":{"verdict":"ok","explanation":"по норме"},"photo":{"after_present":true,"same_equipment":"yes","problem_resolved":"yes","quality_issues":[],"score_1_5":5,"explanation":"масла нет, крышка чистая"},"confidence":0.9,"feedback_worker":{"good":["Течь устранена"],"improve":[]},"summary_master":"Течь устранена, замечаний нет"}'

\echo 'G1 good repair → accepted'
select test.make_done('2001', 20, 'Г-01', 'unplanned', 'Заменил уплотнительное кольцо крышки, подтянул болты',
  '[{"material_id":21,"qty":2},{"material_id":17,"qty":2},{"material_id":39,"qty":1}]', '{"source":"camera","dhash":"0f0f0f0f0f0f0f0f"}', 80) as g1 \gset
select test.ok((select verdict = 'accepted' and score = 100 and not needs_master_review
                  from public.ai_submit(:g1, :'good_llm'::jsonb, '{"model":"claude-sonnet-5-5","latency_ms":9000}')), 'G1 accepted 100');
select test.ok((select status = 'ai_review' and ai_review_id is not null from public.orders where id = :g1), 'G1 waits for the master');
select test.ok((select id from public.ai_submit(:g1, null)) = (select ai_review_id from public.orders where id = :g1), 'G1 second submit returns the same review');
select test.ok((select count(*) from public.ai_reviews where order_id = :g1) = 1, 'G1 one review per attempt');

\echo 'G2 no after photo on an unplanned order → rework'
select test.make_done('2002', 12, 'М-02', 'unplanned', 'Заменил подшипник, смазал узел',
  '[{"material_id":2,"qty":1},{"material_id":18,"qty":0.5}]', null, 120) as g2 \gset
select test.ok((select verdict = 'rework' and checks -> 0 ->> 'status' = 'fail' from public.ai_submit(:g2, :'good_llm'::jsonb)), 'G2 rework by R1');
select test.ok((select status = 'rework' from public.orders where id = :g2), 'G2 back to the worker');

\echo 'G3 the demo case: no photo and 6 bearings → rework with both reasons'
select test.make_done('2002', 12, 'М-02', 'unplanned', 'Заменил подшипники',
  '[{"material_id":2,"qty":6}]', null, 150) as g3 \gset
select test.ok((select verdict = 'rework'
                       and checks -> 0 ->> 'message_ru' like 'нет фото после: обязательно для внеплановых работ%'
                       and checks -> 2 ->> 'message_ru' = 'перерасход: подшипник 3626 6 шт при норме до 2'
                  from public.ai_submit(:g3, null)), 'G3 reasons');

\echo 'G4 duplicate photo of another order → rework'
select test.make_done('2001', 20, 'Г-01', 'unplanned', 'Заменил уплотнительное кольцо крышки, подтянул болты',
  '[{"material_id":21,"qty":2}]', '{"source":"camera","dhash":"0f0f0f0f0f0f0f0e"}', 80) as g4 \gset
select test.ok((select verdict = 'rework' and checks -> 1 ->> 'message_ru' like 'фото совпадает с фото наряда №%'
                  from public.ai_submit(:g4, :'good_llm'::jsonb)), 'G4 duplicate');

\echo 'G5 unrelated works text → rework by the LLM'
select test.make_done('2001', 20, 'Г-01', 'unplanned', 'Покрасил ограждение и убрал мусор вокруг',
  '[{"material_id":21,"qty":2}]', '{"source":"camera","dhash":"a0a0a0a0a0a0a0a0"}', 80) as g5 \gset
select test.ok((select verdict = 'rework' from public.ai_submit(:g5,
  '{"work_match":{"verdict":"none","explanation":"работы не связаны с течью"},"code_consistent":true,"materials_logic":{"verdict":"ok","explanation":""},"photo":{"after_present":true,"same_equipment":"yes","problem_resolved":"unsure","quality_issues":[],"score_1_5":3,"explanation":""},"confidence":0.85,"feedback_worker":{"good":[],"improve":["Опишите ремонт"]},"summary_master":"Работы не устраняют течь"}'::jsonb)), 'G5 rework');

\echo 'G6 wrong code with untypical materials → accepted with remarks'
select test.make_done('2001', 20, 'Э-03', 'unplanned', 'Заменил подшипник насоса и смазал узел',
  '[{"material_id":2,"qty":1},{"material_id":18,"qty":0.5}]', '{"source":"camera","dhash":"b1b1b1b1b1b1b1b1"}', 80) as g6 \gset
select test.ok((select verdict = 'accepted_with_remarks' and score between 60 and 79 from public.ai_submit(:g6,
  '{"work_match":{"verdict":"partial","explanation":"ремонт механический"},"code_consistent":false,"suggested_code":"М-02","materials_logic":{"verdict":"ok","explanation":""},"photo":{"after_present":true,"same_equipment":"yes","problem_resolved":"yes","quality_issues":[],"score_1_5":5,"explanation":""},"confidence":0.8,"feedback_worker":{"good":[],"improve":["Укажите верный шифр"]},"summary_master":"Шифр не соответствует работам"}'::jsonb)), 'G6 remarks');

\echo 'G7 unclear photo, low confidence → needs master review, stays in ai_review'
select test.make_done('2001', 20, 'Г-01', 'unplanned', 'Заменил уплотнительное кольцо крышки, подтянул болты',
  '[{"material_id":21,"qty":2}]', '{"source":"camera","dhash":"c2c2c2c2c2c2c2c2"}', 80) as g7 \gset
select test.ok((select needs_master_review and verdict = 'rework' from public.ai_submit(:g7,
  '{"work_match":{"verdict":"full","explanation":""},"code_consistent":true,"materials_logic":{"verdict":"ok","explanation":""},"photo":{"after_present":true,"same_equipment":"unsure","problem_resolved":"no","quality_issues":["размыто"],"score_1_5":1,"explanation":"фото размыто"},"confidence":0.35,"feedback_worker":{"good":[],"improve":["Сделайте чёткое фото"]},"summary_master":"Фото неразборчиво"}'::jsonb)), 'G7 unsure');
select test.ok((select status = 'ai_review' from public.orders where id = :g7), 'G7 the master decides');

\echo 'G8 LLM unavailable, rules pass → rules-only review for the master'
select test.make_done('2001', 20, 'Г-01', 'unplanned', 'Заменил уплотнительное кольцо крышки, подтянул болты',
  '[{"material_id":21,"qty":2}]', '{"source":"camera","dhash":"d3d3d3d3d3d3d3d3"}', 80) as g8 \gset
select test.ok((select needs_master_review and model = 'rules' and checks -> 4 ->> 'status' = 'skipped'
                  from public.ai_submit(:g8, null, '{"error":"превышен бюджет"}')), 'G8 rules only');
select test.ok((select report_master ->> 'summary' like '%Нужна проверка мастером.' from public.ai_reviews where order_id = :g8), 'G8 summary');

\echo 'G9 rules check started by the assignee; strangers are refused'
select test.make_done('2003', 21, 'Э-03', 'unplanned', 'Заменил пускатель и автомат, проверил пуск',
  '[{"material_id":29,"qty":1},{"material_id":28,"qty":1}]', '{"source":"gallery","dhash":"e4e4e4e4e4e4e4e4"}', 50) as g9 \gset
select set_config('request.jwt.claims', test.claims('2002'), false) \g /dev/null
set role authenticated;
select test.expect(format('select public.ai_check_rules(%s)', :g9), 'FORBIDDEN');
select test.expect(format('select public.ai_submit(%s, null)', :g9), '42501');
select set_config('request.jwt.claims', test.claims('2003'), false) \g /dev/null
select test.ok((select model = 'rules' and checks -> 1 ->> 'message_ru' = 'фото после загружено из галереи' from public.ai_check_rules(:g9)), 'G9 gallery warning');
reset role;
select set_config('request.jwt.claims', '', false) \g /dev/null
select test.ok((select (ai_context(:g9) ->> 'already_reviewed')::boolean), 'context says reviewed');
select test.ok((select ai_context(:g9) -> 'worker' ->> 'pseudonym' = 'E03'), 'context carries the pseudonym only');

\echo 'G10 overdue but good → accepted, minus 5 for the deadline'
select test.make_done('2001', 20, 'Г-01', 'unplanned', 'Заменил уплотнительное кольцо крышки, подтянул болты',
  '[{"material_id":21,"qty":2}]', '{"source":"camera","dhash":"f5f5f5f5f5f5f5f5"}', 80,
  jsonb_build_object('due_at', now() - interval '10 minutes')) as g10 \gset
select test.ok((select verdict = 'accepted' and score = 95 and checks -> 3 ->> 'message_ru' like '%срок нарушен на%'
                  from public.ai_submit(:g10, :'good_llm'::jsonb)), 'G10 accepted 95');

\echo 'G11 planned order without a photo → accepted with remarks'
select test.make_done('2005', 11, 'С-01', 'planned', 'Смазал узлы конвейера по карте смазки',
  '[{"material_id":18,"qty":0.8}]', null, 30) as g11 \gset
select test.ok((select verdict = 'accepted_with_remarks' and checks -> 0 ->> 'status' = 'warn' from public.ai_submit(:g11,
  '{"work_match":{"verdict":"full","explanation":"смазка выполнена"},"code_consistent":true,"materials_logic":{"verdict":"ok","explanation":""},"photo":{"after_present":false,"same_equipment":"unsure","problem_resolved":"not_applicable","quality_issues":[],"score_1_5":0,"explanation":"фото нет"},"confidence":0.8,"feedback_worker":{"good":["Смазка по карте"],"improve":["Прикладывайте фото после"]},"summary_master":"Плановая смазка без фото"}'::jsonb)), 'G11 remarks');

\echo 'G12 suspiciously fast → accepted with remarks'
select test.make_done('2001', 20, 'Г-01', 'unplanned', 'Заменил уплотнительное кольцо крышки, подтянул болты',
  '[{"material_id":21,"qty":2}]', '{"source":"camera","dhash":"a6a6a6a6a6a6a6a6"}', 5) as g12 \gset
select test.ok((select verdict = 'accepted_with_remarks' and checks -> 3 ->> 'message_ru' like 'подозрительно быстро%' from public.ai_submit(:g12,
  '{"work_match":{"verdict":"partial","explanation":"мало деталей"},"code_consistent":true,"materials_logic":{"verdict":"ok","explanation":""},"photo":{"after_present":true,"same_equipment":"yes","problem_resolved":"yes","quality_issues":[],"score_1_5":4,"explanation":"течи не видно"},"confidence":0.8,"feedback_worker":{"good":[],"improve":["Опишите ремонт подробнее"]},"summary_master":"Подозрительно быстро"}'::jsonb)), 'G12 remarks');

\echo 'G13 a stale LLM answer for an old attempt is refused'
select test.expect(format('select public.ai_submit(%s, null, ''{"attempt": 5}'')', :g8), 'BAD_TRANSITION');

\echo 'ALL AI REVIEW TESTS PASSED'
