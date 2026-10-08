-- Rota · schema (CLAUDE.md §5)
-- Names match packages/shared/src/domain/enums.ts.

create schema if not exists internal;
revoke all on schema internal from public;

-- enums
create type public.role_t       as enum ('master','worker','manager','admin');
create type public.order_type_t as enum ('planned','unplanned');
create type public.priority_t   as enum ('emergency','high','normal','planned');
create type public.status_t     as enum ('issued','accepted','queued','rejected','in_progress','paused',
                                         'done','ai_review','rework','closed','cancelled');
create type public.photo_kind_t as enum ('before','after');
create type public.verdict_t    as enum ('accepted','accepted_with_remarks','rework');
create type public.reject_t     as enum ('no_materials','no_permit','busy_emergency','equipment_running','other');
create type public.pause_t      as enum ('waiting_parts','waiting_stop','waiting_permit','other');

-- directories
create table public.areas (
  id    smallint primary key,
  code  text not null unique,
  name  text not null,
  sort  int  not null default 0
);

create table public.equipment (
  id           int primary key,
  area_id      smallint not null references public.areas,
  name         text not null,
  inventory_no text unique,
  type         text not null,
  criticality  char(1) not null check (criticality in ('A','B','C')),
  qr_token     text unique,
  is_stopped   boolean not null default false
);
create index equipment_area_idx on public.equipment (area_id);

create table public.brigades (
  id        smallint primary key,
  name      text not null,
  leader_id uuid null
);

create table public.employees (
  id               uuid primary key references auth.users on delete cascade,
  tab_no           text not null unique,
  full_name        text not null,
  short_name       text not null,
  pseudonym        text not null unique,
  role             public.role_t not null,
  specialty        text null,
  grade            smallint null,
  brigade_id       smallint null references public.brigades,
  shift            text null check (shift in ('day','night')),
  on_shift         boolean not null default false,
  telegram_chat_id bigint null,
  created_at       timestamptz not null default now()
);
create index employees_brigade_idx on public.employees (brigade_id);
create index employees_role_idx on public.employees (role);

alter table public.brigades
  add constraint brigades_leader_fk foreign key (leader_id) references public.employees on delete set null;
create index brigades_leader_idx on public.brigades (leader_id);

create table public.fault_codes (
  code      text primary key,
  grp       char(1) not null check (grp in ('М','Э','Г','П','С')),
  name      text not null,
  specialty text not null
);

create table public.materials (
  id            int primary key,
  sku           text not null unique,
  name          text not null,
  unit          text not null,
  unit_cost_kzt numeric not null default 0
);

-- the only place norms live; typical = [{material_id, qty, qty_max}]
create table public.work_norms (
  fault_code text primary key references public.fault_codes,
  norm_hours numeric not null check (norm_hours > 0),
  typical    jsonb not null default '[]'
);

create table public.equipment_type_specialty (
  type             text primary key,
  specialty        text not null,
  label_plural_dat text null           -- «насосам», for reasons like «12 нарядов по насосам»
);

-- description chips per equipment type
create table public.problem_templates (
  id                   int primary key,
  equipment_type       text not null,
  label                text not null,
  suggested_fault_code text null references public.fault_codes,
  sort                 int not null default 0
);
create index problem_templates_type_idx on public.problem_templates (equipment_type, sort);
create index problem_templates_code_idx on public.problem_templates (suggested_fault_code);

create table public.settings (
  key   text primary key,
  value jsonb not null
);

-- core
create sequence public.order_number_seq start 101;

create table public.orders (
  id                   bigint generated always as identity primary key,
  number               int not null unique default nextval('public.order_number_seq'),
  client_ref           uuid not null unique,              -- draft id used for photo paths
  type                 public.order_type_t not null,
  priority             public.priority_t not null,
  description          text not null,
  comment              text null,
  area_id              smallint not null references public.areas,
  equipment_id         int not null references public.equipment,
  assignee_id          uuid not null references public.employees,  -- brigade order: the leader
  brigade_id           smallint null references public.brigades,
  master_id            uuid not null references public.employees,
  status               public.status_t not null default 'issued',
  due_at               timestamptz not null,
  norm_hours           numeric null,
  equipment_stopped    boolean not null default false,
  suggested_fault_code text null references public.fault_codes,
  queue_position       int null,
  works_done           text null,
  fault_code           text null references public.fault_codes,
  closing_comment      text null,
  created_at           timestamptz not null default now(),
  issued_at            timestamptz not null default now(),
  accepted_at          timestamptz null,
  queued_at            timestamptz null,
  rejected_at          timestamptz null,
  started_at           timestamptz null,
  done_at              timestamptz null,
  closed_at            timestamptz null,
  cancelled_at         timestamptz null,
  paused_since         timestamptz null,
  paused_total_sec     int not null default 0,
  last_comment         text null,
  rework_count         int not null default 0,
  ai_review_id         bigint null,
  final_verdict        public.verdict_t null,
  final_score          int null check (final_score between 0 and 100),
  repeat_of_order_id   bigint null references public.orders on delete set null,
  is_demo              boolean not null default false
);
alter sequence public.order_number_seq owned by public.orders.number;

create index orders_status_idx            on public.orders (status);
create index orders_assignee_status_idx   on public.orders (assignee_id, status);
create index orders_equipment_created_idx on public.orders (equipment_id, created_at);
create index orders_due_active_idx        on public.orders (due_at)
  where status in ('issued','accepted','queued','in_progress','paused','rework');
create index orders_master_idx            on public.orders (master_id);
create index orders_area_idx              on public.orders (area_id);
create index orders_brigade_idx           on public.orders (brigade_id);
create index orders_fault_code_idx        on public.orders (fault_code);
create index orders_suggested_code_idx    on public.orders (suggested_fault_code);
create index orders_repeat_idx            on public.orders (repeat_of_order_id);
create index orders_review_idx            on public.orders (ai_review_id);
create index orders_closed_at_idx         on public.orders (closed_at) where closed_at is not null;
create index orders_created_at_idx        on public.orders (created_at);
create index orders_demo_idx              on public.orders (is_demo) where is_demo;

create table public.order_events (
  id               bigint generated always as identity primary key,
  order_id         bigint not null references public.orders on delete cascade,
  actor_id         uuid null references public.employees on delete set null,   -- null = system or AI
  action           text not null,
  from_status      public.status_t null,
  to_status        public.status_t null,
  reason           text null,
  comment          text null,
  payload          jsonb not null default '{}',
  client_action_id uuid null unique,
  created_at       timestamptz not null default now()
);
create index order_events_order_idx  on public.order_events (order_id, created_at);
create index order_events_actor_idx  on public.order_events (actor_id, action);
create index order_events_action_idx on public.order_events (action, created_at);

create table public.order_photos (
  id           bigint generated always as identity primary key,
  order_id     bigint null references public.orders on delete cascade,
  client_ref   uuid not null,
  kind         public.photo_kind_t not null,
  storage_path text not null,
  author_id    uuid null references public.employees on delete set null,
  source       text not null check (source in ('camera','gallery')),
  captured_at  timestamptz null,
  uploaded_at  timestamptz not null default now(),
  dhash        char(16) null,
  sha256       char(64) null,
  width        int null,
  height       int null,
  bytes        int null,
  exif         jsonb null
);
create unique index order_photos_path_key on public.order_photos (storage_path);
create index order_photos_order_idx      on public.order_photos (order_id);
create index order_photos_client_ref_idx on public.order_photos (client_ref);
create index order_photos_dhash_idx      on public.order_photos (dhash);
create index order_photos_author_idx     on public.order_photos (author_id);

create table public.order_materials (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references public.orders on delete cascade,
  material_id int not null references public.materials,
  qty         numeric not null check (qty > 0)
);
create index order_materials_order_idx    on public.order_materials (order_id);
create index order_materials_material_idx on public.order_materials (material_id);

create table public.ai_reviews (
  id                  bigint generated always as identity primary key,
  order_id            bigint not null references public.orders on delete cascade,
  attempt             int not null,
  verdict             public.verdict_t not null,
  score               int not null check (score between 0 and 100),
  score5              smallint not null check (score5 between 1 and 5),
  confidence          numeric null,
  needs_master_review boolean not null default false,
  checks              jsonb not null default '[]',
  photo               jsonb null,
  feedback_worker     jsonb null,
  report_master       jsonb null,
  model               text null,
  latency_ms          int null,
  created_at          timestamptz not null default now(),
  master_verdict      public.verdict_t null,
  master_score        int null check (master_score between 0 and 100),
  master_comment      text null,
  master_id           uuid null references public.employees on delete set null,
  master_decided_at   timestamptz null,
  unique (order_id, attempt)
);
create index ai_reviews_master_idx on public.ai_reviews (master_id);

alter table public.orders
  add constraint orders_ai_review_fk foreign key (ai_review_id) references public.ai_reviews on delete set null;

-- infrastructure
create table public.notifications (
  id           bigint generated always as identity primary key,
  recipient_id uuid not null references public.employees on delete cascade,
  order_id     bigint null references public.orders on delete cascade,
  kind         text not null,
  severity     text not null default 'info' check (severity in ('info','warning','critical')),
  title        text not null,
  body         text not null,
  url          text null,
  dedupe_key   text not null,
  created_at   timestamptz not null default now(),
  read_at      timestamptz null,
  push_sent_at timestamptz null,
  tg_sent_at   timestamptz null,
  unique (recipient_id, dedupe_key)             -- one key may go to several people
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_order_idx     on public.notifications (order_id);

create table public.push_tokens (
  id           bigint generated always as identity primary key,
  employee_id  uuid not null references public.employees on delete cascade,
  expo_token   text not null unique,
  platform     text null check (platform in ('ios','android','web')),
  device_name  text null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz null
);
create index push_tokens_employee_idx on public.push_tokens (employee_id);

create table public.ai_insights (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  scope          jsonb not null default '{}',
  kind           text not null,
  severity       text null,
  title          text null,
  body           text null,
  recommendation text null,
  evidence       jsonb null
);
create index ai_insights_kind_idx on public.ai_insights (kind, created_at desc);

create table public.llm_audit (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  purpose           text not null,
  model             text null,
  request_redacted  jsonb null,
  response_redacted jsonb null,
  latency_ms        int null,
  cost_usd          numeric null
);
create index llm_audit_created_idx on public.llm_audit (created_at desc);

create table public.integration_outbox (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  topic      text not null,
  payload    jsonb not null,
  sent_at    timestamptz null
);
create index integration_outbox_pending_idx on public.integration_outbox (created_at) where sent_at is null;

create table public.tg_link_tokens (
  token       text primary key,
  employee_id uuid not null references public.employees on delete cascade,
  expires_at  timestamptz not null
);
create index tg_link_tokens_employee_idx on public.tg_link_tokens (employee_id);
