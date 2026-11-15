-- Supabase publishes every table in the public schema through its Data API, which anyone holding the (public)
-- publishable key can call. The app never uses that API — all access goes through our own API as the table owner,
-- which RLS does not restrict — so switch RLS on with no policies: the Data API then sees no rows. Harmless on a
-- plain local Postgres. Re-run for tables added later (this loop covers every table that exists now).
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
