-- Test helpers (sandbox and verification only; not a migration)
create schema if not exists test;
grant usage on schema test to anon, authenticated, service_role;

create or replace function test.expect(p_sql text, p_code text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'TEST FAILED: expected % from %', p_code, p_sql;
exception when others then
  if sqlerrm like 'TEST FAILED%' then raise; end if;
  if sqlerrm <> p_code and sqlstate <> p_code then
    raise exception 'TEST FAILED: expected %, got % (%) from %', p_code, sqlerrm, sqlstate, p_sql;
  end if;
end $$;

create or replace function test.ok(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'TEST FAILED: %', p_msg; end if;
end $$;

create or replace function test.claims(p_tab text)
returns text language sql security definer set search_path = '' as $$
  select json_build_object('sub', id, 'role', 'authenticated',
                           'app_metadata', json_build_object('app_role', role))::text
    from public.employees where tab_no = p_tab
$$;

create or replace function test.uid(p_tab text)
returns uuid language sql security definer set search_path = '' as $$
  select id from public.employees where tab_no = p_tab
$$;

grant execute on all functions in schema test to anon, authenticated, service_role;

-- create an order as master 1001 and drive it to ai_review as the worker; returns the order id
create or replace function test.make_done(
  p_worker text, p_eq int, p_code text, p_type text, p_works text, p_materials jsonb,
  p_after jsonb default null, p_work_min int default 60, p_extra jsonb default '{}')
returns bigint language plpgsql as $$
declare
  o public.orders;
  v_ref uuid := gen_random_uuid();
begin
  update public.employees set on_shift = true where tab_no = p_worker;
  perform set_config('request.jwt.claims', test.claims('1001'), true);
  o := public.create_order(jsonb_build_object('type', p_type, 'priority', case when p_type = 'planned' then 'planned' else 'high' end,
         'description', 'Тест ' || p_code, 'equipment_id', p_eq, 'assignee_id', test.uid(p_worker),
         'suggested_fault_code', p_code, 'client_ref', v_ref) || p_extra);
  perform set_config('request.jwt.claims', test.claims(p_worker), true);
  perform public.order_action(o.id, 'accept');
  perform public.order_action(o.id, 'start', '{"pause_current": true}');
  update public.orders set started_at = now() - make_interval(mins => p_work_min),
                           issued_at = now() - make_interval(mins => p_work_min + 10),
                           created_at = now() - make_interval(mins => p_work_min + 10)
   where id = o.id;
  if p_after is not null then
    perform public.attach_photo(jsonb_build_object('client_ref', v_ref, 'kind', 'after',
              'storage_path', 'orders/' || v_ref || '/after/' || gen_random_uuid() || '.jpg',
              'captured_at', now() - interval '1 minute') || p_after);
  end if;
  perform public.order_action(o.id, 'complete', jsonb_build_object('works_done', p_works, 'fault_code', p_code,
            'materials', p_materials, 'comment', 'тест'));
  perform set_config('request.jwt.claims', '', true);
  return o.id;
end $$;
grant execute on all functions in schema test to anon, authenticated, service_role;
