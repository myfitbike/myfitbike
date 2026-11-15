-- Accounts (PLAN 17.2): each Supabase user owns one profile. Local single-rider installs keep working (auth_user_id
-- stays null until the first local sign-in claims the profile).
alter table profile add column auth_user_id uuid unique, add column email text;
-- Workout ids come from the browser (import hash / custom-<time>); two riders may produce the same id, so they are
-- unique per rider, not globally.
alter table workout drop constraint workout_pkey, add primary key (profile_id, id);
-- Finished rides' one-second samples as one gzipped JSON document (PLAN 17.3). Production keeps these files in R2;
-- this table is the local / fallback store. ride_sample then holds only rides still being recorded.
create table ride_archive (
  ride_id    bigint primary key references ride(id) on delete cascade,
  n          integer not null,
  samples_gz bytea not null
);
