create extension if not exists pgcrypto;

create table if not exists public.instances (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null default 'uazapi',
  external_id text,
  phone text,
  status text not null default 'disconnected' check (status in ('disconnected','connecting','connected','hibernated','error')),
  base_url text,
  webhook_enabled boolean not null default false,
  instance_role text not null default 'sender' check (instance_role in ('monitor','sender')),
  api_token text,
  system_name text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists instances_external_id_uidx on public.instances(external_id) where external_id is not null;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.instances(id) on delete cascade,
  external_id text not null,
  name text,
  subject text,
  monitoring_enabled boolean not null default false,
  member_count integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(instance_id, external_id)
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references public.instances(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  external_participant_id text not null,
  phone text,
  lid text,
  name text,
  source text not null default 'group_join',
  source_group_external_id text,
  dedupe_key text,
  capture_count integer not null default 1,
  consent_status text not null default 'unknown' check (consent_status in ('unknown','opted_in','opted_out','manual_authorized')),
  status text not null default 'captured' check (status in ('captured','queued','processed','suppressed','error')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists leads_dedupe_key_unique on public.leads(dedupe_key) where dedupe_key is not null;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft','active','paused','completed','archived')),
  text_content text,
  media_url text,
  media_type text not null default 'none' check (media_type in ('none','image','video','audio','ptt','document','sticker')),
  footer_text text,
  buttons jsonb not null default '[]'::jsonb,
  target_rule jsonb not null default '{}'::jsonb,
  require_consent boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_automations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique references public.groups(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  sender_instance_id uuid not null references public.instances(id) on delete cascade,
  active boolean not null default false,
  authorization_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  instance_id uuid references public.instances(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  automation_id uuid references public.group_automations(id) on delete set null,
  recipient text,
  dedupe_key text,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','paused','cancelled','blocked')),
  attempts integer not null default 0,
  scheduled_at timestamptz,
  processed_at timestamptz,
  error_message text,
  provider_message_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists jobs_dedupe_key_unique on public.jobs(dedupe_key) where dedupe_key is not null;
create index if not exists jobs_status_created_idx on public.jobs(status, created_at);

create table if not exists public.webhook_events (
  id bigint generated always as identity primary key,
  instance_id uuid references public.instances(id) on delete set null,
  provider text not null default 'uazapi',
  event_type text,
  external_event_id text,
  group_external_id text,
  participant_external_id text,
  phone text,
  lid text,
  payload jsonb not null,
  processed boolean not null default false,
  processing_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  phone text,
  lid text,
  reason text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  constraint suppression_identity_check check (phone is not null or lid is not null)
);

alter table public.instances enable row level security;
alter table public.groups enable row level security;
alter table public.leads enable row level security;
alter table public.campaigns enable row level security;
alter table public.group_automations enable row level security;
alter table public.jobs enable row level security;
alter table public.webhook_events enable row level security;
alter table public.suppression_list enable row level security;
