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
| `*_m7_member_lists.sql` | two lists: `members.list_code` + unique (list, number), `member_ref` "A-12" in views and receipts; committee `members_admin`; active-only counts/arrears; `change_member_group`, `next_member_number`, renumbering |
| `*_m7_settings_where.sql` | fix: `update_settings` targets the settings row with WHERE (Supabase API sessions load pg_safeupdate); `tests/local/run.sh` now fails on any UPDATE/DELETE without WHERE in functions |
| `*_m8_terms_handover.sql` | committee terms (one open) and handover: `start/update/submit/accept/cancel_handover` (acceptor = another admin), `balance_adjustments` («فرق عند التسليم»), public `terms_public`, `fund_summary` + term/adjustments, committee `handovers_admin` |
| `*_m8_admin_confirms.sql` | the admin may confirm/reject payments too (`can_confirm` = admin, treasurer, deputy); own-membership rule unchanged |
| `*_m9_committee_accounts.sql` | admin view `committee_accounts` (login, last sign-in) and `set_committee_active`; accounts are created in the app (email or phone + generated password), no invitation emails |
| `*_m10_push.sql` | committee Web Push: `push_subscriptions` (own rows only, no anon), `save_push_subscription` / `delete_push_subscription`; the server sends with the secret key |

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

`import/import-paper.mts` turns the yearly paper sheets into members and confirmed `paper` payments
(one per member, covering every ticked month). The fund has two lists with their own numbers:
list A (1000, A-1…A-21) and list B (500, B-1…B-70). Put the real CSVs in `supabase/import/data/`
(gitignored); fictional examples are in `import/sample/`.

| CSV | Columns |
|---|---|
| sheet (one or more `--sheet`) | `[list,]number,name,group,m1..m12` (list defaults to the group; `A`/`B` or `أ`/`ب`); month cell empty = unpaid, `?` = not readable, anything else = paid |
| phones (optional) | `[list,]number,phone` (8 local digits become `+222…`) |
| page totals (optional) | `page,[list,]from_number,to_number` plus `m1..m12` and/or `total`, in MRO |

The real import is two SQL files, each one transaction that can be run again safely:

```sh
node supabase/import/import-paper.mts --sheet data/sheet-2026.csv --sheet data/list-b-1-27-2026.csv \
  --page-totals data/page_totals-2026.csv --only A:1-21,B:54-70 \
  --members-sql data/1-members-2026.sql --payments-sql data/2-payments-2026.sql
```

1. `1-members…sql`: every member (91), no money. 2. `2-payments…sql`: paper payments only for rows
the committee confirmed: `--only` limits them to list ranges (e.g. pages whose totals add up), and
any row with a `?` month is held back. Payments for other rows come later with a new run once the
committee answers (payment ids come from year + list + number, so nothing is paid twice).

Errors (duplicate list number, unknown group, bad phone …) stop it; warnings (numbering gaps per
list, unreadable rows, unticked month between ticks, page totals that do not match) are for the
owner to check against the paper. Prices default to A=1000, B=500 (`--price A=1000`); the SQL
refuses to run if the database prices differ. The files hold names and phones: do not commit or
share them.

Rehearse on a throwaway local database first (never the real project): `supabase/import/check-local.sh`
with the same flags runs the dry run, step 1, step 2, both again, and prints a name-free report.
Tests: `node --test supabase/import/import-paper.test.mts` (also run by `tests/local/run.sh`).

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
