#!/usr/bin/env bash
# One-off move of the production database from Supabase to Neon (2026-11). Copies the public schema — every table,
# row and the schema_migrations list — then compares row counts table by table. Connection strings come from the
# environment so they never land in shell history files or the repo:
#   read -s SRC_DATABASE_URL; export SRC_DATABASE_URL   # Supabase → Connect → Session pooler URI
#   read -s DST_DATABASE_URL; export DST_DATABASE_URL   # Neon → Connect → direct (non-pooled) connection string
#   bash apps/api/scripts/copy-to-neon.sh
# Read-only on Supabase. Refuses to run if the Neon database already has tables, so it can't mix two copies.
set -euo pipefail
: "${SRC_DATABASE_URL:?set SRC_DATABASE_URL (Supabase)}" "${DST_DATABASE_URL:?set DST_DATABASE_URL (Neon)}"
tables="select tablename from pg_tables where schemaname='public' order by 1"
if [ -n "$(psql "$DST_DATABASE_URL" -Atc "$tables")" ]; then echo "Neon already has tables in public — stopping (use a fresh database)."; exit 1; fi
dump=$(mktemp -t myfitbike-dump); list=$(mktemp -t myfitbike-list); trap 'rm -f "$dump" "$list"' EXIT
echo "Dumping Supabase (public schema)…"; pg_dump "$SRC_DATABASE_URL" --schema=public --no-owner --no-privileges --format=custom --file="$dump"
pg_restore --list "$dump" | grep -v ' SCHEMA - public ' > "$list" || true   # every new database already has "public"
echo "Restoring into Neon…"; pg_restore --dbname="$DST_DATABASE_URL" --no-owner --no-privileges --exit-on-error --use-list="$list" "$dump"
echo "Row counts (Supabase → Neon):"; bad=0
for t in $(psql "$SRC_DATABASE_URL" -Atc "$tables"); do
  a=$(psql "$SRC_DATABASE_URL" -Atc "select count(*) from public.\"$t\""); b=$(psql "$DST_DATABASE_URL" -Atc "select count(*) from public.\"$t\"")
  printf '  %-24s %8s → %-8s %s\n' "$t" "$a" "$b" "$([ "$a" = "$b" ] && echo ok || { bad=1; echo MISMATCH; })"; [ "$a" = "$b" ] || bad=1
done
[ $bad = 0 ] && echo "All tables match. Next: DATABASE_URL=\"\$DST_DATABASE_URL\" pnpm --filter @myfitbike/api migrate" || { echo "Counts differ — do not switch over."; exit 1; }
