-- Phase 6 (optional real-road mode): routes imported from GPX / TCX / FIT. `world` is the prepared one-road world
-- (projection origin, 20 m control points with DEM elevation, climbs); the profile is rebuilt from it deterministically.
create table real_route (
  id          bigserial primary key,
  profile_id  integer not null references profile(id) on delete cascade,
  name        text not null,
  file_name   text not null,
  length_m    integer not null,
  ascent_m    integer not null,
  world       jsonb not null,
  created_at  timestamptz not null default now()
);
create index real_route_profile on real_route(profile_id, created_at desc);
