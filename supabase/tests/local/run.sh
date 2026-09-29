#!/usr/bin/env bash
# Check the migrations + tests on a throwaway local Postgres (no Docker, no Supabase).
#   supabase/tests/local/run.sh            (PGPORT defaults to 55433)
# Needs initdb / pg_ctl / psql (Postgres 15+) with pgcrypto and btree_gist available.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# Migration file versions must be the ones production recorded (supabase db push treats them as
# applied): no placeholder/future version, no duplicate. Before applying a new one, test it as
# 29990101000000_mNN_x.sql with ALLOW_PLACEHOLDER=1, then rename it (see supabase/README.md).
now=$(date -u +%Y%m%d%H%M%S); max=$(( now + 1000000 ))   # about one day ahead
versions=""
for f in "$ROOT"/supabase/migrations/*.sql; do
  v=$(basename "$f" | cut -d_ -f1)
  if [ "$v" -gt "$max" ] && [ "${ALLOW_PLACEHOLDER:-}" != 1 ]; then
    echo "FAIL placeholder/future migration version: $(basename "$f") (rename it to the version the remote recorded)"; exit 1
  fi
  case " $versions " in *" $v "*) echo "FAIL two migrations share version $v"; exit 1;; esac
  versions="$versions $v"
done

PORT="${PGPORT:-55433}"
DIR="$(mktemp -d /tmp/sbpg.XXXX)"
cleanup() { pg_ctl -D "$DIR/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
initdb -D "$DIR/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DIR/data" -o "-p $PORT -k $DIR -c wal_level=logical" -l "$DIR/log" start >/dev/null
sleep 1
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -c "create database sb"
"${PSQL[@]}" -d sb -f "$ROOT/supabase/tests/local/00_supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate  $(basename "$f")"
  "${PSQL[@]}" -d sb -f "$f"
done
for f in "$ROOT"/supabase/tests/*.sql; do
  echo "test     $(basename "$f")"
  "${PSQL[@]}" -d sb -o /dev/null -f "$f" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
  test "${PIPESTATUS[0]}" -eq 0
done
echo "safeupd  no UPDATE/DELETE without WHERE in functions"
"${PSQL[@]}" -d sb -At -c "select json_build_object('name', n.nspname || '.' || p.proname, 'src', p.prosrc)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'app_private')" \
  | node "$ROOT/supabase/tests/local/unbounded-writes.mjs"
echo "seed     seed.sql"
"${PSQL[@]}" -d sb -o /dev/null -f "$ROOT/supabase/seed.sql"
got="$("${PSQL[@]}" -d sb -At -c "select concat_ws(' ', (select count(*) from public.members),
  (select count(*) from public.member_status where months_paid_this_year = 12),
  (select count(*) from public.member_status where months_paid_this_year = 0),
  (select count(*) from public.payments where status = 'pending'),
  (select count(*) from public.payments where receipt_code is not null) > 0,
  (select balance > 0 from public.fund_summary))")"
set -- $got
test "$1" = 91 && test "$2" -ge 32 && test "$2" -le 50 && test "$3" -ge 27 && test "$3" -le 46 && test "$4" = 2 \
  && test "$5" = t && test "$6" = t || { echo "FAIL seed shape: $got"; exit 1; }
echo "  ok  91 members (A 1–21, B 1–70): $2 paid the year, $3 paid nothing, 2 pending, receipts issued"
echo "race     concurrent confirmations"
"${PSQL[@]}" -d sb -o /dev/null -f "$ROOT/supabase/tests/local/race.sql"
as_user() {  # $1 = user id, $2 = payment id, $3 = seconds to hold the transaction open
  "${PSQL[@]}" -d sb -At -c "begin; set local role authenticated;
    select 1 where set_config('request.jwt.claims', '{\"sub\":\"$1\",\"role\":\"authenticated\"}', true) is null;
    select public.confirm_payment('$2') ->> 'already'; select pg_sleep($3); commit;" 2>&1 | grep -v "^$" | head -1 || true
}
T=00000000-0000-0000-0000-0000000000b1; D=00000000-0000-0000-0000-0000000000b2
as_user $T 00000000-0000-0000-0000-0000000000f1 1 > "$DIR/a" & sleep 0.3
as_user $D 00000000-0000-0000-0000-0000000000f1 0 > "$DIR/b"; wait
grep -qx false "$DIR/a" && grep -qx true "$DIR/b" || { echo "FAIL double confirm: $(cat "$DIR/a") / $(cat "$DIR/b")"; exit 1; }
echo "  ok  same payment confirmed twice at once: first wins, second is a no-op"
as_user $T 00000000-0000-0000-0000-0000000000f2 1 > "$DIR/a" & sleep 0.3
as_user $D 00000000-0000-0000-0000-0000000000f3 0 > "$DIR/b"; wait
grep -qx false "$DIR/a" && grep -q month_already_paid "$DIR/b" || { echo "FAIL same month: $(cat "$DIR/a") / $(cat "$DIR/b")"; exit 1; }
test "$("${PSQL[@]}" -d sb -Atc "select count(*) from public.payment_months where member_id = (select id from public.members where number = 1902)")" = 1
echo "  ok  two payments for one month at once: one month row, the other refused"
for f in $(ls -r "$ROOT"/supabase/rollback/*_down.sql); do
  echo "rollback $(basename "$f")"
  "${PSQL[@]}" -d sb -f "$f"
done
"${PSQL[@]}" -d sb -Atc "select 'm1 tables left: ' || count(*) from pg_tables where schemaname = 'public'"
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -d sb -f "$f"
done
echo "re-apply after rollback: ok"
echo "import   paper sheet (sample)"
node --test "$ROOT/supabase/import/import-paper.test.mts" 2>&1 | grep -E "^. (pass|fail) [0-9]+$" | sed "s/^. /  /"
test "${PIPESTATUS[0]}" -eq 0
S="$ROOT/supabase/import/sample"
node "$ROOT/supabase/import/import-paper.mts" --sheet "$S/sheet.csv" --phones "$S/phones.csv" \
  --page-totals "$S/page_totals.csv" --sql "$DIR/import.sql" >/dev/null
"${PSQL[@]}" -d sb -o /dev/null -f "$DIR/import.sql"
"${PSQL[@]}" -d sb -o /dev/null -f "$DIR/import.sql"   # a second run must add nothing
got="$("${PSQL[@]}" -d sb -At -c "select concat_ws(' ',
  (select count(*) from public.members), (select count(*) from public.payments where method = 'paper' and status = 'confirmed'),
  (select sum(amount) from public.payments), (select count(*) from public.payment_months),
  (select count(*) from public.members where phone is not null))")"
test "$got" = "8 7 39000 43 3" || { echo "FAIL import counts: $got"; exit 1; }
echo "  ok  8 members, 7 confirmed paper payments, 39000 MRO, 43 paid months; re-run adds nothing"
echo "OK"
