-- Rota · the 4 pieces the Supabase connector holds for approval (they contain DELETE / UPDATE-all / DROP
-- inside function bodies or a fresh-table update). Nothing is deleted when this runs: the database is new.
-- Paste the whole file into Supabase Dashboard → SQL Editor → Run, once. It is one transaction:
-- if anything fails, nothing changes.

begin;

-- ===== 1/4 · reference data (migration 06) =====
-- Rota · reference data (CLAUDE.md §19). Ids follow the order of the lists in §19:
-- areas 1 to 4, equipment 1 to 25, materials 1 to 40, brigades 1 to 3, problem templates 1 to 58.

insert into public.areas (id, code, name, sort) values
  (1, 'PIT', 'Карьер', 1),
  (2, 'CRU', 'Участок дробления', 2),
  (3, 'ENR', 'Участок обогащения', 3),
  (4, 'SHP', 'Участок отгрузки', 4);

insert into public.equipment (id, area_id, name, type, criticality) values
  ( 1, 1, 'Экскаватор ЭКГ-10 №7',          'экскаватор',         'A'),
  ( 2, 1, 'Экскаватор ЭКГ-10 №9',          'экскаватор',         'A'),
  ( 3, 1, 'Буровой станок СБШ-250 №3',     'буровой станок',     'B'),
  ( 4, 1, 'Насос водоотлива ЦНС-300 №1',   'насос',              'A'),
  ( 5, 1, 'Насос водоотлива ЦНС-300 №2',   'насос',              'A'),
  ( 6, 1, 'Компрессор передвижной ПВ-10',  'компрессор',         'C'),
  ( 7, 2, 'Дробилка щековая ЩДП-12х15',    'дробилка',           'A'),
  ( 8, 2, 'Дробилка КМД-1750 №1',          'дробилка',           'A'),
  ( 9, 2, 'Дробилка КМД-1750 №2',          'дробилка',           'A'),
  (10, 2, 'Грохот ГИЛ-52',                 'грохот',             'B'),
  (11, 2, 'Конвейер К-1',                  'конвейер',           'B'),
  (12, 2, 'Конвейер К-2',                  'конвейер',           'B'),
  (13, 2, 'Конвейер К-3',                  'конвейер',           'A'),
  (14, 3, 'Сушильный барабан №1',          'сушильный барабан',  'A'),
  (15, 3, 'Грохот плоский ГП-2',           'грохот',             'B'),
  (16, 3, 'Дробилка молотковая ДМ-1',      'дробилка',           'B'),
  (17, 3, 'Вентилятор ВДН-12,5',           'вентилятор',         'B'),
  (18, 3, 'Циклон ЦН-15 батарея №2',       'циклон',             'C'),
  (19, 3, 'Рукавный фильтр ФРИ-360',       'фильтр',             'B'),
  (20, 3, 'Насос НШ-32 маслостанции',      'насос',              'B'),
  (21, 3, 'Компрессор 4ВМ10-50/9',         'компрессор',         'A'),
  (22, 4, 'Упаковочная машина УМ-50',      'упаковочная машина', 'B'),
  (23, 4, 'Конвейер К-7 отгрузки',         'конвейер',           'B'),
  (24, 4, 'Кран мостовой 10 т',            'кран',               'B'),
  (25, 4, 'Погрузчик фронтальный №2',      'погрузчик',          'C');

update public.equipment
   set inventory_no = 'ИНВ-' || (104000 + id),
       qr_token     = substr(md5('rota-qr-' || id), 1, 12);

insert into public.equipment_type_specialty (type, specialty, label_plural_dat) values
  ('насос',              'слесарь',       'насосам'),
  ('конвейер',           'слесарь',       'конвейерам'),
  ('дробилка',           'слесарь',       'дробилкам'),
  ('грохот',             'слесарь',       'грохотам'),
  ('экскаватор',         'слесарь',       'экскаваторам'),
  ('буровой станок',     'слесарь',       'буровым станкам'),
  ('компрессор',         'слесарь',       'компрессорам'),
  ('сушильный барабан',  'слесарь',       'сушильным барабанам'),
  ('вентилятор',         'слесарь',       'вентиляторам'),
  ('циклон',             'сварщик',       'циклонам'),
  ('фильтр',             'слесарь',       'фильтрам'),
  ('упаковочная машина', 'электромонтёр', 'упаковочным машинам'),
  ('кран',               'слесарь',       'кранам'),
  ('погрузчик',          'слесарь',       'погрузчикам');

insert into public.fault_codes (code, grp, name, specialty) values
  ('М-01', 'М', 'Износ футеровки или брони',                  'слесарь'),
  ('М-02', 'М', 'Подшипник: перегрев, шум, разрушение',       'слесарь'),
  ('М-03', 'М', 'Повреждение конвейерной ленты',               'слесарь'),
  ('М-04', 'М', 'Вибрация, нарушение соосности',               'слесарь'),
  ('М-05', 'М', 'Износ редуктора или зубчатой передачи',       'слесарь'),
  ('М-06', 'М', 'Трещина металлоконструкции, ослабление крепежа', 'сварщик'),
  ('М-07', 'М', 'Износ ролика или барабана конвейера',         'слесарь'),
  ('Э-01', 'Э', 'Отказ электродвигателя',                      'электромонтёр'),
  ('Э-02', 'Э', 'Повреждение кабеля',                          'электромонтёр'),
  ('Э-03', 'Э', 'Неисправность пускателя или автомата',        'электромонтёр'),
  ('Э-04', 'Э', 'Отказ датчика или концевого выключателя',     'электромонтёр'),
  ('Э-05', 'Э', 'Срабатывание защиты, перегрев',               'электромонтёр'),
  ('Э-06', 'Э', 'Неисправность освещения или щита',            'электромонтёр'),
  ('Г-01', 'Г', 'Течь масла, повреждение РВД',                 'слесарь'),
  ('Г-02', 'Г', 'Отказ гидронасоса',                           'слесарь'),
  ('Г-03', 'Г', 'Неисправность гидроцилиндра',                 'слесарь'),
  ('П-01', 'П', 'Утечка сжатого воздуха',                      'слесарь'),
  ('П-02', 'П', 'Отказ пневмоклапана или пневмоцилиндра',      'слесарь'),
  ('С-01', 'С', 'Недостаток смазки',                           'смазчик'),
  ('С-02', 'С', 'Загрязнение масла, замена масла',             'смазчик');

insert into public.materials (id, sku, name, unit, unit_cost_kzt) values
  ( 1, 'MAT-001', 'Подшипник 22320',                 'шт',    185000),
  ( 2, 'MAT-002', 'Подшипник 3626',                  'шт',     95000),
  ( 3, 'MAT-003', 'Подшипник 6312',                  'шт',     12000),
  ( 4, 'MAT-004', 'Подшипник 180310',                'шт',      9000),
  ( 5, 'MAT-005', 'Лента конвейерная',               'м',      45000),
  ( 6, 'MAT-006', 'Ролик конвейерный',               'шт',     18000),
  ( 7, 'MAT-007', 'Футеровка барабана',              'компл', 1200000),
  ( 8, 'MAT-008', 'Броня конуса КМД',                'компл', 3500000),
  ( 9, 'MAT-009', 'Шестерня редуктора',              'шт',    450000),
  (10, 'MAT-010', 'Муфта упругая МУВП',              'шт',     65000),
  (11, 'MAT-011', 'Ремень клиновой',                 'шт',      6500),
  (12, 'MAT-012', 'Болт М20',                        'шт',       450),
  (13, 'MAT-013', 'Гайка М20',                       'шт',       150),
  (14, 'MAT-014', 'Шайба 20',                        'шт',        50),
  (15, 'MAT-015', 'Электроды УОНИ 13/55',            'кг',      2200),
  (16, 'MAT-016', 'Масло И-40А',                     'л',       1100),
  (17, 'MAT-017', 'Масло гидравлическое ВМГЗ',       'л',       1500),
  (18, 'MAT-018', 'Смазка Литол-24',                 'кг',      2500),
  (19, 'MAT-019', 'Смазка ЦИАТИМ-201',               'кг',      6000),
  (20, 'MAT-020', 'Рукав высокого давления',         'шт',     28000),
  (21, 'MAT-021', 'Кольцо уплотнительное',           'шт',       800),
  (22, 'MAT-022', 'Манжета армированная',            'шт',      3500),
  (23, 'MAT-023', 'Фильтр масляный',                 'шт',      9000),
  (24, 'MAT-024', 'Сальниковая набивка',             'кг',      7000),
  (25, 'MAT-025', 'Электродвигатель 15 кВт',         'шт',    650000),
  (26, 'MAT-026', 'Кабель КГ 3×16',                  'м',       4500),
  (27, 'MAT-027', 'Кабель ВВГ 4×4',                  'м',       1800),
  (28, 'MAT-028', 'Автоматический выключатель 63 А', 'шт',     12000),
  (29, 'MAT-029', 'Пускатель ПМЛ',                   'шт',     25000),
  (30, 'MAT-030', 'Датчик индуктивный',              'шт',     15000),
  (31, 'MAT-031', 'Концевой выключатель',            'шт',      9000),
  (32, 'MAT-032', 'Лампа светодиодная',              'шт',      6000),
  (33, 'MAT-033', 'Изолента',                        'шт',       400),
  (34, 'MAT-034', 'Предохранитель',                  'шт',       900),
  (35, 'MAT-035', 'Пневмораспределитель',            'шт',     55000),
  (36, 'MAT-036', 'Шланг пневматический',            'м',       2500),
  (37, 'MAT-037', 'Фитинг пневматический',           'шт',      1500),
  (38, 'MAT-038', 'Рукав фильтровальный',            'шт',     14000),
  (39, 'MAT-039', 'Ветошь',                          'кг',       900),
  (40, 'MAT-040', 'Герметик',                        'шт',      3500);

-- norms: hours + typical materials [{material_id, qty, qty_max}]
insert into public.work_norms (fault_code, norm_hours, typical) values
  ('М-01', 6,   '[{"material_id":7,"qty":1,"qty_max":1},{"material_id":8,"qty":1,"qty_max":1},{"material_id":12,"qty":16,"qty_max":32},{"material_id":13,"qty":16,"qty_max":32},{"material_id":14,"qty":16,"qty_max":32}]'),
  ('М-02', 3,   '[{"material_id":1,"qty":1,"qty_max":2},{"material_id":2,"qty":1,"qty_max":2},{"material_id":3,"qty":1,"qty_max":2},{"material_id":4,"qty":1,"qty_max":2},{"material_id":18,"qty":0.5,"qty_max":1}]'),
  ('М-03', 4,   '[{"material_id":5,"qty":10,"qty_max":30},{"material_id":39,"qty":1,"qty_max":2}]'),
  ('М-04', 2.5, '[{"material_id":10,"qty":1,"qty_max":1},{"material_id":12,"qty":4,"qty_max":8},{"material_id":13,"qty":4,"qty_max":8},{"material_id":14,"qty":4,"qty_max":8}]'),
  ('М-05', 5,   '[{"material_id":9,"qty":1,"qty_max":2},{"material_id":16,"qty":20,"qty_max":40},{"material_id":22,"qty":2,"qty_max":4}]'),
  ('М-06', 2,   '[{"material_id":15,"qty":3,"qty_max":6},{"material_id":12,"qty":4,"qty_max":8},{"material_id":13,"qty":4,"qty_max":8}]'),
  ('М-07', 1.5, '[{"material_id":6,"qty":2,"qty_max":4},{"material_id":18,"qty":0.3,"qty_max":0.6}]'),
  ('Э-01', 4,   '[{"material_id":25,"qty":1,"qty_max":1},{"material_id":27,"qty":5,"qty_max":10},{"material_id":33,"qty":1,"qty_max":2}]'),
  ('Э-02', 2,   '[{"material_id":26,"qty":15,"qty_max":40},{"material_id":33,"qty":2,"qty_max":4}]'),
  ('Э-03', 1,   '[{"material_id":29,"qty":1,"qty_max":1},{"material_id":28,"qty":1,"qty_max":1}]'),
  ('Э-04', 1,   '[{"material_id":30,"qty":1,"qty_max":2},{"material_id":31,"qty":1,"qty_max":2}]'),
  ('Э-05', 1.5, '[{"material_id":34,"qty":3,"qty_max":6},{"material_id":33,"qty":1,"qty_max":2}]'),
  ('Э-06', 1,   '[{"material_id":32,"qty":4,"qty_max":8},{"material_id":28,"qty":1,"qty_max":1}]'),
  ('Г-01', 1.5, '[{"material_id":21,"qty":2,"qty_max":4},{"material_id":17,"qty":3,"qty_max":6},{"material_id":20,"qty":1,"qty_max":2},{"material_id":39,"qty":1,"qty_max":2}]'),
  ('Г-02', 4,   '[{"material_id":17,"qty":20,"qty_max":40},{"material_id":23,"qty":1,"qty_max":2},{"material_id":21,"qty":4,"qty_max":8},{"material_id":22,"qty":2,"qty_max":4}]'),
  ('Г-03', 3,   '[{"material_id":22,"qty":2,"qty_max":4},{"material_id":21,"qty":4,"qty_max":8},{"material_id":17,"qty":5,"qty_max":10}]'),
  ('П-01', 1,   '[{"material_id":37,"qty":2,"qty_max":4},{"material_id":36,"qty":3,"qty_max":6},{"material_id":40,"qty":1,"qty_max":2}]'),
  ('П-02', 1.5, '[{"material_id":35,"qty":1,"qty_max":1},{"material_id":37,"qty":2,"qty_max":4}]'),
  ('С-01', 0.5, '[{"material_id":18,"qty":0.8,"qty_max":2}]'),
  ('С-02', 1.5, '[{"material_id":16,"qty":20,"qty_max":40},{"material_id":23,"qty":1,"qty_max":2}]');

insert into public.problem_templates (id, equipment_type, label, suggested_fault_code, sort) values
  ( 1, 'насос', 'Течь масла', 'Г-01', 1),
  ( 2, 'насос', 'Шум и вибрация', 'М-04', 2),
  ( 3, 'насос', 'Не создаёт давление', 'Г-02', 3),
  ( 4, 'насос', 'Перегрев подшипника', 'М-02', 4),
  ( 5, 'насос', 'Не запускается', 'Э-01', 5),
  ( 6, 'конвейер', 'Шум подшипника', 'М-02', 1),
  ( 7, 'конвейер', 'Сход ленты', 'М-04', 2),
  ( 8, 'конвейер', 'Порыв ленты', 'М-03', 3),
  ( 9, 'конвейер', 'Заклинило ролик', 'М-07', 4),
  (10, 'конвейер', 'Не запускается', 'Э-03', 5),
  (11, 'дробилка', 'Износ брони', 'М-01', 1),
  (12, 'дробилка', 'Перегрев подшипника', 'М-02', 2),
  (13, 'дробилка', 'Сильная вибрация', 'М-04', 3),
  (14, 'дробилка', 'Течь масла', 'Г-01', 4),
  (15, 'дробилка', 'Не запускается', 'Э-01', 5),
  (16, 'грохот', 'Трещина короба', 'М-06', 1),
  (17, 'грохот', 'Шум подшипника', 'М-02', 2),
  (18, 'грохот', 'Ослабло крепление', 'М-06', 3),
  (19, 'грохот', 'Сильная вибрация', 'М-04', 4),
  (20, 'экскаватор', 'Течь гидравлики', 'Г-01', 1),
  (21, 'экскаватор', 'Отказ гидроцилиндра', 'Г-03', 2),
  (22, 'экскаватор', 'Износ зубьев ковша', 'М-01', 3),
  (23, 'экскаватор', 'Не работает освещение', 'Э-06', 4),
  (24, 'экскаватор', 'Перегрев двигателя', 'Э-05', 5),
  (25, 'буровой станок', 'Течь гидравлики', 'Г-01', 1),
  (26, 'буровой станок', 'Утечка воздуха', 'П-01', 2),
  (27, 'буровой станок', 'Отказ пневмоклапана', 'П-02', 3),
  (28, 'буровой станок', 'Нет смазки', 'С-01', 4),
  (29, 'компрессор', 'Утечка воздуха', 'П-01', 1),
  (30, 'компрессор', 'Перегрев', 'Э-05', 2),
  (31, 'компрессор', 'Загрязнение масла', 'С-02', 3),
  (32, 'компрессор', 'Не запускается', 'Э-03', 4),
  (33, 'сушильный барабан', 'Износ футеровки', 'М-01', 1),
  (34, 'сушильный барабан', 'Шум подшипника', 'М-02', 2),
  (35, 'сушильный барабан', 'Вибрация привода', 'М-04', 3),
  (36, 'сушильный барабан', 'Нет смазки', 'С-01', 4),
  (37, 'вентилятор', 'Сильная вибрация', 'М-04', 1),
  (38, 'вентилятор', 'Перегрев подшипника', 'М-02', 2),
  (39, 'вентилятор', 'Отказ двигателя', 'Э-01', 3),
  (40, 'вентилятор', 'Срабатывает защита', 'Э-05', 4),
  (41, 'циклон', 'Трещина корпуса', 'М-06', 1),
  (42, 'циклон', 'Износ футеровки', 'М-01', 2),
  (43, 'циклон', 'Подсос воздуха', 'М-06', 3),
  (44, 'фильтр', 'Порыв рукава', null, 1),
  (45, 'фильтр', 'Отказ импульсной продувки', 'П-02', 2),
  (46, 'фильтр', 'Утечка сжатого воздуха', 'П-01', 3),
  (47, 'упаковочная машина', 'Не срабатывает датчик', 'Э-04', 1),
  (48, 'упаковочная машина', 'Отказ пневмоцилиндра', 'П-02', 2),
  (49, 'упаковочная машина', 'Заклинило привод', 'М-05', 3),
  (50, 'упаковочная машина', 'Утечка воздуха', 'П-01', 4),
  (51, 'кран', 'Не работает концевик', 'Э-04', 1),
  (52, 'кран', 'Шум редуктора', 'М-05', 2),
  (53, 'кран', 'Повреждение кабеля', 'Э-02', 3),
  (54, 'кран', 'Нет смазки', 'С-01', 4),
  (55, 'погрузчик', 'Течь гидравлики', 'Г-01', 1),
  (56, 'погрузчик', 'Отказ гидроцилиндра', 'Г-03', 2),
  (57, 'погрузчик', 'Не работает освещение', 'Э-06', 3),
  (58, 'погрузчик', 'Загрязнение масла', 'С-02', 4);

insert into public.brigades (id, name) values
  (1, 'Бригада 1'),
  (2, 'Бригада 2'),
  (3, 'Бригада 3');

insert into public.settings (key, value) values
  ('remind_before_min',            '30'),
  ('accept_timeout_min',           '10'),
  ('accept_timeout_emergency_min', '3'),
  ('overdue_repeat_min',           '15'),
  ('manager_overdue_min',          '60'),
  ('demo_time_scale',              '1'),
  ('demo_mode',                    'false'),
  ('ai_confidence_threshold',      '0.6'),
  ('duplicate_hamming_max',        '6');

-- ===== 2/4 · the transition engine (migration 04, part B) =====
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

-- ===== 3/4 · history generator and demo reset (migration 07) =====
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

revoke execute on all functions in schema internal from public;

-- ===== 4/4 · Telegram link token (migration 13) =====
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

revoke execute on function public.telegram_link_token() from public, anon;
grant execute on function public.telegram_link_token() to authenticated;

commit;
