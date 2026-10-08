-- Rota · seed tooling: deterministic history generator (CLAUDE.md §19) and the demo start state (§20).
-- Runs inside the database, so the dataset is regenerated with one call and always ends yesterday:
--   select internal.generate_history();   -- 92 days, about 560 orders, planted patterns P1 to P6
--   select public.demo_reset();           -- master or admin: back to the Demo Day start state

------------------------------------------------------------------------------
-- small helpers
------------------------------------------------------------------------------

-- local (UTC+5) date + hour → timestamptz
create or replace function internal.at_local(p_date date, p_hour double precision)
returns timestamptz language sql immutable set search_path = ''
as $$ select ((p_date::timestamp + make_interval(secs => p_hour * 3600)) - interval '5 hours') at time zone 'UTC' $$;

create or replace function internal.local_ts(p_ts timestamptz)
returns timestamp language sql immutable set search_path = ''
as $$ select (p_ts at time zone 'UTC') + interval '5 hours' $$;

create or replace function internal.rnd_exp(p_mean double precision)
returns double precision language sql volatile set search_path = ''
as $$ select -p_mean * ln(1 - random()) $$;

create or replace function internal.rnd_norm()
returns double precision language plpgsql volatile set search_path = ''
as $$
declare u1 double precision := 1 - random(); u2 double precision := random();
begin
  return sqrt(-2 * ln(u1)) * cos(2 * pi() * u2);
end $$;

create or replace function internal.rnd_between(p_lo double precision, p_hi double precision)
returns double precision language sql volatile set search_path = ''
as $$ select p_lo + (p_hi - p_lo) * random() $$;

create or replace function internal.rnd_pick(p_items text[], p_weights double precision[])
returns text language plpgsql volatile set search_path = ''
as $$
declare
  v_total double precision := 0;
  v_r     double precision;
  v_acc   double precision := 0;
  i       int;
begin
  for i in 1 .. array_length(p_weights, 1) loop v_total := v_total + p_weights[i]; end loop;
  v_r := random() * v_total;
  for i in 1 .. array_length(p_items, 1) loop
    v_acc := v_acc + p_weights[i];
    if v_r < v_acc then return p_items[i]; end if;
  end loop;
  return p_items[array_length(p_items, 1)];
end $$;

-- the problem chip text for a type and code, else the fault code name
create or replace function internal.problem_label(p_type text, p_code text)
returns text language sql stable set search_path = ''
as $$
  select coalesce(
    (select t.label from public.problem_templates t
      where t.equipment_type = p_type and t.suggested_fault_code = p_code order by t.sort limit 1),
    (select f.name from public.fault_codes f where f.code = p_code))
$$;

create or replace function internal.planned_label(p_code text)
returns text language sql immutable set search_path = ''
as $$
  select 'ППР: ' || case p_code
    when 'М-01' then 'замена футеровки' when 'М-04' then 'центровка привода'
    when 'М-05' then 'ревизия редуктора' when 'М-06' then 'осмотр и подтяжка крепежа'
    when 'М-07' then 'замена роликов' when 'С-01' then 'плановая смазка'
    when 'С-02' then 'замена масла' when 'Г-01' then 'замена РВД и уплотнений'
    when 'Э-04' then 'проверка датчиков и концевиков' when 'Э-06' then 'проверка освещения и щита'
    when 'П-01' then 'проверка пневмосистемы' when 'П-02' then 'ревизия пневмоклапанов'
    else 'плановое обслуживание' end
$$;

create or replace function internal.works_text(p_code text)
returns text language sql immutable set search_path = ''
as $$
  select case p_code
    when 'М-01' then 'Заменил футеровку, затянул крепёж, проверил на холостом ходу'
    when 'М-02' then 'Заменил подшипник, заложил смазку, проверил нагрев и шум'
    when 'М-03' then 'Вырезал повреждённый участок ленты, сделал стыковку, отрегулировал натяжение'
    when 'М-04' then 'Отцентровал привод, заменил упругие элементы муфты, вибрация в норме'
    when 'М-05' then 'Вскрыл редуктор, заменил шестерню и манжеты, залил масло'
    when 'М-06' then 'Заварил трещину, подтянул крепёж, проверил соединения'
    when 'М-07' then 'Заменил изношенные ролики, проверил ход ленты'
    when 'Э-01' then 'Заменил электродвигатель, проверил изоляцию и ток'
    when 'Э-02' then 'Заменил повреждённый участок кабеля, проверил изоляцию'
    when 'Э-03' then 'Заменил пускатель и автомат, проверил пуск'
    when 'Э-04' then 'Заменил датчик, отрегулировал срабатывание'
    when 'Э-05' then 'Нашёл причину срабатывания защиты, заменил предохранители, проверил нагрузку'
    when 'Э-06' then 'Заменил лампы и автомат в щите освещения'
    when 'Г-01' then 'Заменил уплотнительное кольцо и РВД, долил масло, течи нет'
    when 'Г-02' then 'Заменил гидронасос, фильтр и уплотнения, давление в норме'
    when 'Г-03' then 'Заменил манжеты гидроцилиндра, проверил ход штока'
    when 'П-01' then 'Заменил фитинги и участок шланга, утечки нет'
    when 'П-02' then 'Заменил пневмораспределитель, проверил срабатывание'
    when 'С-01' then 'Смазал узлы по карте смазки'
    when 'С-02' then 'Слил масло, заменил фильтр, залил свежее масло'
    else 'Работы выполнены' end
$$;

------------------------------------------------------------------------------
-- history generator
------------------------------------------------------------------------------

create or replace function internal.generate_history(p_days int default 92)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_today   date := internal.local_ts(now())::date;
  v_first   date := v_today - p_days;
  v_d0      timestamptz := internal.at_local(v_today, 0);
  v_start   timestamptz := internal.at_local(v_first, 0);
  v_m_day   uuid := (select id from public.employees where tab_no = '1001');
  v_m_night uuid := (select id from public.employees where tab_no = '1002');
  r         record;
  w         record;
  v_t       timestamptz;
  v_n       double precision;
  v_code    text;
  v_spec    text;
  v_cands   uuid[];
  v_pick    uuid;
  v_lt      timestamp;
  v_h       double precision;
  v_work    double precision;
  v_pause   double precision;
  v_score   double precision;
  v_id      bigint;
  v_rev1    bigint;
  v_rev2    bigint;
  v_mats    jsonb;
  v_item    jsonb;
  v_qty     numeric;
  v_unit    text;
  v_verdict public.verdict_t;
  v_final   public.verdict_t;
  v_fscore  int;
  v_checks  jsonb;
  v_last    text;
  v_r1      int;
  v_r3      int;
  v_r4      int;
  v_l1      int;
  v_l2      int;
  v_ded     int;
  v_ai      int;
  v_eqid    int;
  i         int;
  j         int;
  v_days    int[];
begin
  perform setseed(0.2026);
  perform set_config('rota.seeding', 'on', true);

  delete from public.notifications;
  delete from public.orders;
  delete from public.integration_outbox;
  delete from public.ai_insights where kind <> 'manual';
  update public.equipment set is_stopped = false;
  perform setval('public.order_number_seq', 100);

  drop table if exists _w;
  drop table if exists _o;
  drop table if exists _codes;

  create temp table _w as
  select e.id, e.tab_no, e.brigade_id, e.specialty, e.grade::int as grade,
         case e.tab_no when '2007' then 90 when '2001' then 88 when '2003' then 87 when '2011' then 86
                       when '2009' then 86 when '2004' then 85 when '2002' then 83 when '2012' then 82
                       when '2008' then 82 when '2013' then 81 when '2014' then 80 when '2005' then 79
                       when '2015' then 78 when '2010' then 77 when '2006' then 69 else 80 end::double precision as quality,
         case e.tab_no when '2006' then 0.30 else 0.065 end::double precision as rework_p,
         case e.tab_no when '2006' then 0.40 else 0.03 end::double precision as repeat_p,
         case e.tab_no when '2006' then 1.4 else 1.0 end::double precision as slow
    from public.employees e where e.role = 'worker';

  create temp table _codes (type text, kind char(1), code text, w double precision);
  insert into _codes values
    ('конвейер','u','М-02',.25),('конвейер','u','М-04',.2),('конвейер','u','М-03',.15),('конвейер','u','М-07',.2),('конвейер','u','Э-03',.1),('конвейер','u','С-01',.1),
    ('дробилка','u','М-01',.25),('дробилка','u','М-02',.2),('дробилка','u','М-04',.2),('дробилка','u','Г-01',.15),('дробилка','u','Э-01',.1),('дробилка','u','С-02',.1),
    ('грохот','u','М-06',.35),('грохот','u','М-02',.3),('грохот','u','М-04',.25),('грохот','u','С-01',.1),
    ('экскаватор','u','Г-01',.3),('экскаватор','u','Г-03',.2),('экскаватор','u','М-01',.15),('экскаватор','u','Э-06',.15),('экскаватор','u','Э-05',.1),('экскаватор','u','Г-02',.1),
    ('буровой станок','u','Г-01',.3),('буровой станок','u','П-01',.3),('буровой станок','u','П-02',.2),('буровой станок','u','С-01',.2),
    ('насос','u','Г-01',.25),('насос','u','М-04',.2),('насос','u','Г-02',.15),('насос','u','М-02',.25),('насос','u','Э-01',.15),
    ('компрессор','u','П-01',.35),('компрессор','u','Э-05',.25),('компрессор','u','С-02',.2),('компрессор','u','Э-03',.2),
    ('сушильный барабан','u','М-01',.2),('сушильный барабан','u','М-02',.3),('сушильный барабан','u','М-04',.3),('сушильный барабан','u','С-01',.2),
    ('вентилятор','u','М-04',.35),('вентилятор','u','М-02',.35),('вентилятор','u','Э-01',.15),('вентилятор','u','Э-05',.15),
    ('циклон','u','М-06',.6),('циклон','u','М-01',.4),
    ('фильтр','u','П-02',.5),('фильтр','u','П-01',.5),
    ('упаковочная машина','u','Э-04',.35),('упаковочная машина','u','П-02',.3),('упаковочная машина','u','М-05',.15),('упаковочная машина','u','П-01',.2),
    ('кран','u','Э-04',.3),('кран','u','М-05',.3),('кран','u','Э-02',.2),('кран','u','С-01',.2),
    ('погрузчик','u','Г-01',.4),('погрузчик','u','Г-03',.3),('погрузчик','u','Э-06',.15),('погрузчик','u','С-02',.15),
    ('конвейер','p','М-07',.5),('конвейер','p','М-04',.5),
    ('дробилка','p','М-01',.3),('дробилка','p','М-04',.3),('дробилка','p','С-02',.4),
    ('грохот','p','М-06',.4),('грохот','p','М-04',.3),('грохот','p','С-01',.3),
    ('экскаватор','p','С-02',.4),('экскаватор','p','Г-01',.3),('экскаватор','p','Э-06',.3),
    ('буровой станок','p','С-01',.5),('буровой станок','p','П-01',.5),
    ('насос','p','С-02',.5),('насос','p','М-04',.5),
    ('компрессор','p','С-02',.6),('компрессор','p','П-01',.4),
    ('сушильный барабан','p','С-01',.5),('сушильный барабан','p','М-04',.5),
    ('вентилятор','p','М-04',.6),('вентилятор','p','С-01',.4),
    ('циклон','p','М-06',1),('фильтр','p','П-02',1),
    ('упаковочная машина','p','Э-04',.5),('упаковочная машина','p','П-01',.5),
    ('кран','p','С-01',.5),('кран','p','Э-04',.5),
    ('погрузчик','p','С-02',1);

  create temp table _o (
    seq            serial primary key,
    kind           text not null,
    type           public.order_type_t not null,
    priority       public.priority_t not null,
    equipment_id   int not null,
    code           text not null,
    description    text not null,
    created_at     timestamptz not null,
    shift          text,
    night_brigade  int,
    parent_seq     int,
    brigade_id     smallint,
    first_assignee uuid,
    assignee       uuid,
    master_id      uuid,
    reject_reason  text,
    reject_comment text,
    reject_justified boolean not null default false,
    queued         boolean not null default false,
    paused         boolean not null default false,
    pause_reason   text,
    pause_comment  text,
    rework         boolean not null default false,
    override       boolean not null default false,
    stopped        boolean not null default false,
    norm           numeric,
    due_at         timestamptz,
    rejected_at    timestamptz,
    reassigned_at  timestamptz,
    queued_at      timestamptz,
    accepted_at    timestamptz,
    started_at     timestamptz,
    paused_at      timestamptz,
    resumed_at     timestamptz,
    done1_at       timestamptz,
    review1_at     timestamptz,
    rework_at      timestamptz,
    done_at        timestamptz,
    review2_at     timestamptz,
    closed_at      timestamptz,
    closer         uuid,
    score1         int,
    score          int,
    master_score   int,
    order_id       bigint
  );

  -- 1. unplanned base failures: Poisson process per unit (K-3, ЦНС-300 №2 and the extras come below)
  for r in
    select e.id, e.type, e.criticality, e.area_id,
           case e.id when 1 then 9 when 2 then 9 when 3 then 7 when 4 then 6 when 5 then 4 when 6 then 5
                     when 7 then 10 when 8 then 9 when 9 then 4 when 10 then 7 when 11 then 5 when 12 then 5
                     when 13 then 0 when 14 then 8 when 15 then 6 when 16 then 8 when 17 then 6 when 18 then 3
                     when 19 then 6 when 20 then 5 when 21 then 7 when 22 then 6 when 23 then 4 when 24 then 5
                     else 4 end::double precision * p_days / 92.0 as n,
           case when e.id = 5 then v_d0 - interval '42 days' else v_d0 end as until_ts
      from public.equipment e order by e.id
  loop
    continue when r.n <= 0;
    v_t := v_start + make_interval(secs => internal.rnd_exp(p_days * 86400.0 / r.n));
    while v_t < r.until_ts loop
      select internal.rnd_pick(array_agg(c.code order by c.code), array_agg(c.w order by c.code)) into v_code
        from _codes c where c.type = r.type and c.kind = 'u' and not (r.area_id = 3 and c.code like 'Э%');
      insert into _o (kind, type, priority, equipment_id, code, description, created_at)
      values ('base', 'unplanned',
              internal.rnd_pick(array['emergency','high','normal'],
                                case r.criticality when 'A' then array[.25,.35,.40]::double precision[]
                                                   when 'B' then array[.12,.33,.55]::double precision[]
                                                   else array[.05,.25,.70]::double precision[] end)::public.priority_t,
              r.id, v_code, internal.problem_label(r.type, v_code), v_t);
      v_t := v_t + make_interval(secs => internal.rnd_exp(p_days * 86400.0 / r.n));
    end loop;
  end loop;

  -- 2. P1 Конвейер К-3 (id 13): 21 failures, 15 of them М-02; the last 30 days hold exactly 7 with 5 М-02
  v_days := array[4, 10, 16, 22, 28, 34, 40, 46, 52, 58, 64, 70, 76, 82, 88];
  foreach i in array v_days loop
    if i < p_days then
      v_t := internal.at_local(v_today - i, internal.rnd_between(1, 23));
      insert into _o (kind, type, priority, equipment_id, code, description, created_at)
      values ('p1', 'unplanned', internal.rnd_pick(array['emergency','high'], array[.4,.6])::public.priority_t,
              13, 'М-02', 'Шум подшипника', v_t);
    end if;
  end loop;
  for r in select * from (values (25,'М-07'),(13,'Э-03'),(37,'М-04'),(55,'М-07'),(67,'С-01'),(79,'М-03')) as t(d, code) loop
    if r.d < p_days then
      insert into _o (kind, type, priority, equipment_id, code, description, created_at)
      values ('p1', 'unplanned', 'high', 13, r.code, internal.problem_label('конвейер', r.code),
              internal.at_local(v_today - r.d, internal.rnd_between(1, 23)));
    end if;
  end loop;

  -- 3. P6 Насос водоотлива ЦНС-300 №2 (id 5): weekly failures rising over the last 6 weeks: 0 1 1 1 2 3
  for r in select * from (values (5,0),(4,1),(3,1),(2,1),(1,2),(0,3)) as t(wk, cnt) loop
    for j in 1 .. r.cnt loop
      v_code := internal.rnd_pick(array['М-02','Г-01','М-04','Э-01'], array[.4,.25,.2,.15]);
      insert into _o (kind, type, priority, equipment_id, code, description, created_at)
      values ('p6', 'unplanned', internal.rnd_pick(array['emergency','high','normal'], array[.3,.4,.3])::public.priority_t,
              5, v_code, internal.problem_label('насос', v_code),
              internal.at_local(v_today - (r.wk * 7) - 7, internal.rnd_between(0, 7 * 24 - 0.5)));
    end loop;
  end loop;

  -- 4. P4 Участок обогащения: electrical failures, 5 on day shifts and 13 at night (9 of them 02:00 to 05:00)
  for j in 1 .. 18 loop
    v_eqid := (array[17, 20, 21])[1 + floor(random() * 3)::int];
    select e.id, e.type into r from public.equipment e where e.id = v_eqid;
    v_code := internal.rnd_pick(array['Э-01','Э-03','Э-05','Э-02'], array[.3,.3,.3,.1]);
    v_h := case when j <= 5 then internal.rnd_between(8.5, 19.5)
                when j <= 14 then internal.rnd_between(2, 4.95)
                when j <= 16 then internal.rnd_between(20.5, 23.9)
                else internal.rnd_between(0.2, 1.9) end;
    insert into _o (kind, type, priority, equipment_id, code, description, created_at)
    values ('p4', 'unplanned', internal.rnd_pick(array['emergency','high','normal'], array[.2,.4,.4])::public.priority_t,
            r.id, v_code, internal.problem_label(r.type, v_code),
            internal.at_local(v_first + 2 + floor(random() * (p_days - 4))::int, v_h));
  end loop;

  -- 5. planned maintenance: A every 7 days, B every 10, C every 21; lubrication rounds weekly on conveyors
  for r in select e.id, e.type, e.criticality from public.equipment e order by e.id loop
    v_n := case r.criticality when 'A' then 7 when 'B' then 10 else 21 end;
    i := 1 + floor(random() * v_n)::int;
    while i < p_days loop
      select internal.rnd_pick(array_agg(c.code order by c.code), array_agg(c.w order by c.code)) into v_code
        from _codes c where c.type = r.type and c.kind = 'p';
      insert into _o (kind, type, priority, equipment_id, code, description, created_at)
      values (case when r.id = 9 then 'p3' else 'ppr' end, 'planned', 'planned', r.id, v_code,
              internal.planned_label(v_code),
              internal.at_local(v_first + i, internal.rnd_between(8.1, 9.5)));
      i := i + v_n::int;
    end loop;
  end loop;
  for r in select unnest(array[11, 12, 13, 23, 7, 8]) as id loop
    i := 3;
    while i < p_days loop
      insert into _o (kind, type, priority, equipment_id, code, description, created_at)
      values ('lube', 'planned', 'planned', r.id, 'С-01', 'ППР: плановая смазка',
              internal.at_local(v_first + i, internal.rnd_between(9, 11)));
      i := i + 7;
    end loop;
  end loop;

  -- 6. P3 Дробилка КМД-1750 №2 (id 9): ППР by бригада 3, 60% followed by a failure 2 to 5 days later
  for r in select * from _o where kind = 'p3' order by created_at loop
    if random() < 0.6 then
      v_t := r.created_at + make_interval(secs => internal.rnd_between(2.2, 4.8) * 86400);
      if v_t < v_d0 then
        v_code := internal.rnd_pick(array['М-04','М-02','М-01','Г-01'], array[.4,.3,.2,.1]);
        insert into _o (kind, type, priority, equipment_id, code, description, created_at, parent_seq)
        values ('p3fail', 'unplanned', internal.rnd_pick(array['emergency','high'], array[.4,.6])::public.priority_t,
                9, v_code, internal.problem_label('дробилка', v_code), v_t, r.seq);
      end if;
    end if;
  end loop;

  -- shift, rotation (бригада 3 is on nights this week, the week before бригада 2, then 1, …), master
  update _o set
    shift = case when extract(hour from internal.local_ts(created_at)) between 8 and 19 then 'day' else 'night' end;
  update _o set
    night_brigade = (((2 - ((v_today - (internal.local_ts(created_at)::date
                                        - case when shift = 'night' and extract(hour from internal.local_ts(created_at)) < 8
                                               then 1 else 0 end) - 1) / 7)) % 3 + 3) % 3) + 1,
    master_id = case when shift = 'day' then v_m_day else v_m_night end;

  -- 7. assignment (brigade orders, rejections) and repeat failures (P2: Сериков)
  for i in 1 .. 2 loop     -- pass 2 assigns the repeat failures created in pass 1
    for r in select o.*, f.specialty from _o o join public.fault_codes f on f.code = o.code
              where o.assignee is null order by o.created_at loop
      if r.kind = 'p3' then
        update _o set brigade_id = 3, assignee = (select leader_id from public.brigades where id = 3),
                      first_assignee = (select leader_id from public.brigades where id = 3)
         where seq = r.seq;
        continue;
      end if;
      if (r.type = 'planned' and r.code in ('М-01','М-05'))
         or (r.type = 'unplanned' and r.priority = 'emergency' and r.code in ('М-01','М-05','Г-02','Э-01')) then
        select b.id into j from public.brigades b
         where (r.shift = 'night' and b.id = r.night_brigade) or (r.shift = 'day' and b.id <> r.night_brigade)
         order by random() limit 1;
        update _o set brigade_id = j, assignee = (select leader_id from public.brigades where id = j),
                      first_assignee = (select leader_id from public.brigades where id = j)
         where seq = r.seq;
        continue;
      end if;
      v_spec := case when r.code = 'С-01' and r.kind = 'lube' then 'смазчик' else r.specialty end;
      select array_agg(x.id order by case when r.equipment_id = 13
                                          then (select count(*) from _o z where z.equipment_id = 13 and z.assignee = x.id)
                                          else 0 end, random()) into v_cands from _w x
       where x.specialty = v_spec
         and ((r.shift = 'night' and x.brigade_id = r.night_brigade) or (r.shift = 'day' and x.brigade_id <> r.night_brigade))
         and not (r.equipment_id = 13 and x.tab_no = '2006');
      if v_cands is null then
        select array_agg(x.id order by random()) into v_cands from _w x
         where x.specialty = 'слесарь'
           and ((r.shift = 'night' and x.brigade_id = r.night_brigade) or (r.shift = 'day' and x.brigade_id <> r.night_brigade))
           and not (r.equipment_id = 13 and x.tab_no = '2006');
      end if;
      v_pick := v_cands[1];
      update _o set assignee = v_pick, first_assignee = v_pick where seq = r.seq;
      -- about 6% of orders are rejected first and reassigned to a colleague with the same trade
      if array_length(v_cands, 1) > 1 and r.kind <> 'lube' and random() < 0.1 then
        update _o set first_assignee = v_cands[2],
                      reject_reason = internal.rnd_pick(array['no_materials','no_permit','busy_emergency','equipment_running','other'],
                                                        array[.3,.25,.2,.15,.1])
         where seq = r.seq;
        update _o set reject_comment = case when reject_reason = 'other'
                                            then internal.rnd_pick(array['Нет напарника','Нет инструмента','Занят на другом участке'], array[1,1,1]::double precision[]) end,
                      reject_justified = reject_reason = 'other' and random() < 0.4
         where seq = r.seq;
      end if;
    end loop;

    exit when i = 2;
    -- repeat failures after a weak repair, same unit and code, 1.5 to 6.5 days later
    for r in select o.*, x.repeat_p from _o o join _w x on x.id = o.assignee
              where o.type = 'unplanned' and o.equipment_id not in (5, 13) order by o.created_at loop
      if random() < r.repeat_p then
        v_t := r.created_at + make_interval(secs => internal.rnd_between(1.5, 6.5) * 86400);
        if v_t < v_d0 then
          insert into _o (kind, type, priority, equipment_id, code, description, created_at, parent_seq)
          select 'repeat', 'unplanned', internal.rnd_pick(array['emergency','high','normal'], array[.2,.4,.4])::public.priority_t,
                 r.equipment_id, r.code, r.description, v_t, r.seq;
        end if;
      end if;
    end loop;
    update _o set
      shift = case when extract(hour from internal.local_ts(created_at)) between 8 and 19 then 'day' else 'night' end
     where shift is null;
    update _o set
      night_brigade = (((2 - ((v_today - (internal.local_ts(created_at)::date
                                          - case when shift = 'night' and extract(hour from internal.local_ts(created_at)) < 8
                                                 then 1 else 0 end) - 1) / 7)) % 3 + 3) % 3) + 1,
      master_id = case when shift = 'day' then v_m_day else v_m_night end
     where night_brigade is null;
  end loop;

  -- 8. timeline: reaction, queue, pauses, work time around the norm, AI check, rework, master close
  for r in select o.*, n.norm_hours, x.grade, x.quality, x.rework_p, x.slow, x.brigade_id as worker_brigade
             from _o o join public.work_norms n on n.fault_code = o.code join _w x on x.id = o.assignee
            order by o.created_at loop
    v_t := r.created_at;
    update _o set norm = r.norm_hours,
                  stopped = case when r.equipment_id = 13 and r.type = 'unplanned' then true
                                 when r.type = 'unplanned' then r.priority in ('emergency','high') or random() < 0.3
                                 else (select criticality = 'A' from public.equipment where id = r.equipment_id) end,
                  due_at = r.created_at + make_interval(secs => 3600 * case r.priority
                             when 'emergency' then greatest(r.norm_hours * 1.1, 1.5)
                             when 'high' then greatest(r.norm_hours * 1.6, 2.5)
                             when 'normal' then greatest(r.norm_hours * 2.3, 4)
                             else greatest(r.norm_hours * 2.5, 6) end)
     where seq = r.seq;
    if r.reject_reason is not null then
      v_t := v_t + make_interval(secs => 60 * (1 + internal.rnd_exp(case when r.priority = 'emergency' then 2 else 5 end)));
      update _o set rejected_at = v_t where seq = r.seq;
      v_t := v_t + make_interval(secs => 60 * (2 + internal.rnd_exp(8)));
      update _o set reassigned_at = v_t where seq = r.seq;
    end if;
    v_t := v_t + make_interval(secs => 60 * (0.3 + internal.rnd_exp(case when r.priority = 'emergency' then 2 else 6 end)));
    if r.priority <> 'emergency' and random() < 0.2 then
      update _o set queued = true, queued_at = v_t where seq = r.seq;
      v_t := v_t + make_interval(secs => 60 * (5 + internal.rnd_exp(45)));
    end if;
    update _o set accepted_at = v_t where seq = r.seq;
    v_t := v_t + make_interval(secs => 60 * (0.5 + internal.rnd_exp(case when r.priority = 'emergency' then 2 else 8 end)));
    update _o set started_at = v_t where seq = r.seq;
    v_work := 3600 * r.norm_hours * (1.25 - 0.07 * r.grade) * r.slow * exp(0.35 * internal.rnd_norm());
    v_pause := 0;
    if random() < (case when r.equipment_id = 13 and r.type = 'unplanned' then 0.45 else 0.14 end) then
      v_pause := 3600 * internal.rnd_between(0.5, 4);
      update _o set paused = true,
                    paused_at = v_t + make_interval(secs => v_work * internal.rnd_between(0.2, 0.7)),
                    pause_reason = internal.rnd_pick(array['waiting_parts','waiting_stop','waiting_permit','other'], array[.5,.25,.2,.05]),
                    pause_comment = internal.rnd_pick(array['Ждём запчасть со склада','Ждём остановку линии','Ждём допуск','Перерыв на обед'], array[1,1,1,1]::double precision[])
       where seq = r.seq;
      if r.equipment_id = 13 and r.type = 'unplanned' then
        update _o set pause_reason = 'waiting_parts', pause_comment = 'Ждём подшипник со склада' where seq = r.seq;
      end if;
      update _o set resumed_at = paused_at + make_interval(secs => v_pause) where seq = r.seq;
    end if;
    v_t := v_t + make_interval(secs => v_work + v_pause);
    update _o set done1_at = v_t, review1_at = v_t + make_interval(secs => internal.rnd_between(12, 40)) where seq = r.seq;

    -- scores: quality of the worker, minus lateness
    v_score := r.quality + 7 * internal.rnd_norm()
               - case when v_t > (select due_at from _o where seq = r.seq) then 5 else 0 end;
    if random() < r.rework_p then
      update _o set rework = true,
                    score1 = round(internal.rnd_between(50, 58))::int,
                    rework_at = review1_at + make_interval(secs => 60 * (2 + internal.rnd_exp(25)))
       where seq = r.seq;
      update _o set done_at = rework_at + make_interval(secs => 60 * internal.rnd_between(20, 60)) where seq = r.seq;
      update _o set review2_at = done_at + make_interval(secs => internal.rnd_between(12, 40)) where seq = r.seq;
      v_score := v_score - 4;
    else
      update _o set done_at = done1_at where seq = r.seq;
    end if;
    update _o set score = least(99, greatest(60, round(v_score)))::int where seq = r.seq;
    update _o set closed_at = coalesce(review2_at, review1_at) + make_interval(secs => 60 * (3 + internal.rnd_exp(40))) where seq = r.seq;
    update _o set closer = case when extract(hour from internal.local_ts(closed_at)) between 8 and 19 then v_m_day else v_m_night end,
                  override = random() < 0.075
     where seq = r.seq;
    update _o set master_score = case when override
                                      then least(100, greatest(40, score + (case when random() < 0.5 then -1 else 1 end)
                                                                    * round(internal.rnd_between(5, 12))::int))
                                      end
     where seq = r.seq;
  end loop;

  -- 9. write orders, events, materials and AI reviews
  for r in select o.*, e.area_id, e.type as eq_type, x.brigade_id as worker_brigade
             from _o o join public.equipment e on e.id = o.equipment_id join _w x on x.id = o.assignee
            order by o.created_at, o.seq loop
    v_verdict := case when r.score >= 80 then 'accepted' else 'accepted_with_remarks' end;
    v_fscore := coalesce(r.master_score, r.score);
    v_final := case when v_fscore >= 80 then 'accepted' when v_fscore >= 60 then 'accepted_with_remarks' else 'rework' end;
    v_last := case when r.paused then r.pause_comment when r.reject_reason = 'other' then r.reject_comment end;

    insert into public.orders
      (client_ref, type, priority, description, area_id, equipment_id, assignee_id, brigade_id, master_id, status,
       due_at, norm_hours, equipment_stopped, suggested_fault_code, works_done, fault_code, created_at, issued_at,
       accepted_at, queued_at, started_at, done_at, closed_at, paused_total_sec, last_comment, rework_count,
       final_verdict, final_score, is_demo)
    values
      (gen_random_uuid(), r.type, r.priority, r.description, r.area_id, r.equipment_id, r.assignee, r.brigade_id,
       r.master_id, 'closed', r.due_at, r.norm, r.stopped, r.code, internal.works_text(r.code), r.code, r.created_at,
       coalesce(r.reassigned_at, r.created_at), r.accepted_at, r.queued_at, r.started_at, r.done_at, r.closed_at,
       coalesce(extract(epoch from (r.resumed_at - r.paused_at)), 0)::int
         + coalesce(extract(epoch from (r.rework_at - r.done1_at)), 0)::int,
       v_last, case when r.rework then 1 else 0 end, v_final, v_fscore, false)
    returning id into v_id;
    update _o set order_id = v_id where seq = r.seq;

    -- events
    insert into public.order_events (order_id, actor_id, action, from_status, to_status, payload, created_at)
    values (v_id, r.master_id, 'create', null, 'issued',
            jsonb_build_object('assignee_id', r.first_assignee, 'brigade_id', r.brigade_id, 'priority', r.priority,
                               'type', r.type, 'due_at', r.due_at), r.created_at);
    if r.reject_reason is not null then
      insert into public.order_events (order_id, actor_id, action, from_status, to_status, reason, comment, created_at)
      values (v_id, r.first_assignee, 'reject', 'issued', 'rejected', r.reject_reason, r.reject_comment, r.rejected_at);
      insert into public.order_events (order_id, actor_id, action, from_status, to_status, payload, created_at)
      values (v_id, r.master_id, 'reassign', 'rejected', 'issued',
              jsonb_build_object('from_assignee_id', r.first_assignee, 'to_assignee_id', r.assignee), r.reassigned_at);
    end if;
    if r.queued then
      insert into public.order_events (order_id, actor_id, action, from_status, to_status, created_at)
      values (v_id, r.assignee, 'queue', 'issued', 'queued', r.queued_at);
    end if;
    insert into public.order_events (order_id, actor_id, action, from_status, to_status, created_at)
    values (v_id, r.assignee, 'accept', case when r.queued then 'queued' else 'issued' end::public.status_t, 'accepted', r.accepted_at),
           (v_id, r.assignee, 'start', 'accepted', 'in_progress', r.started_at);
    if r.paused then
      insert into public.order_events (order_id, actor_id, action, from_status, to_status, reason, comment, created_at)
      values (v_id, r.assignee, 'pause', 'in_progress', 'paused', r.pause_reason, r.pause_comment, r.paused_at),
             (v_id, r.assignee, 'resume', 'paused', 'in_progress', null, null, r.resumed_at);
    end if;

    -- materials of the final submission (P5: бригада 1 uses about 2.2 × the Литол norm on С-01)
    v_mats := '[]'::jsonb;
    if random() > 0.05 then
      for v_item in select * from jsonb_array_elements((select typical from public.work_norms where fault_code = r.code)) loop
        continue when v_mats <> '[]'::jsonb and random() > 0.8;
        v_unit := (select unit from public.materials where id = (v_item ->> 'material_id')::int);
        v_qty := (v_item ->> 'qty')::numeric * exp(0.25 * internal.rnd_norm());
        if r.code = 'С-01' and (v_item ->> 'material_id')::int = 18 and coalesce(r.brigade_id, r.worker_brigade) = 1 then
          v_qty := (v_item ->> 'qty')::numeric * 2.2 * exp(0.08 * internal.rnd_norm());
        else
          v_qty := least(v_qty, (v_item ->> 'qty_max')::numeric);
        end if;
        v_qty := case when v_unit in ('шт','компл') then greatest(1, round(v_qty)) else greatest(0.1, round(v_qty, 1)) end;
        v_mats := v_mats || jsonb_build_object('material_id', (v_item ->> 'material_id')::int, 'qty', v_qty);
      end loop;
    end if;
    insert into public.order_materials (order_id, material_id, qty)
    select v_id, (m ->> 'material_id')::int, (m ->> 'qty')::numeric from jsonb_array_elements(v_mats) m;

    -- AI review(s): R1..R4 rules + L1, L2 judgement; history photos are not stored
    if r.rework then
      -- points add up to score1 (50 to 58): the judgement fails, the rules mostly pass
      v_checks := jsonb_build_array(
        jsonb_build_object('id','R1','status','pass','points',20,'max',20,'message_ru','отчёт заполнен'),
        jsonb_build_object('id','R2','status','pass','points',10,'max',10,'message_ru','фото сделаны во время работ'),
        jsonb_build_object('id','R3','status','warn','points',r.score1 - 50,'max',15,'message_ru','расход материалов выше обычного'),
        jsonb_build_object('id','R4','status','pass','points',20,'max',20,'message_ru','время в пределах норматива'),
        jsonb_build_object('id','L1','status','fail','points',0,'max',20,'message_ru','работы не устраняют заявленную неисправность'),
        jsonb_build_object('id','L2','status','fail','points',0,'max',15,'message_ru','на фото после неисправность видна'));
      insert into public.ai_reviews (order_id, attempt, verdict, score, score5, confidence, needs_master_review, checks,
                                     feedback_worker, report_master, model, latency_ms, created_at,
                                     master_verdict, master_id, master_decided_at)
      values (v_id, 1, 'rework', r.score1, greatest(1, least(5, round(r.score1 / 20.0)))::smallint,
              round(internal.rnd_between(0.75, 0.93)::numeric, 2), false, v_checks,
              jsonb_build_object('good', jsonb_build_array('Отчёт заполнен'), 'improve', jsonb_build_array('Устраните причину, а не только следствие')),
              jsonb_build_object('summary', 'Работы не устраняют неисправность, наряд возвращён на доработку'),
              'seed', round(internal.rnd_between(6000, 14000))::int, r.review1_at, null, null, null)
      returning id into v_rev1;
      insert into public.order_events (order_id, actor_id, action, from_status, to_status, payload, created_at)
      values (v_id, r.assignee, 'complete', 'in_progress', 'done', jsonb_build_object('fault_code', r.code), r.done1_at),
             (v_id, null, 'review_started', 'done', 'ai_review', jsonb_build_object('attempt', 1), r.done1_at),
             (v_id, null, 'ai_result', 'ai_review', 'rework', jsonb_build_object('review_id', v_rev1, 'verdict', 'rework', 'score', r.score1), r.review1_at),
             (v_id, r.assignee, 'resume_rework', 'rework', 'in_progress', '{}'::jsonb, r.rework_at);
    end if;

    -- spread the deduction (100 − score) over the checks so the breakdown adds up to the score
    v_r4 := case when r.done_at > r.due_at then 15 else 20 end;
    v_r3 := case when exists (select 1 from jsonb_array_elements(v_mats) m
                               join lateral jsonb_array_elements((select typical from public.work_norms where fault_code = r.code)) t
                                 on (t ->> 'material_id') = (m ->> 'material_id')
                              where (m ->> 'qty')::numeric > (t ->> 'qty')::numeric * 1.8) then 10 else 15 end;
    v_ded := greatest(0, 100 - r.score - (20 - v_r4) - (15 - v_r3));
    v_l2 := 15 - least(v_ded, 10);   v_ded := v_ded - (15 - v_l2);
    v_l1 := 20 - least(v_ded, 10);   v_ded := v_ded - (20 - v_l1);
    v_r1 := 20 - least(v_ded, 5);    v_ded := v_ded - (20 - v_r1);
    v_l2 := greatest(2, v_l2 - v_ded);
    v_ai := v_r1 + 10 + v_r3 + v_r4 + v_l1 + v_l2;
    v_verdict := case when v_ai >= 80 then 'accepted' else 'accepted_with_remarks' end;
    v_checks := jsonb_build_array(
      jsonb_build_object('id','R1','status', case when v_r1 = 20 then 'pass' else 'warn' end,'points',v_r1,'max',20,
                         'message_ru', case when v_r1 = 20 then 'отчёт заполнен, шифр указан' else 'описание работ короткое' end),
      jsonb_build_object('id','R2','status','pass','points',10,'max',10,'message_ru','фото сделаны во время работ'),
      jsonb_build_object('id','R3','status', case when v_r3 = 15 then 'pass' else 'warn' end,'points',v_r3,'max',15,
                         'message_ru', case when v_r3 = 15 then 'материалы в норме' else 'расход материалов выше обычного' end),
      jsonb_build_object('id','R4','status', case when v_r4 = 20 then 'pass' else 'warn' end,'points',v_r4,'max',20,
                         'message_ru', case when v_r4 = 20 then 'время в пределах норматива'
                                            else 'срок нарушен на ' || ceil(extract(epoch from (r.done_at - r.due_at)) / 60)::int || ' мин' end),
      jsonb_build_object('id','L1','status', case when v_l1 = 20 then 'pass' else 'warn' end,'points',v_l1,'max',20,
                         'message_ru', case when v_l1 = 20 then 'работы соответствуют неисправности' else 'описание работ неполное' end),
      jsonb_build_object('id','L2','status', case when v_l2 >= 12 then 'pass' else 'warn' end,'points',v_l2,'max',15,
                         'message_ru', case when v_l2 >= 12 then 'неисправность устранена, рабочее место убрано'
                                            else 'на фото после видны замечания: мусор или незакреплённые детали' end));
    v_fscore := coalesce(r.master_score, v_ai);
    v_final := case when v_fscore >= 80 then 'accepted' when v_fscore >= 60 then 'accepted_with_remarks' else 'rework' end;
    update public.orders set final_verdict = v_final, final_score = v_fscore where id = v_id;
    insert into public.ai_reviews (order_id, attempt, verdict, score, score5, confidence, needs_master_review, checks,
                                   feedback_worker, report_master, model, latency_ms, created_at,
                                   master_verdict, master_score, master_comment, master_id, master_decided_at)
    values (v_id, case when r.rework then 2 else 1 end, v_verdict, v_ai,
            greatest(1, least(5, round(v_ai / 20.0)))::smallint,
            round(internal.rnd_between(0.7, 0.95)::numeric, 2), false, v_checks,
            jsonb_build_object('good', jsonb_build_array('Работа выполнена', 'Отчёт заполнен полностью'),
                               'improve', case when v_ai >= 85 then '[]'::jsonb
                                               else jsonb_build_array('Подробнее описывайте выполненные работы') end),
            jsonb_build_object('summary', case when v_verdict = 'accepted' then 'Неисправность устранена, замечаний нет'
                                               else 'Работа выполнена с замечаниями' end),
            'seed', round(internal.rnd_between(6000, 14000))::int, coalesce(r.review2_at, r.review1_at),
            v_final, v_fscore, case when r.override then 'Оценка скорректирована мастером' end, r.closer, r.closed_at)
    returning id into v_rev2;
    insert into public.order_events (order_id, actor_id, action, from_status, to_status, payload, created_at)
    values (v_id, r.assignee, 'complete', 'in_progress', 'done',
            jsonb_build_object('fault_code', r.code, 'materials', v_mats), r.done_at),
           (v_id, null, 'review_started', 'done', 'ai_review',
            jsonb_build_object('attempt', case when r.rework then 2 else 1 end), r.done_at),
           (v_id, null, 'ai_result', 'ai_review', 'ai_review',
            jsonb_build_object('review_id', v_rev2, 'verdict', v_verdict, 'score', v_ai), coalesce(r.review2_at, r.review1_at)),
           (v_id, r.closer, 'close', 'ai_review', 'closed',
            jsonb_build_object('final_verdict', v_final, 'final_score', v_fscore, 'ai_verdict', v_verdict,
                               'ai_score', v_ai, 'changed', r.override), r.closed_at);
    if r.reject_justified then
      insert into public.order_events (order_id, actor_id, action, from_status, to_status, payload, created_at)
      select v_id, r.closer, 'mark_reject_justified', 'closed', 'closed',
             jsonb_build_object('justified', true, 'reject_event_id', e.id), r.closed_at + interval '1 minute'
        from public.order_events e where e.order_id = v_id and e.action = 'reject';
    end if;
    update public.orders set ai_review_id = v_rev2 where id = v_id;
  end loop;

  insert into public.settings (key, value)
  values ('history_max_order_id', to_jsonb((select coalesce(max(id), 0) from public.orders))),
         ('history_generated_at', to_jsonb(now()))
  on conflict (key) do update set value = excluded.value;
  perform setval('public.order_number_seq', (select coalesce(max(number), 100) from public.orders));

  return (select jsonb_build_object(
            'orders', count(*),
            'unplanned', count(*) filter (where type = 'unplanned'),
            'planned', count(*) filter (where type = 'planned'),
            'overdue_share', round(avg((done_at > due_at)::int)::numeric, 3),
            'rework_share', round(avg((rework_count > 0)::int)::numeric, 3),
            'changed_by_master_share', round((select avg(((payload ->> 'changed')::boolean)::int)
                                                from public.order_events where action = 'close')::numeric, 3),
            'rejected_share', round((select count(distinct order_id) from public.order_events where action = 'reject')::numeric
                                    / greatest(count(*), 1), 3),
            'paused_share', round((select count(distinct order_id) from public.order_events where action = 'pause')::numeric
                                  / greatest(count(*), 1), 3),
            'brigade_share', round(avg((brigade_id is not null)::int)::numeric, 3),
            'from', v_start, 'to', v_d0)
            from public.orders);
end $$;

------------------------------------------------------------------------------
-- demo start state (CLAUDE.md §20)
------------------------------------------------------------------------------

-- a full R1..L2 breakdown whose points add up to the given score (for seeded reviews)
create or replace function internal.seed_checks(p_score int)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  d  int := greatest(0, least(100, 100 - p_score));
  r1 int; r3 int; r4 int := 20; l1 int; l2 int; v_sum int;
begin
  l2 := 15 - least(d, 10); d := d - (15 - l2);
  l1 := 20 - least(d, 10); d := d - (20 - l1);
  r3 := 15 - least(d, 5);  d := d - (15 - r3);
  r1 := 20 - least(d, 5);  d := d - (20 - r1);
  l2 := greatest(0, l2 - d);
  v_sum := r1 + 10 + r3 + r4 + l1 + l2;
  if v_sum > p_score then r4 := greatest(0, r4 - (v_sum - p_score)); end if;
  return jsonb_build_array(
    jsonb_build_object('id','R1','title','Полнота отчёта','status', case when r1 = 20 then 'pass' else 'warn' end,
                       'points', r1, 'max', 20,
                       'message_ru', case when r1 = 20 then 'отчёт заполнен, шифр и материалы указаны' else 'описание работ короткое' end),
    jsonb_build_object('id','R2','title','Подлинность фото','status','pass','points',10,'max',10,
                       'message_ru','фото сделано камерой во время работ'),
    jsonb_build_object('id','R3','title','Материалы','status', case when r3 = 15 then 'pass' else 'warn' end,
                       'points', r3, 'max', 15,
                       'message_ru', case when r3 = 15 then 'материалы в пределах нормы' else 'расход выше обычного' end),
    jsonb_build_object('id','R4','title','Время и срок','status', case when r4 = 20 then 'pass' else 'warn' end,
                       'points', r4, 'max', 20,
                       'message_ru', case when r4 = 20 then 'время в пределах норматива' else 'работа заняла больше норматива' end),
    jsonb_build_object('id','L1','title','Работы и шифр','status', case when l1 = 20 then 'pass' else 'warn' end,
                       'points', l1, 'max', 20,
                       'message_ru', case when l1 = 20 then 'работы соответствуют неисправности' else 'описание работ неполное' end),
    jsonb_build_object('id','L2','title','Фото после','status', case when l2 >= 12 then 'pass' else 'warn' end,
                       'points', l2, 'max', 15,
                       'message_ru', case when l2 >= 12 then 'неисправность устранена, рабочее место убрано'
                                          else 'на фото после видны замечания' end));
end $$;

create or replace function internal.demo_order(
  p_tab text, p_equipment int, p_code text, p_description text, p_status public.status_t,
  p_priority public.priority_t, p_since interval, p_extra jsonb default '{}'
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_now    timestamptz := now();
  v_master uuid := (select id from public.employees where tab_no = '1001');
  v_worker uuid := (select id from public.employees where tab_no = p_tab);
  v_eq     public.equipment;
  v_id     bigint;
  v_t0     timestamptz := v_now - p_since;
  v_norm   numeric := (select norm_hours from public.work_norms where fault_code = p_code);
begin
  select * into v_eq from public.equipment where id = p_equipment;
  insert into public.orders
    (client_ref, type, priority, description, area_id, equipment_id, assignee_id, master_id, status, due_at,
     norm_hours, equipment_stopped, suggested_fault_code, created_at, issued_at, accepted_at, queued_at, started_at,
     paused_since, last_comment, queue_position, is_demo)
  values
    (gen_random_uuid(), coalesce((p_extra ->> 'type')::public.order_type_t, 'unplanned'), p_priority, p_description,
     v_eq.area_id, v_eq.id, v_worker, v_master, p_status, v_now + interval '6 hours', v_norm,
     coalesce((p_extra ->> 'stopped')::boolean, false), p_code, v_t0, v_t0,
     case when p_status in ('accepted','in_progress','paused') then v_t0 + interval '4 minutes' end,
     case when p_status = 'queued' then v_t0 + interval '3 minutes' end,
     case when p_status in ('in_progress','paused') then v_t0 + interval '9 minutes' end,
     case when p_status = 'paused' then v_now - interval '35 minutes' end,
     p_extra ->> 'comment', (p_extra ->> 'queue_position')::int, true)
  returning id into v_id;

  insert into public.order_events (order_id, actor_id, action, from_status, to_status, created_at)
  values (v_id, v_master, 'create', null, 'issued', v_t0);
  if p_status = 'queued' then
    insert into public.order_events (order_id, actor_id, action, from_status, to_status, created_at)
    values (v_id, v_worker, 'queue', 'issued', 'queued', v_t0 + interval '3 minutes');
  end if;
  if p_status in ('accepted','in_progress','paused') then
    insert into public.order_events (order_id, actor_id, action, from_status, to_status, created_at)
    values (v_id, v_worker, 'accept', 'issued', 'accepted', v_t0 + interval '4 minutes');
  end if;
  if p_status in ('in_progress','paused') then
    insert into public.order_events (order_id, actor_id, action, from_status, to_status, created_at)
    values (v_id, v_worker, 'start', 'accepted', 'in_progress', v_t0 + interval '9 minutes');
  end if;
  if p_status = 'paused' then
    insert into public.order_events (order_id, actor_id, action, from_status, to_status, reason, comment, created_at)
    values (v_id, v_worker, 'pause', 'in_progress', 'paused', 'waiting_parts', p_extra ->> 'comment', v_now - interval '35 minutes');
  end if;
  return v_id;
end $$;

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
  update public.employees set on_shift = tab_no in ('1001','2001','2002','2003','2005','2006','2007','2008','2009','2010');

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
                                 and o.status in ('issued','accepted','queued','rejected','in_progress','paused','rework'));

  return jsonb_build_object(
    'active', (select count(*) from public.orders where is_demo and status not in ('closed','cancelled')),
    'closed_today', (select count(*) from public.orders where is_demo and status = 'closed'),
    'on_shift', (select count(*) from public.employees where role = 'worker' and on_shift));
end $$;

create or replace function public.demo_reset()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.my_role() in ('master','admin'), false) is false
     and coalesce((select auth.role()), '') <> 'service_role' then
    perform internal.fail('FORBIDDEN', 'only a master or admin');
  end if;
  return internal.demo_reset();
end $$;

revoke execute on all functions in schema internal from public;
revoke execute on function public.demo_reset() from public, anon;
grant execute on function public.demo_reset() to authenticated, service_role;
