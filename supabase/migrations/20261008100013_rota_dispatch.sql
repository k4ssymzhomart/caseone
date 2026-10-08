-- Rota · notification dispatch (CLAUDE.md §8): every new notification row is sent to the Edge Function
-- notify-dispatch (Expo push, then Telegram without names). pg_net is asynchronous, so the insert is not slowed down.
-- The project URL and the secret key are read from Vault at call time (names 'project_url' and 'secret_key');
-- until they exist nothing is sent and the rows simply wait in the table.

create or replace function internal.notify_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('rota.seeding', true), '') = 'on'
     or to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return null;
  end if;
  execute $q$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notify-dispatch',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key')),
      body    := jsonb_build_object('type', 'INSERT', 'table', 'notifications', 'record', $1),
      timeout_milliseconds := 5000)
    where exists (select 1 from vault.decrypted_secrets where name = 'project_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'secret_key')
  $q$ using to_jsonb(new);
  return null;
end $$;

create or replace trigger notifications_dispatch
  after insert on public.notifications
  for each row execute function internal.notify_dispatch();

-- Telegram linking: the profile asks for a one time token and opens t.me/<bot>?start=<token>
create or replace function public.telegram_link_token()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(12), 'hex');
begin
  if (select auth.uid()) is null then perform internal.fail('FORBIDDEN', 'sign in required'); end if;
  delete from public.tg_link_tokens where employee_id = (select auth.uid()) or expires_at < now();
  insert into public.tg_link_tokens (token, employee_id, expires_at)
  values (v_token, (select auth.uid()), now() + interval '15 minutes');
  return v_token;
end $$;

revoke execute on function internal.notify_dispatch() from public;
revoke execute on function public.telegram_link_token() from public, anon;
grant execute on function public.telegram_link_token() to authenticated;
