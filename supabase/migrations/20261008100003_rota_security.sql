-- Rota · security: role helpers, RLS, table grants, storage, realtime (CLAUDE.md §5, §18)
-- The role comes from the JWT (app_metadata.app_role), never from a query on employees:
-- a policy on employees that reads employees recurses and silently breaks Realtime.

create or replace function public.my_role()
returns public.role_t
language sql stable
set search_path = ''
as $$
  select nullif((select auth.jwt()) -> 'app_metadata' ->> 'app_role', '')::public.role_t
$$;

create or replace function public.is_staff()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((select public.my_role()) in ('master','manager','admin'), false)
$$;

-- staff, or an internal caller with no user JWT (cron, the SQL editor) or the secret key
create or replace function internal.staff_or_system()
returns boolean
language sql stable
set search_path = ''
as $$
  select public.is_staff() or coalesce((select auth.role()), 'service_role') = 'service_role'
$$;

create or replace function internal.require_staff()
returns boolean
language plpgsql stable
set search_path = ''
as $$
begin
  if not internal.staff_or_system() then
    raise exception using message = 'FORBIDDEN', detail = 'master, manager or admin only', errcode = 'P0001';
  end if;
  return true;
end $$;

-- RLS on every table
alter table public.areas                    enable row level security;
alter table public.equipment                enable row level security;
alter table public.brigades                 enable row level security;
alter table public.employees                enable row level security;
alter table public.fault_codes              enable row level security;
alter table public.materials                enable row level security;
alter table public.work_norms               enable row level security;
alter table public.equipment_type_specialty enable row level security;
alter table public.problem_templates        enable row level security;
alter table public.settings                 enable row level security;
alter table public.orders                   enable row level security;
alter table public.order_events             enable row level security;
alter table public.order_photos             enable row level security;
alter table public.order_materials          enable row level security;
alter table public.ai_reviews               enable row level security;
alter table public.notifications            enable row level security;
alter table public.push_tokens              enable row level security;
alter table public.ai_insights              enable row level security;
alter table public.llm_audit                enable row level security;
alter table public.integration_outbox       enable row level security;
alter table public.tg_link_tokens           enable row level security;

-- directories and settings: everyone signed in reads, admins write
do $$
declare t text;
begin
  foreach t in array array['areas','equipment','brigades','fault_codes','materials','work_norms',
                           'equipment_type_specialty','problem_templates','settings'] loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.my_role()) = ''admin'')', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.my_role()) = ''admin'') with check ((select public.my_role()) = ''admin'')', t || '_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.my_role()) = ''admin'')', t || '_admin_delete', t);
  end loop;
end $$;

-- employees: the directory of people is visible to every signed-in user; admins edit it.
-- Shift switches go through public.set_on_shift().
create policy employees_read on public.employees
  for select to authenticated using (true);
create policy employees_admin_update on public.employees
  for update to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');

-- orders and their children: workers see their own orders, staff see all.
-- Writes go through security definer RPCs only, so there are no write policies.
create policy orders_read on public.orders
  for select to authenticated
  using ((select public.is_staff()) or assignee_id = (select auth.uid()));

create policy order_events_read on public.order_events
  for select to authenticated
  using ((select public.is_staff())
         or exists (select 1 from public.orders o
                    where o.id = order_events.order_id and o.assignee_id = (select auth.uid())));

create policy order_materials_read on public.order_materials
  for select to authenticated
  using ((select public.is_staff())
         or exists (select 1 from public.orders o
                    where o.id = order_materials.order_id and o.assignee_id = (select auth.uid())));

create policy ai_reviews_read on public.ai_reviews
  for select to authenticated
  using ((select public.is_staff())
         or exists (select 1 from public.orders o
                    where o.id = ai_reviews.order_id and o.assignee_id = (select auth.uid())));

create policy order_photos_read on public.order_photos
  for select to authenticated
  using ((select public.is_staff())
         or author_id = (select auth.uid())
         or exists (select 1 from public.orders o
                    where o.id = order_photos.order_id and o.assignee_id = (select auth.uid())));

-- notifications: own only; the client may only mark them read
create policy notifications_read on public.notifications
  for select to authenticated using (recipient_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

-- push tokens: own only; registration goes through public.register_push_token()
create policy push_tokens_read on public.push_tokens
  for select to authenticated using (employee_id = (select auth.uid()));
create policy push_tokens_delete on public.push_tokens
  for delete to authenticated using (employee_id = (select auth.uid()));

-- AI output and audit
create policy ai_insights_read on public.ai_insights
  for select to authenticated using ((select public.is_staff()));
create policy llm_audit_read on public.llm_audit
  for select to authenticated using ((select public.my_role()) in ('manager','admin'));
create policy integration_outbox_read on public.integration_outbox
  for select to authenticated using ((select public.my_role()) = 'admin');
-- tg_link_tokens: no policies, service role only

-- table grants: anon gets nothing; authenticated reads, writes only where a policy allows it
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.areas, public.equipment, public.brigades, public.fault_codes,
  public.materials, public.work_norms, public.equipment_type_specialty, public.problem_templates,
  public.settings to authenticated;
grant update on public.employees to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.push_tokens to authenticated;

-- future tables and sequences: nothing for anon.
-- Functions keep Postgres' default EXECUTE for PUBLIC, so every migration that adds a function
-- revokes it explicitly and grants only the roles that need it (see the end of each migration).
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from authenticated;

revoke execute on function internal.staff_or_system(), internal.require_staff() from public;

-- storage: private bucket for work photos, path orders/{client_ref}/{kind}/{uuid}.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg','image/png'])
on conflict (id) do nothing;

create policy rota_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = 'orders');
create policy rota_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'photos');

-- realtime
do $$
declare t text;
begin
  foreach t in array array['orders','notifications','ai_reviews','employees'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
