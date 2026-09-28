# Database (Supabase)

`migrations/` is the whole schema (M1). Money is integer MRO. Arrears and totals are computed in
views, never stored. Nothing is hard-deleted: payments/expenses/periods are cancelled with a reason,
and every change lands in `audit_log`.

| File | What |
|---|---|
| `*_m1_schema.sql` | tables, enums, indexes, `settings` row |
| `*_m1_guards.sql` | role helpers, append-only triggers, payment state machine, allocation checks, audit |
| `*_m1_views.sql` | public views (`member_status`, `member_months`, `fund_summary`, `monthly_collection`, `expense_totals`, `recent_expenses`, `campaign_progress`, `activity_feed`) and committee `arrears` |
| `*_m1_rls.sql` | grants, RLS, private `proofs` bucket, realtime on `payments` |
| `*_m1_rpc.sql` | write RPCs: `record_payment`, `confirm_payment`, `reject_payment`, `cancel_payment`, `record_expense`, `cancel_expense`, `log_reminder`, admin: `add_member`, `update_member`, `change_member_status`, `set_group_price`, `set_committee_member`, `update_settings` |
| `*_m1_groups.sql` | groups A (1000) and B (500) with 2026 prices |

Access: `anon` reads only the public views (no phones, no proofs, no base tables). An active row in
`committee` reads everything through RLS. Nobody writes tables directly; all writes go through the
RPCs, which return errors as SQLSTATE `P0001` with a stable `HINT` code (e.g. `month_already_paid`,
`own_membership`, `not_confirmer`) for the app to translate.

## Test locally (no Docker)

```sh
supabase/tests/local/run.sh
```

Needs `initdb`/`pg_ctl`/`psql` (Postgres 15+; on macOS `brew install postgresql@16`). It starts a
throwaway Postgres, loads a tiny Supabase stand-in (`tests/local/00_supabase_shim.sql`), applies the
migrations and `seed.sql`, runs `tests/*.sql` (one rolled-back transaction), runs a two-session race
check, then rolls back (`rollback/m1_down.sql`) and re-applies. Prints `OK` at the end.

## Apply to Supabase

```sh
supabase link --project-ref vhcdgxgwdlflmxmqnxzf
supabase db push            # applies migrations/ in order
```

Or paste each migration, in order, into the SQL editor. **Never** run `seed.sql` (fictional members)
or `tests/local/*` against the real project.

## First admin

Public sign-up is off. Create the account in Dashboard → Authentication → Users, then in the SQL
editor (runs as the server, so it is allowed):

```sql
select public.set_committee_member('<auth user id>', 'AHMED', 'admin');
```

After that the admin adds members, prices and committee roles from the app.

## Types

After a schema change regenerate `src/lib/supabase/database.types.ts`
(`supabase gen types typescript --project-id vhcdgxgwdlflmxmqnxzf > src/lib/supabase/database.types.ts`).

## Remote state

Applied to project `vhcdgxgwdlflmxmqnxzf` on 2026-09-28 through the Supabase MCP. The file names
match the remote migration versions, so `supabase db push` sees them as already applied.
No seed data was applied remotely: only the groups and 2026 prices (`*_m1_groups.sql`).
