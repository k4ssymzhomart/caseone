-- Rota · AI completion check, the deterministic half (CLAUDE.md §11).
-- The Edge Function ai-verify is a thin LLM caller:
--   public.ai_context(order_id) → redact → LLM (vision + JSON schema) → public.ai_submit(order_id, llm_json, meta)
-- Rules R1 to R4, the L1/L2 scoring of the LLM answer, the verdict, needs_master_review, idempotency (one review per
-- attempt) and the status change all live here, so every caller gets the same result and SQL tests cover it.
-- With no LLM answer (error, timeout, budget) ai_submit writes a rules-only review.

create or replace function internal.hamming(a text, b text)
returns int language sql immutable set search_path = ''
as $$
  select case when a ~ '^[0-9a-fA-F]{16}$' and b ~ '^[0-9a-fA-F]{16}$'
              then bit_count(('x' || a)::bit(64) # ('x' || b)::bit(64))::int end
$$;

create or replace function internal.ru_duration(p_min numeric)
returns text language sql immutable set search_path = ''
as $$
  select case when p_min is null then '?'
              when round(p_min) >= 60 then floor(round(p_min) / 60) || ' ч'
                                           || case when round(p_min)::int % 60 > 0 then ' ' || (round(p_min)::int % 60) || ' мин' else '' end
              else greatest(round(p_min), 1) || ' мин' end
$$;

-- p90 of the quantity of a material on closed orders with this fault code (needs 5 samples)
create or replace function internal.material_p90(p_code text, p_material int)
returns numeric language sql stable set search_path = ''
as $$
  select case when count(*) >= 5 then (percentile_cont(0.9) within group (order by m.qty))::numeric end
    from public.order_materials m join public.orders o on o.id = m.order_id
   where o.fault_code = p_code and m.material_id = p_material and o.status = 'closed'
$$;

create or replace function internal.rules_checks(p_order_id bigint)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  o        public.orders;
  v_ev     jsonb;
  v_no_mat boolean;
  v_n_after int;
  p        public.order_photos;
  d        record;
  m        record;
  v_typ    jsonb;
  v_max    numeric;
  v_p90    numeric;
  v_work   numeric;
  v_norm   numeric;
  v_ratio  numeric;
  v_dupmax numeric := internal.setting_num('duplicate_hamming_max', 6);
  r1 int := 20; r1s text := 'pass'; r1m text[] := '{}';
  r2 int := 10; r2s text := 'pass'; r2m text[] := '{}';
  r3 int := 15; r3s text := 'pass'; r3m text[] := '{}';
  r4 int := 20; r4s text := 'pass'; r4m text[] := '{}';
begin
  select * into o from public.orders where id = p_order_id;
  select payload into v_ev from public.order_events where order_id = o.id and action = 'complete' order by id desc limit 1;
  v_no_mat := coalesce((v_ev ->> 'no_materials')::boolean, false);
  select count(*) into v_n_after from public.order_photos
   where (order_id = o.id or client_ref = o.client_ref) and kind = 'after';

  -- R1 completeness (20)
  if v_n_after = 0 and o.type = 'unplanned' then
    r1 := 0; r1s := 'fail'; r1m := r1m || 'нет фото после: обязательно для внеплановых работ'::text;
  elsif v_n_after = 0 then
    r1 := r1 - 5; r1m := r1m || 'нет фото после'::text;
  end if;
  if length(coalesce(o.works_done, '')) < 15 then r1 := greatest(r1 - 5, 0); r1m := r1m || 'описание работ короткое'::text; end if;
  if o.fault_code is null then r1 := greatest(r1 - 5, 0); r1m := r1m || 'не указан шифр неисправности'::text; end if;
  if not v_no_mat and not exists (select 1 from public.order_materials where order_id = o.id) then
    r1 := greatest(r1 - 5, 0); r1m := r1m || 'не указаны материалы'::text;
  end if;
  if r1s <> 'fail' and r1 < 20 then r1s := 'warn'; end if;
  if r1s = 'pass' then r1m := array['отчёт заполнен, шифр и материалы указаны']; end if;

  -- R2 photo integrity (10)
  if v_n_after = 0 then
    r2 := 5; r2s := 'warn'; r2m := array['фото после нет, подлинность не проверялась'];
  else
    for p in select * from public.order_photos
              where (order_id = o.id or client_ref = o.client_ref) and kind = 'after' order by id loop
      if p.source = 'gallery' then
        r2 := least(r2, 7); r2m := r2m || 'фото после загружено из галереи'::text;
      end if;
      if p.captured_at is not null and o.started_at is not null
         and (p.captured_at < o.started_at - interval '5 minutes'
              or p.captured_at > coalesce(o.done_at, now()) + interval '2 minutes') then
        r2 := 0; r2s := 'fail'; r2m := r2m || 'фото сделано не во время работ'::text;
      end if;
      select ox.number, coalesce(q.captured_at, q.uploaded_at) as at into d
        from public.order_photos q join public.orders ox on ox.id = q.order_id
       where q.order_id <> o.id and p.dhash is not null and q.dhash is not null
         and internal.hamming(q.dhash, p.dhash) <= v_dupmax
       order by q.uploaded_at desc limit 1;
      if found then
        r2 := 0; r2s := 'fail';
        r2m := r2m || format('фото совпадает с фото наряда №%s от %s', d.number, to_char(internal.local_ts(d.at), 'DD.MM'));
      end if;
      if exists (select 1 from public.order_photos b
                  where (b.order_id = o.id or b.client_ref = o.client_ref) and b.kind = 'before'
                    and ((b.sha256 is not null and b.sha256 = p.sha256)
                         or (internal.hamming(b.dhash, p.dhash) <= 3
                             and abs(extract(epoch from (b.captured_at - p.captured_at))) <= 120))) then
        r2 := 0; r2s := 'fail'; r2m := r2m || 'фото после совпадает с фото до'::text;
      end if;
    end loop;
    if r2s <> 'fail' and r2 < 10 then r2s := 'warn'; end if;
    if r2s = 'pass' then r2m := array['фото сделано камерой во время работ']; end if;
  end if;

  -- R3 materials (15): typical list for the code, qty_max, history p90
  select typical into v_typ from public.work_norms where fault_code = o.fault_code;
  for m in select om.material_id, sum(om.qty) as qty, mt.name, mt.unit
             from public.order_materials om join public.materials mt on mt.id = om.material_id
            where om.order_id = o.id group by om.material_id, mt.name, mt.unit loop
    v_max := null;
    select (t ->> 'qty_max')::numeric into v_max
      from jsonb_array_elements(coalesce(v_typ, '[]'::jsonb)) t where (t ->> 'material_id')::int = m.material_id;
    v_p90 := internal.material_p90(o.fault_code, m.material_id);
    if v_typ is not null and v_max is null then
      r3 := r3 - 3; r3m := r3m || format('материал не типовой для шифра %s: %s', o.fault_code, lower(m.name));
    end if;
    if (v_max is not null and m.qty > v_max) or (v_p90 is not null and m.qty > 2 * v_p90) then
      r3s := 'fail';
      r3m := r3m || format('перерасход: %s %s %s при норме до %s', lower(m.name), internal.ru_num(m.qty), m.unit,
                           internal.ru_num(coalesce(v_max, round(v_p90, 1))));
    elsif v_p90 is not null and m.qty > v_p90 then
      r3 := r3 - 3; r3m := r3m || format('расход выше обычного: %s %s %s', lower(m.name), internal.ru_num(m.qty), m.unit);
    end if;
  end loop;
  if r3s = 'fail' then r3 := 0; elsif r3 < 15 then r3s := 'warn'; end if;
  r3 := greatest(r3, 0);
  if r3s = 'pass' then r3m := array['материалы в пределах нормы']; end if;

  -- R4 time (20): work minus pauses against the norm; in demo mode a job of a few minutes is compared
  -- with the accelerated norm (1 norm hour = 2 minutes)
  if o.started_at is not null and o.done_at is not null then
    v_work := extract(epoch from (o.done_at - o.started_at)) / 60 - o.paused_total_sec / 60.0;
    v_norm := coalesce(o.norm_hours, (select norm_hours from public.work_norms where fault_code = o.fault_code), 1) * 60;
    if o.is_demo and v_work < 15 then v_norm := v_norm / 30; end if;
    v_ratio := v_work / nullif(v_norm, 0);
    if v_ratio < 0.25 then
      r4 := 10; r4m := r4m || format('подозрительно быстро: %s при нормативе %s', internal.ru_duration(v_work), internal.ru_duration(v_norm));
    elsif v_ratio > 1.5 then
      r4 := 10; r4m := r4m || format('время %s при нормативе %s', internal.ru_duration(v_work), internal.ru_duration(v_norm));
    elsif v_ratio > 1.2 then
      r4 := 15; r4m := r4m || format('время %s при нормативе %s', internal.ru_duration(v_work), internal.ru_duration(v_norm));
    end if;
    if o.done_at > o.due_at then
      r4 := r4 - 5;
      r4m := r4m || format('срок нарушен на %s мин', ceil(extract(epoch from (o.done_at - o.due_at)) / 60)::int);
    end if;
    if r4 < 20 then r4s := 'warn'; end if;
    if r4s = 'pass' then
      r4m := array[format('время %s при нормативе %s', internal.ru_duration(v_work), internal.ru_duration(v_norm))];
    end if;
  else
    r4 := 10; r4s := 'warn'; r4m := array['нет отметок начала или окончания работ'];
  end if;

  return jsonb_build_array(
    jsonb_build_object('id', 'R1', 'title', 'Полнота отчёта', 'status', r1s, 'points', r1, 'max', 20, 'message_ru', array_to_string(r1m, '; ')),
    jsonb_build_object('id', 'R2', 'title', 'Подлинность фото', 'status', r2s, 'points', r2, 'max', 10, 'message_ru', array_to_string(r2m, '; ')),
    jsonb_build_object('id', 'R3', 'title', 'Материалы', 'status', r3s, 'points', r3, 'max', 15, 'message_ru', array_to_string(r3m, '; ')),
    jsonb_build_object('id', 'R4', 'title', 'Время и срок', 'status', r4s, 'points', r4, 'max', 20, 'message_ru', array_to_string(r4m, '; ')));
end $$;

-- everything the LLM needs, people as pseudonyms (free text still goes through the privacy gateway)
create or replace function public.ai_context(p_order_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'attempt', o.rework_count + 1,
    'already_reviewed', exists (select 1 from public.ai_reviews r where r.order_id = o.id and r.attempt = o.rework_count + 1),
    'status', o.status,
    'order', jsonb_build_object(
      'id', o.id, 'number', o.number, 'type', o.type, 'priority', o.priority, 'description', o.description,
      'comment', o.comment, 'works_done', o.works_done, 'fault_code', o.fault_code, 'fault_name', fc.name,
      'suggested_fault_code', o.suggested_fault_code, 'closing_comment', o.closing_comment,
      'created_at', o.created_at, 'started_at', o.started_at, 'done_at', o.done_at, 'due_at', o.due_at,
      'paused_total_sec', o.paused_total_sec, 'norm_hours', o.norm_hours, 'is_demo', o.is_demo,
      'equipment_stopped', o.equipment_stopped),
    'equipment', jsonb_build_object('name', eq.name, 'type', eq.type, 'criticality', eq.criticality, 'area', ar.name),
    'worker', jsonb_build_object('pseudonym', w.pseudonym, 'specialty', w.specialty, 'grade', w.grade),
    'norm', jsonb_build_object('hours', n.norm_hours, 'typical',
              (select coalesce(jsonb_agg(jsonb_build_object('material_id', (t ->> 'material_id')::int, 'material', mt.name,
                                                            'unit', mt.unit, 'qty', (t ->> 'qty')::numeric,
                                                            'qty_max', (t ->> 'qty_max')::numeric)), '[]'::jsonb)
                 from jsonb_array_elements(coalesce(n.typical, '[]'::jsonb)) t
                 join public.materials mt on mt.id = (t ->> 'material_id')::int)),
    'materials', (select coalesce(jsonb_agg(jsonb_build_object('material_id', om.material_id, 'material', mt.name, 'unit', mt.unit,
                                                               'qty', om.qty, 'p90', internal.material_p90(o.fault_code, om.material_id))), '[]'::jsonb)
                    from public.order_materials om join public.materials mt on mt.id = om.material_id where om.order_id = o.id),
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('kind', ph.kind, 'storage_path', ph.storage_path, 'source', ph.source,
                                                            'captured_at', ph.captured_at, 'dhash', ph.dhash, 'sha256', ph.sha256,
                                                            'width', ph.width, 'height', ph.height) order by ph.kind, ph.id), '[]'::jsonb)
                 from public.order_photos ph where ph.order_id = o.id or ph.client_ref = o.client_ref),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('at', ev.created_at, 'action', ev.action, 'from', ev.from_status,
                                                              'to', ev.to_status, 'reason', ev.reason, 'comment', ev.comment,
                                                              'actor', coalesce(a.pseudonym, 'SYSTEM')) order by ev.id), '[]'::jsonb)
                   from public.order_events ev left join public.employees a on a.id = ev.actor_id where ev.order_id = o.id),
    'rules', internal.rules_checks(o.id))
  from public.orders o
  join public.equipment eq on eq.id = o.equipment_id
  join public.areas ar on ar.id = o.area_id
  join public.employees w on w.id = o.assignee_id
  left join public.fault_codes fc on fc.code = o.fault_code
  left join public.work_norms n on n.fault_code = o.fault_code
  where o.id = p_order_id
$$;

-- score the LLM answer (or none), write the review once per attempt, move the order
create or replace function public.ai_submit(p_order_id bigint, p_llm jsonb default null, p_meta jsonb default '{}')
returns public.ai_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  o          public.orders;
  r          public.ai_reviews;
  v_attempt  int;
  v_rules    jsonb;
  v_checks   jsonb;
  v_rule_fail boolean;
  v_llm_fail boolean := false;
  v_l1 int; v_l1s text; v_l1m text;
  v_l2 int; v_l2s text; v_l2m text;
  v_score    int;
  v_conf     numeric;
  v_verdict  public.verdict_t;
  v_nmr      boolean;
  v_thr      numeric := internal.setting_num('ai_confidence_threshold', 0.6);
  v_feedback jsonb;
  v_summary  text;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then perform internal.fail('BAD_INPUT', 'order not found'); end if;
  v_attempt := o.rework_count + 1;
  if (p_meta ->> 'attempt') is not null and (p_meta ->> 'attempt')::int <> v_attempt then
    perform internal.fail('BAD_TRANSITION', 'stale attempt ' || (p_meta ->> 'attempt'));
  end if;
  select * into r from public.ai_reviews where order_id = o.id and attempt = v_attempt;
  if found then return r; end if;
  if o.status <> 'ai_review' then perform internal.fail('BAD_TRANSITION', 'the order is not waiting for a check'); end if;

  v_rules := internal.rules_checks(o.id);
  v_rule_fail := exists (select 1 from jsonb_array_elements(v_rules) c where c ->> 'status' = 'fail');

  if p_llm is not null then
    -- L1 work match (20)
    v_l1 := case p_llm -> 'work_match' ->> 'verdict' when 'full' then 20 when 'partial' then 10 else 0 end;
    v_l1s := case when v_l1 = 0 then 'fail' when v_l1 < 20 then 'warn' else 'pass' end;
    v_l1m := coalesce(p_llm -> 'work_match' ->> 'explanation', '');
    if v_l1 = 0 then v_llm_fail := true; end if;
    if (p_llm ->> 'code_consistent')::boolean is false then
      v_l1 := greatest(v_l1 - 8, 0);
      if v_l1s = 'pass' then v_l1s := 'warn'; end if;
      v_l1m := concat_ws('; ', nullif(v_l1m, ''),
                         'шифр не соответствует работам, предложен ' || coalesce(p_llm ->> 'suggested_code', 'другой'));
    end if;
    -- materials logic: −5 inside R3
    if p_llm -> 'materials_logic' ->> 'verdict' = 'suspicious' then
      select jsonb_agg(case when c ->> 'id' = 'R3'
                            then c || jsonb_build_object(
                                   'points', greatest((c ->> 'points')::int - 5, 0),
                                   'status', case when c ->> 'status' = 'fail' then 'fail' else 'warn' end,
                                   'message_ru', concat_ws('; ', nullif(c ->> 'message_ru', 'материалы в пределах нормы'),
                                                           'ИИ: ' || coalesce(p_llm -> 'materials_logic' ->> 'explanation',
                                                                              'набор материалов вызывает вопросы')))
                            else c end order by i)
        into v_rules
        from jsonb_array_elements(v_rules) with ordinality as t(c, i);
    end if;
    -- L2 photo (15)
    v_l2 := least(greatest(coalesce((p_llm -> 'photo' ->> 'score_1_5')::int, 0), 0), 5) * 3;
    v_l2s := case when v_l2 >= 12 then 'pass' else 'warn' end;
    v_l2m := coalesce(p_llm -> 'photo' ->> 'explanation', '');
    if (p_llm -> 'photo' ->> 'after_present')::boolean is false then
      v_l2 := 0; v_l2s := 'warn'; v_l2m := concat_ws('; ', 'фото после нет', nullif(v_l2m, ''));
    end if;
    if p_llm -> 'photo' ->> 'problem_resolved' = 'no' then
      v_l2s := 'fail'; v_llm_fail := true; v_l2m := concat_ws('; ', 'неисправность на фото после не устранена', nullif(v_l2m, ''));
    end if;
    if p_llm -> 'photo' ->> 'same_equipment' = 'no' then
      v_l2s := 'fail'; v_llm_fail := true; v_l2m := concat_ws('; ', 'на фото после другое оборудование', nullif(v_l2m, ''));
    end if;
    v_conf := nullif(p_llm ->> 'confidence', '')::numeric;
    v_checks := v_rules || jsonb_build_array(
      jsonb_build_object('id', 'L1', 'title', 'Работы и шифр', 'status', v_l1s, 'points', v_l1, 'max', 20, 'message_ru', v_l1m),
      jsonb_build_object('id', 'L2', 'title', 'Фото после', 'status', v_l2s, 'points', v_l2, 'max', 15, 'message_ru', v_l2m));
    v_score := (select sum((c ->> 'points')::int) from jsonb_array_elements(v_checks) c);
  else
    v_checks := v_rules || jsonb_build_array(
      jsonb_build_object('id', 'L1', 'title', 'Работы и шифр', 'status', 'skipped', 'points', 0, 'max', 20,
                         'message_ru', 'не выполнено: ' || coalesce(p_meta ->> 'error', 'ИИ недоступен')),
      jsonb_build_object('id', 'L2', 'title', 'Фото после', 'status', 'skipped', 'points', 0, 'max', 15,
                         'message_ru', 'не выполнено'));
    v_score := round((select sum((c ->> 'points')::int) from jsonb_array_elements(v_rules) c) * 100.0 / 65);
  end if;
  v_score := least(greatest(v_score, 0), 100);

  -- any rule fail → rework, whatever the LLM says; then an LLM fail; then the score
  v_verdict := case when v_rule_fail or v_llm_fail then 'rework'
                    when v_score >= 80 then 'accepted'
                    when v_score >= 60 then 'accepted_with_remarks'
                    else 'rework' end;
  v_nmr := not v_rule_fail and (p_llm is null or coalesce(v_conf, 0) < v_thr);

  v_feedback := coalesce(p_llm -> 'feedback_worker', jsonb_build_object(
    'good', (select coalesce(jsonb_agg(c ->> 'message_ru'), '[]'::jsonb) from jsonb_array_elements(v_checks) c
              where c ->> 'status' = 'pass'),
    'improve', (select coalesce(jsonb_agg(c ->> 'message_ru'), '[]'::jsonb) from jsonb_array_elements(v_checks) c
                 where c ->> 'status' in ('warn','fail'))));
  v_summary := coalesce(nullif(p_llm ->> 'summary_master', ''),
    internal.verdict_label(v_verdict) || ', ' || v_score || ' ' || internal.plural(v_score, 'балл', 'балла', 'баллов') || '. '
    || coalesce((select string_agg(c ->> 'message_ru', '; ') from jsonb_array_elements(v_checks) c
                  where c ->> 'status' = 'fail'), 'Нарушений правил нет')
    || case when v_nmr then '. Нужна проверка мастером.' else '.' end);

  insert into public.ai_reviews
    (order_id, attempt, verdict, score, score5, confidence, needs_master_review, checks, photo,
     feedback_worker, report_master, model, latency_ms)
  values
    (o.id, v_attempt, v_verdict, v_score, greatest(1, least(5, round(v_score / 20.0)))::smallint, v_conf, v_nmr, v_checks,
     p_llm -> 'photo', v_feedback,
     jsonb_build_object('summary', v_summary, 'suggested_code', p_llm ->> 'suggested_code',
                        'materials_logic', p_llm -> 'materials_logic', 'work_match', p_llm -> 'work_match'),
     coalesce(p_meta ->> 'model', case when p_llm is null then 'rules' end), nullif(p_meta ->> 'latency_ms', '')::int)
  on conflict (order_id, attempt) do nothing
  returning * into r;
  if r.id is null then
    select * into r from public.ai_reviews where order_id = o.id and attempt = v_attempt;
    return r;
  end if;

  perform internal.apply_action(o.id, 'ai_result', jsonb_build_object('review_id', r.id), null, true);
  return r;
end $$;

-- rules-only check that a signed-in assignee or master may start (Phase 2 before ai-verify exists; offline fallback)
create or replace function public.ai_check_rules(p_order_id bigint)
returns public.ai_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id;
  if (select auth.uid()) is null or o.id is null
     or not (o.assignee_id = (select auth.uid()) or public.is_staff()) then
    perform internal.fail('FORBIDDEN', 'assignee or staff only');
  end if;
  return public.ai_submit(p_order_id, null, jsonb_build_object('model', 'rules', 'error', 'проверка только по правилам'));
end $$;

revoke execute on all functions in schema internal from public;
revoke execute on function public.ai_context(bigint), public.ai_submit(bigint, jsonb, jsonb),
                           public.ai_check_rules(bigint) from public, anon, authenticated;
grant execute on function public.ai_context(bigint), public.ai_submit(bigint, jsonb, jsonb) to service_role;
grant execute on function public.ai_check_rules(bigint) to authenticated, service_role;
