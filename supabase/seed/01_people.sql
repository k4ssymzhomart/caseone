-- Rota · test accounts and the employee directory (CLAUDE.md §18, §19). Idempotent by tab_no.
-- Sign in: email {tab_no}@naryad.local, password nr_{pin}_kz. Synthetic people only.
-- Auth rows are written directly (bcrypt, confirmed email, app_metadata.app_role).

do $$
declare
  r    record;
  v_id uuid;
  v_meta jsonb;
begin
  for r in
    select * from (values
      ('1001', 'Жумабаев Нурлан',     'Жумабаев Н.',     'M01', 'master',  null,              null, null, 'day',   '1111'),
      ('1002', 'Ковалёв Андрей',      'Ковалёв А.',      'M02', 'master',  null,              null, null, 'night', '2222'),
      ('3001', 'Тлеубаев Марат',      'Тлеубаев М.',     'R01', 'manager', 'главный механик', null, null, null,    '3333'),
      ('9001', 'Садыкова Айгерим',    'Садыкова А.',     'A01', 'admin',   null,              null, null, null,    '9999'),
      ('2001', 'Ахметов Ерлан',       'Ахметов Е.',      'E01', 'worker',  'слесарь',          5,    1,    'day',   '1234'),
      ('2002', 'Иванов Сергей',       'Иванов С.',       'E02', 'worker',  'слесарь',          4,    1,    'day',   '1234'),
      ('2003', 'Нурпеисов Асхат',     'Нурпеисов А.',    'E03', 'worker',  'электромонтёр',    5,    1,    'day',   '1234'),
      ('2004', 'Литвиненко Олег',     'Литвиненко О.',   'E04', 'worker',  'сварщик',          5,    1,    'day',   '1234'),
      ('2005', 'Касымов Бауыржан',    'Касымов Б.',      'E05', 'worker',  'смазчик',          3,    1,    'day',   '1234'),
      ('2006', 'Сериков Данияр',      'Сериков Д.',      'E06', 'worker',  'слесарь',          4,    2,    'day',   '1234'),
      ('2007', 'Петренко Виктор',     'Петренко В.',     'E07', 'worker',  'слесарь',          6,    2,    'day',   '1234'),
      ('2008', 'Оспанов Ерик',        'Оспанов Е.',      'E08', 'worker',  'электромонтёр',    4,    2,    'day',   '1234'),
      ('2009', 'Ким Денис',           'Ким Д.',          'E09', 'worker',  'электромонтёр',    5,    2,    'day',   '1234'),
      ('2010', 'Абенов Талгат',       'Абенов Т.',       'E10', 'worker',  'слесарь',          3,    2,    'day',   '1234'),
      ('2011', 'Мухамеджанов Руслан', 'Мухамеджанов Р.', 'E11', 'worker',  'слесарь',          5,    3,    'night', '1234'),
      ('2012', 'Беляев Николай',      'Беляев Н.',       'E12', 'worker',  'слесарь',          4,    3,    'night', '1234'),
      ('2013', 'Жаксылыков Нурбол',   'Жаксылыков Н.',   'E13', 'worker',  'электромонтёр',    4,    3,    'night', '1234'),
      ('2014', 'Ткаченко Игорь',      'Ткаченко И.',     'E14', 'worker',  'сварщик',          4,    3,    'night', '1234'),
      ('2015', 'Есенов Арман',        'Есенов А.',       'E15', 'worker',  'смазчик',          3,    3,    'night', '1234')
    ) as t(tab_no, full_name, short_name, pseudonym, role, specialty, grade, brigade_id, shift, pin)
  loop
    v_meta := jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'app_role', r.role);
    select id into v_id from auth.users where email = r.tab_no || '@naryad.local';
    if v_id is null then
      v_id := gen_random_uuid();
      insert into auth.users
        (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change_token_new, email_change,
         email_change_token_current, phone_change, phone_change_token, reauthentication_token)
      values
        ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
         r.tab_no || '@naryad.local',
         extensions.crypt('nr_' || r.pin || '_kz', extensions.gen_salt('bf', 10)), now(),
         v_meta, jsonb_build_object('tab_no', r.tab_no), now(), now(),
         '', '', '', '', '', '', '', '');
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (v_id::text, v_id,
              jsonb_build_object('sub', v_id::text, 'email', r.tab_no || '@naryad.local',
                                 'email_verified', true, 'phone_verified', false),
              'email', now(), now(), now());
    else
      update auth.users
         set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || v_meta,
             encrypted_password = extensions.crypt('nr_' || r.pin || '_kz', extensions.gen_salt('bf', 10)),
             updated_at = now()
       where id = v_id;
    end if;

    insert into public.employees (id, tab_no, full_name, short_name, pseudonym, role, specialty, grade, brigade_id, shift)
    values (v_id, r.tab_no, r.full_name, r.short_name, r.pseudonym, r.role::public.role_t, r.specialty,
            r.grade::smallint, r.brigade_id::smallint, r.shift)
    on conflict (tab_no) do update
       set full_name = excluded.full_name, short_name = excluded.short_name, pseudonym = excluded.pseudonym,
           role = excluded.role, specialty = excluded.specialty, grade = excluded.grade,
           brigade_id = excluded.brigade_id, shift = excluded.shift;
  end loop;

  update public.brigades b
     set leader_id = e.id
    from public.employees e
   where (b.id = 1 and e.tab_no = '2001')
      or (b.id = 2 and e.tab_no = '2007')
      or (b.id = 3 and e.tab_no = '2011');
end $$;
