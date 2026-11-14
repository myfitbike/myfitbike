-- Phase 1 schema (plan section 8). Single local profile, but profile_id on every table so login can be added later.
create table profile (
  id              serial primary key,
  name            text not null,
  weight_kg       numeric(5,1) not null check (weight_kg between 30 and 250),
  bike_weight_kg  numeric(4,1) not null default 8.5 check (bike_weight_kg between 3 and 40),
  ftp_w           integer check (ftp_w between 50 and 700),
  max_hr          integer check (max_hr between 100 and 230),
  resting_hr      integer check (resting_hr between 25 and 120),
  units           text not null default 'metric' check (units = 'metric'),
  avatar          jsonb not null default '{}'::jsonb,
  setup_complete  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table zone_set (
  id          serial primary key,
  profile_id  integer not null references profile(id) on delete cascade,
  kind        text not null check (kind in ('power', 'hr')),
  bounds      jsonb not null,
  unique (profile_id, kind)
);

create table device (
  id          serial primary key,
  profile_id  integer not null references profile(id) on delete cascade,
  ble_name    text not null,
  ble_id      text,
  kind        text not null check (kind in ('trainer', 'power', 'cadence', 'heartRate', 'speed')),
  last_seen   timestamptz not null default now(),
  settings    jsonb not null default '{}'::jsonb,
  unique (profile_id, kind, ble_name)
);

create table settings (
  profile_id  integer not null references profile(id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  primary key (profile_id, key)
);
