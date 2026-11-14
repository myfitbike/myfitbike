-- Phase 2: rides, per-second samples, best efforts, custom/imported workouts (plan section 8).
create table workout (
  id           text primary key,
  profile_id   integer not null references profile(id) on delete cascade,
  source       text not null check (source in ('import', 'custom')),
  name         text not null,
  category     text not null,
  duration_s   integer not null,
  tss_estimate integer,
  steps        jsonb not null,
  description  text not null default '',
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now()
);

create table ride (
  id          bigserial primary key,
  profile_id  integer not null references profile(id) on delete cascade,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  mode        text not null,
  route_id    text,
  workout_id  text,
  name        text not null,
  status      text not null default 'recording' check (status in ('recording', 'done', 'discarded')),
  simulator   boolean not null default false,
  summary     jsonb,
  created_at  timestamptz not null default now()
);
create index ride_profile_started on ride(profile_id, started_at desc);

create table ride_sample (
  ride_id    bigint not null references ride(id) on delete cascade,
  t_s        integer not null,
  power_w    smallint, cadence smallint, hr smallint,
  speed_mps  real, distance_m real, lat double precision, lon double precision, alt_m real,
  grade_pct  real, target_w smallint, step_idx smallint,
  primary key (ride_id, t_s)
);

create table best_effort (
  ride_id    bigint not null references ride(id) on delete cascade,
  duration_s integer not null,
  power_w    integer not null,
  primary key (ride_id, duration_s)
);
