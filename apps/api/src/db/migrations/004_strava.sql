-- Strava (plan 8.1): opt-in. Tokens are stored encrypted (AES-256-GCM, key in .env).
create table strava_account (
  profile_id        integer primary key references profile(id) on delete cascade,
  athlete_id        bigint not null,
  athlete_name      text not null default '',
  athlete_photo     text,
  access_token_enc  text not null,
  refresh_token_enc text not null,
  expires_at        timestamptz not null,
  scope             text not null default '',
  auto_upload       text not null default 'ask' check (auto_upload in ('ask', 'auto', 'never')),
  name_template     text not null default '{name} — VeloWorld',
  include_hr        boolean not null default true,
  connected_at      timestamptz not null default now()
);
create table strava_upload (
  ride_id            bigint primary key references ride(id) on delete cascade,
  status             text not null check (status in ('queued', 'uploading', 'done', 'failed')),
  strava_upload_id   bigint,
  strava_activity_id bigint,
  attempts           integer not null default 0,
  last_error         text,
  next_attempt_at    timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
