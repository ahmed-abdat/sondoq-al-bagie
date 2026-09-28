#!/usr/bin/env bash
# Try a paper-sheet import on a throwaway local Postgres (never the real project) and print a
# report without names: members, payments, money, members up to date / behind, re-run check.
#   supabase/import/check-local.sh --sheet data/sheet-2026.csv [--phones …] [--page-totals …]
# Same flags as import-paper.mts. Needs Postgres 15+ tools on PATH (see tests/local/run.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PGPORT:-55434}"
DIR="$(mktemp -d /tmp/sbimp.XXXX)"
cleanup() { pg_ctl -D "$DIR/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

echo "── dry run ──"
node "$ROOT/supabase/import/import-paper.mts" "$@"
node "$ROOT/supabase/import/import-paper.mts" "$@" --sql "$DIR/import.sql" >/dev/null

initdb -D "$DIR/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DIR/data" -o "-p $PORT -k $DIR -c wal_level=logical" -l "$DIR/log" start >/dev/null
sleep 1
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -c "create database sb"
"${PSQL[@]}" -d sb -f "$ROOT/supabase/tests/local/00_supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -d sb -o /dev/null -f "$f" 2>/dev/null; done

"${PSQL[@]}" -d sb -o /dev/null -f "$DIR/import.sql"
first="$("${PSQL[@]}" -d sb -At -c "select count(*) || '/' || (select count(*) from public.payments) from public.members")"
"${PSQL[@]}" -d sb -o /dev/null -f "$DIR/import.sql"
second="$("${PSQL[@]}" -d sb -At -c "select count(*) || '/' || (select count(*) from public.payments) from public.members")"

echo
echo "── imported into a throwaway local database ──"
"${PSQL[@]}" -d sb -P footer=off -c "
select (select count(*) from public.members) as members,
       (select count(*) from public.payments where method = 'paper' and status = 'confirmed') as paper_payments,
       (select count(*) from public.payment_months) as paid_months,
       (select sum(amount) from public.payments) as total_mro,
       (select members_ok from public.fund_summary) as up_to_date,
       (select members_behind from public.fund_summary) as behind"
"${PSQL[@]}" -d sb -P footer=off -c "
select group_code as grp, count(*) as members,
       count(*) filter (where months_paid_this_year = 12) as paid_12,
       count(*) filter (where months_paid_this_year = 0) as paid_0,
       count(*) filter (where months_behind > 0) as behind
from public.member_status group by group_code order by 1"
test "$first" = "$second" && echo "re-run adds nothing: ok ($first members/payments)" || { echo "FAIL re-run changed $first → $second"; exit 1; }
