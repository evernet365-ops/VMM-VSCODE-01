create extension if not exists pgcrypto;

create table if not exists site (
  id text primary key,
  name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists nvr (
  id text primary key,
  site_id text not null references site(id) on delete cascade,
  name text not null,
  status text not null default 'online',
  created_at timestamptz not null default now()
);

create table if not exists camera (
  id text primary key,
  site_id text not null references site(id) on delete cascade,
  nvr_id text not null references nvr(id) on delete cascade,
  name text not null,
  status text not null default 'online',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists ai_event (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references site(id) on delete cascade,
  camera_id text not null references camera(id) on delete cascade,
  event_type text not null,
  severity text not null check (severity in ('normal', 'suspect', 'critical')),
  score numeric(5, 4) not null check (score >= 0 and score <= 1),
  ts_event timestamptz not null,
  dedup_key text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (site_id, dedup_key)
);

create table if not exists ai_artifact (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references ai_event(id) on delete cascade,
  type text not null,
  storage_path text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists notification_log (
  id bigserial primary key,
  site_id text not null references site(id) on delete cascade,
  channel text not null,
  severity text not null check (severity in ('normal', 'suspect', 'critical')),
  status text not null check (status in ('sent', 'failed', 'skipped')),
  target text not null,
  payload jsonb not null,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists poll_state (
  site_id text not null references site(id) on delete cascade,
  component text not null,
  severity text not null check (severity in ('normal', 'suspect', 'critical')),
  next_poll_at timestamptz not null,
  last_latency_ms integer not null default 0,
  consecutive_failures integer not null default 0,
  load_shed_mode boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (site_id, component)
);

create table if not exists circuit_breaker_state (
  site_id text not null references site(id) on delete cascade,
  target_service text not null,
  state text not null check (state in ('closed', 'open', 'half_open')),
  failure_count integer not null default 0,
  last_failure_at timestamptz,
  last_latency_ms integer not null default 0,
  opened_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (site_id, target_service)
);
