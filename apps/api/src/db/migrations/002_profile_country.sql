-- PLAN 16.17: rider's country (ISO 3166-1 alpha-2) for painted flags and the avatar.
alter table profile add column country text check (country ~ '^[A-Z]{2}$');
