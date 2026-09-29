#!/usr/bin/env bash
# Two-person e2e flows against a LOCAL Supabase (Docker). Never the production project:
# up.sh refuses a linked project and writes only 127.0.0.1 values; the helpers check again.
#   scripts/e2e-flows.sh              reset the local data, build, run every flow
#   scripts/e2e-flows.sh --no-build   keep the data and the last flows build (iterating)
#   scripts/e2e-flows.sh -- <args>    extra Playwright args (e.g. -g "reject")
# A reset always rebuilds: public pages are prerendered from the database at build time and
# public reads are cached on disk (.next/cache/fetch-cache), so both would show the old data.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BUILD=1
if [ "${1:-}" = "--no-build" ]; then BUILD=0; shift; fi
[ "${1:-}" = "--" ] && shift

if [ "$BUILD" = 1 ]; then supabase/tests/e2e/up.sh; else supabase/tests/e2e/up.sh --no-reset; fi
set -a
# shellcheck disable=SC1091
. supabase/tests/e2e/.env.e2e
set +a
unset SONDOQ_FIXTURES
# a server left on 3420 from another build would give fake results: only ours may stay
if [ "$BUILD" = 1 ]; then
  command -v lsof >/dev/null &&
  for p in $(lsof -ti tcp:3420 -sTCP:LISTEN 2>/dev/null); do
    lsof -a -p "$p" -d cwd 2>/dev/null | grep -q "$ROOT" && kill "$p" || true
  done
  rm -rf .next/cache/fetch-cache
  pnpm build
fi
exec pnpm exec playwright test -c playwright.flows.config.ts "$@"
