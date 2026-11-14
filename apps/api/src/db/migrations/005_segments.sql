-- Phase 3: segment efforts (personal bests on sprint and climb segments), computed when a route ride is saved.
create table segment_effort (
  ride_id     bigint not null references ride(id) on delete cascade,
  segment_id  text not null,
  elapsed_s   real not null,
  avg_power_w integer,
  started_at  timestamptz not null,
  primary key (ride_id, segment_id, started_at)
);
create index segment_effort_seg on segment_effort(segment_id, elapsed_s);
