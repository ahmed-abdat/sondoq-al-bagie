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
| `*_m1_keepalive.sql` | `keepalive` view for the free-tier cron: `GET /rest/v1/keepalive?select=ok` with the publishable key |
| `*_m2_methods.sql` | wallet methods click, bim, amanty, bamis |
| `*_m2_accounts.sql` | `fund_accounts` (+ public `fund_accounts_public`), `settings.whatsapp_contact` (+ public `fund_info`), committee `payment_queue`, `undo_payment`, admin `add_fund_account` / `update_fund_account`, `update_settings(… p_whatsapp_contact)`; activity feed shows confirmed payments only |
| `*_m2_receipts.sql` | receipt number (gapless per year) + code `BQ-XXXX-NNNN` stamped by `confirm_payment` (not for paper); public RPC `verify_receipt(code)`; public `campaign_contributions`; `activity_feed` gains payment id/amount/method/receipt code; `payment_queue` gains receipt code/number |
| `*_m5_backups.sql` | private `backups` bucket for the weekly JSON export (service role only) |
| `*_m6_campaigns.sql` | `create_campaign` / `update_campaign` / `close_campaign` (admin, treasurer, deputy; surplus to the fund as a transfer) |
| `*_m6_group_prices.sql` | public `group_prices_public` (year, group, monthly fee) |

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
migrations, runs `tests/*.sql` (one rolled-back transaction), loads `seed.sql` (91 fictional members in lists A 1–21 and B 1–70:
~45 % paid the year, ~40 % nothing, the rest partly; 2 pending transfers; a campaign) and checks its shape, runs a two-session race
check, then rolls back (`rollback/*_down.sql`, newest first) and re-applies. Prints `OK` at the end.

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

## Import the paper sheets

`import/import-paper.mts` turns the yearly paper sheet into members and confirmed `paper` payments
(one per member, covering every ticked month). Put the real CSVs in `supabase/import/data/`
(gitignored); fictional examples of each format are in `import/sample/`.

```sh
node supabase/import/import-paper.mts --sheet supabase/import/data/sheet.csv \
  --phones supabase/import/data/phones.csv --page-totals supabase/import/data/page_totals.csv
# check the summary and warnings, then add: --sql supabase/import/data/import.sql
```

| CSV | Columns |
|---|---|
| sheet | `number,name,group,m1..m12` (group `A`/`B` or `أ`/`ب`; any non-empty month cell = paid) |
| phones (optional) | `number,phone` (8 local digits become `+222…`) |
| page totals (optional) | `page,from_number,to_number` plus `m1..m12` and/or `total`: amounts written on each page, in MRO (empty = not checked) |

Errors (duplicate number, unknown group, bad phone, …) stop it; warnings (numbering gaps, an
unticked month between ticks, a page total that does not match the ticks) are for the owner to
check against the paper. Prices default to A=1000, B=500 (`--price A=1000`); the SQL refuses to run
if the database prices differ. Paste the generated file into the SQL editor: it is one transaction,
and running it again adds nothing (payment ids are derived from year + member number). The file
holds names and phones: do not commit or share it.

Before the real import, rehearse it on a throwaway local database (never the real project):
`supabase/import/check-local.sh --sheet supabase/import/data/sheet-2026.csv [--page-totals …]`
prints the dry run, then imports twice locally and reports members, payments, money, who is up to
date or behind per group, and that the second run added nothing. No names are printed. Tests: `node --test supabase/import/import-paper.test.mts`
(also run by `tests/local/run.sh`, which applies the sample import twice to a throwaway database).

## Types

After a schema change regenerate `src/lib/supabase/database.types.ts`
(`supabase gen types typescript --project-id vhcdgxgwdlflmxmqnxzf > src/lib/supabase/database.types.ts`).

## Remote state

Applied to project `vhcdgxgwdlflmxmqnxzf` on 2026-09-28 through the Supabase MCP. The file names
match the remote migration versions, so `supabase db push` sees them as already applied.
No seed data was applied remotely: only the groups and 2026 prices (`*_m1_groups.sql`).

## Advisor warnings that are intentional

- `0029 authenticated_security_definer_function_executable` on every write RPC: signed-in users
  must call them; each one re-checks the caller's committee role inside.
- `0028 anon_security_definer_function_executable` on `verify_receipt`: anyone holding a receipt
  code may check it. It returns only what the printed receipt shows.
