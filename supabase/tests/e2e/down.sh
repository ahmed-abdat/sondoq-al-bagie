#!/usr/bin/env bash
# Stop the local e2e Supabase (Docker). Data volumes are kept; up.sh resets them anyway.
set -euo pipefail
cd "$(dirname "$0")/../../.."
grep -q '^project_id = "sondoq-e2e"' supabase/config.toml || { echo "not the e2e config" >&2; exit 1; }
supabase stop
