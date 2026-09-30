#!/usr/bin/env bash
# Accuracy audit (app_private.accuracy_audit(), m35) on the LOCAL e2e database, after the flows
# have written real payments, cancellations, levies and expenses through the app. Read-only.
# Fails (exit 1) when any check is not ok, printing each check. Never touches production: it only
# talks to the local container of project sondoq-e2e.
#   supabase/tests/e2e/audit.sh
set -euo pipefail
DB="supabase_db_sondoq-e2e"
die() { echo "e2e-audit: $*" >&2; exit 1; }
docker ps --format '{{.Names}}' | grep -qx "$DB" || die "container $DB is not running (supabase/tests/e2e/up.sh)."
out="$(docker exec -i "$DB" psql -U postgres -d postgres -X -At -F ' | ' -v ON_ERROR_STOP=1 \
  -c "select case when ok then 'ok  ' else 'FAIL' end, check_name, detail from app_private.accuracy_audit() order by ok, check_name")"
printf '%s\n' "$out"
n="$(printf '%s\n' "$out" | grep -c . || true)"
[ "$n" -ge 29 ] || die "expected 29 checks, got $n"
if printf '%s\n' "$out" | grep -q '^FAIL'; then die "some numbers do not add up (see FAIL rows)"; fi
echo "e2e-audit: all $n checks ok"
