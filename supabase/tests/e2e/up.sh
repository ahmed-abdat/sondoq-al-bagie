#!/usr/bin/env bash
# Start the LOCAL Supabase (Docker) for the two-person e2e flows, reset it to migrations + the
# fictional seeds, and write supabase/tests/e2e/.env.e2e for the app build and the helpers.
# Never touches the production project: only `--local` commands, and every value written is
# checked to point at 127.0.0.1.
#   supabase/tests/e2e/up.sh            start (if needed) + reset + env
#   supabase/tests/e2e/up.sh --no-reset start + env (keep the data)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HERE="$ROOT/supabase/tests/e2e"
OUT="$HERE/.env.e2e"
PROD_REF="vhcdgxgwdlflmxmqnxzf"
cd "$ROOT"

die() { echo "e2e-db: $*" >&2; exit 1; }

docker ps >/dev/null 2>&1 || die "Docker is not running (start OrbStack / Docker Desktop)."
grep -q '^project_id = "sondoq-e2e"' supabase/config.toml || die "supabase/config.toml is not the e2e config."
# A linked project would let a stray command reach production; the e2e never needs one.
[ ! -e supabase/.temp/project-ref ] || die "supabase/.temp/project-ref exists (a linked project); remove it first."

if ! supabase status >/dev/null 2>&1; then
  echo "e2e-db: starting local Supabase (first run pulls images)…"
  supabase start
fi
if [ "${1:-}" != "--no-reset" ]; then
  echo "e2e-db: resetting local database (migrations + seed.sql + seed-e2e.sql)…"
  supabase db reset --local
fi

STATUS="$(supabase status -o env)"
val() { printf '%s\n' "$STATUS" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" | head -1; }
API_URL="$(val API_URL)"
DB_URL="$(val DB_URL)"
PUB_KEY="$(val PUBLISHABLE_KEY)"; [ -n "$PUB_KEY" ] || PUB_KEY="$(val ANON_KEY)"
SECRET="$(val SECRET_KEY)"; [ -n "$SECRET" ] || SECRET="$(val SERVICE_ROLE_KEY)"

case "$API_URL" in http://127.0.0.1:55321) ;; *) die "unexpected API_URL '$API_URL'";; esac
case "$DB_URL" in postgresql://*@127.0.0.1:55322/*) ;; *) die "unexpected DB_URL";; esac
[ -n "$PUB_KEY" ] && [ -n "$SECRET" ] || die "keys missing from supabase status"
case "$API_URL$DB_URL$PUB_KEY$SECRET" in *"$PROD_REF"*|*supabase.co*) die "production value in local status";; esac

umask 077
cat >"$OUT" <<EOF
# Written by supabase/tests/e2e/up.sh — LOCAL Supabase only (gitignored). Do not edit.
SONDOQ_E2E=1
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUB_KEY
SUPABASE_SECRET_KEY=$SECRET
NEXT_PUBLIC_SITE_URL=http://localhost:3420
E2E_DB_URL=$DB_URL
EOF
echo "e2e-db: ready → $OUT (API $API_URL)"
