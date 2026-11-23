-- Sign-in moved from Supabase Auth (uuid user ids) to Firebase Auth (28-character string ids). Existing uuids stay until
-- each rider's first Firebase sign-in re-links the profile by verified e-mail (auth.ts).
alter table profile alter column auth_user_id type text;
