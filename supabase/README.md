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
| `*_m11_delete_account.sql` | admin deletes a committee account that never did anything (`delete_committee_member`, audited; `committee_accounts.can_delete`); accounts with history are only deactivated |
| `*_m12_my_profile.sql` | «حسابي»: `update_my_profile` (own display name; link own member row once; changing/removing a link stays admin-only because of the own-membership rule) |
| `*_m13_rpc_wrappers.sql` | advisor clean-up: every SECURITY DEFINER RPC moved to `app_private`; `public` keeps SECURITY INVOKER wrappers with the same names/params/defaults (API unchanged) |
| `*_m14_handover_submit_balance.sql` | handover difference = counted − balance **at submit** (activity between submit and accept is normal fund activity, not a «فرق عند التسليم»); the new term opens with the balance at acceptance, which is also the closed term's closing balance |
| `*_m15_closed_campaign_guards.sql` | a closed campaign takes no more money: `close_campaign` refuses while contributions are pending (`campaign_has_pending`); `confirm_payment` refuses a contribution to a closed campaign and `record_expense` an expense on one (`campaign_closed`) |
| `*_m16_backup_snapshot.sql` | `backup_snapshot(tables)` (service role): every backup table in one statement = one snapshot, no paging; `job_runs` (last run / ok / last good file of the weekly backup), committee read-only |
| `*_m17_month_error_detail.sql` | `month_already_paid` / `month_not_owed` / `wrong_month_amount` carry a JSON DETAIL (member name, ref, month, price) via `app_private.month_error`; the app names the member and month in the message |
| `*_m18_month_prices.sql` | `member_months.price` = the amount a payment for that month must have (group of that month's period; null = no price for the year); `month_grid.owed` falls back to the group's latest earlier price when a year has none (payments stay strict: `no_price`) |
| `*_m19_undo_member_period.sql` | admin `cancel_last_period` (cancels the open period and the one before it, re-inserts that one as open) and `set_join_month` (moves the first period's start); append-only, refused over paid/pending months (`period_has_payments`) |
| `*_m20_small_guards.sql` | `before_opening` (payments except paper, expenses dated before `settings.opening_balance_on`); `months_pending_after` in `change_member_status`; `last_admin` trigger (always one active admin, serialised by an advisory lock); index `audit_log(actor)` |
| `*_m21_apply_credit.sql` | «ادفع من الرصيد»: `apply_credit(id, member, months)` (confirmers) writes a confirmed payment with method `credit`; credit payments are not money in (fund summary, terms, public feed) and `member_credit` subtracts them; only `apply_credit` may create one (trigger) |
| `*_m22_member_link_former_debt.sql` | `committee.not_member` (admin: `set_committee_not_member`), `committee_accounts.needs_member_link` (confirmer without a member, not marked); `members_admin.former_debt_months/amount` for exempt/left members (member sheet only) |
| `*_m23_p2_guards.sql` | `record_payment` returns `pending_overlap`; txn refs compared normalised (`app_private.norm_txn`, unique index too); `set_committee_member` refuses a non-active member; term «collected» by confirmation day; a confirmed contribution to a closed campaign cannot be cancelled |
| `*_m24_member_links.sql` | member access by personal link: `member_links` (SHA-256 of the token only, one active per member), `payments.submitted_via_link`, `member_push_subscriptions`; committee `create_member_link` / `revoke_member_link` / `member_links_admin` / `payment_queue.submitted_by_member`; service-role-only `member_session`, `member_history`, `member_recent_beneficiaries`, `member_submit_payment` (always pending, 5 pending / 10 a day per link, proof required), `member_save_push` / `member_delete_push` |
| `*_m25_member_profiles.sql` | family phones (up to 5 profiles): `member_sessions(hashes[])` (one call for the switcher); member push unique per (link, endpoint) and `member_save_push(hashes[], …)` saves for every profile on the device |
| `*_m26_public_without_money.sql` | money privacy phase 1 (additive): amount-free public views `fund_stats`, `activity_public`, `campaigns_public`, `expenses_public`, `terms_info`, `campaign_contributors_public`, `member_status_public`; `app_private.can_see_money()` |
| `*_m27_money_private.sql` | money privacy phase 2: anon loses SELECT on the money views (`fund_summary`, `monthly_collection`, `expense_totals`, `recent_expenses`, `campaign_progress`, `campaign_contributions`, `activity_feed`, `terms_public`, `member_status`); each returns rows only `where app_private.can_see_money()` (active committee or the server). Strangers read the m26 views |
| `*_m28_committee_only.sql` | committee-only app: anon reads only `keepalive` (the public views and `app_private.public_*` revoked), `verify_receipt` and every member-link RPC dropped, `member_links_admin` and `member_push_subscriptions` dropped, the one active member link revoked (audited; `member_links` kept for history), `payment_queue.submitted_by_member` always null. Undo: `rollback/m28_revert.sql` |
| `*_m29_committee_tools.sql` | two levels: every committee member records (confirmed at once, no own-membership rule, paper too), expenses, credit, member details, group prices, settings, fund accounts; «مسؤول» (role admin) only: accounts, handover (alone), member status/group/join month/add, cancelling payments and expenses (the recorder may undo his own within 30 s), campaigns. `activity_log`, `member_statement`, `co_paid_members`, `push_subscriptions.kinds` + `set_push_kinds`. Undo: `rollback/m29_revert.sql` |
| `*_m30_levies.sql` | «اللوحة»: `campaigns.kind` donation/levy, participant exemption, `levy_shares`, `create_levy` / `add_levy_members` / `set_levy_share` / `exempt_levy_share` / `unexempt_levy_share` («مسؤول»); a share is paid in full once (trigger); a closed levy still takes shares, moved to the fund on confirm; `arrears.levy_left/levies`; statement levies. Undo: `rollback/m30_revert.sql` |
| `*_m31_reports.sql` | reports: `report_period`, `report_wallets` (in/out per wallet), `report_committee_work`; expenses name their wallet (`fund_account_id` / `paid_in_cash`), non-member donation rows carry `donor_name`. Undo: `rollback/m31_revert.sql` |
| `*_m32_stats.sql` | «الإحصاءات» (counts, no names): `report_fee_stats(year)` (paid up / owing 1, 2–3, 4+ per group, per month), `report_levy_stats(id?)`, `report_donation_stats(id?)`. Undo: `rollback/m32_revert.sql` |
| `*_m33_fee_groups.sql` | «الفئات» («مسؤول» only): `create_group` (next free letter, name, fee from a year), `set_group_price` admin-only (not for a retired year), `move_members_to_group(to, from_month, member_ids \| from_group, reason, dry_run)` → `{moved, skipped_already_in_target, blocked[], from_fee, to_fee}` (a new period each; refused over paid/waiting months), `retire_group`, committee `groups_overview(year)`; `groups.retired_from`, unique names; `change_member_status` refuses group changes over paid/waiting months; `report_levy_stats` groups carry expected/collected. Undo: `rollback/m33_revert.sql` |
| `*_m34_fee_stats_as_of.sql` | `report_fee_stats(year, p_as_of date default null)`: the year as it stood on a day (paid = confirmed on/before it and not released on/before it; late then; ref month = as-of month), `as_of` + `before_records` (as-of day before the first recorded payment → the app shows no comparison); the app compares this year with last year at today − 1 year. 1-arg call unchanged. Undo: `rollback/m34_revert.sql` |
| `*_m35_accuracy_audit.sql` | `accuracy_audit()` (committee, read-only): the 28 accuracy checks, one row each (`check_name, ok, detail`), counts only; the single source for `tests/accuracy_audit.sql`, run.sh and `tests/e2e/audit.sh` (CI, after the flows). Undo: `rollback/m35_revert.sql` |
| `*_m36_audit_job.sql` | `job_runs.job` accepts `audit`: the daily accuracy check (`/api/audit`) records its last run (ok + `28/28`, or the failed check names). Undo: `rollback/m36_revert.sql` |

Access (committee-only app since m28/m29, [docs/COMMITTEE-ONLY-PLAN.md](../docs/COMMITTEE-ONLY-PLAN.md)):
`anon` reads only the `keepalive` view. An active row in `committee` reads everything through RLS
and the committee reads/RPCs. Two levels: every active committee member records (payments are
confirmed at once), expenses, credit, member details, settings, fund accounts, and may undo his own
record within 30 s; **«مسؤول»** (role `admin`; `treasurer` / `deputy` / `committee` behave the
same) alone manages accounts, the handover, member status / group / join month, cancellations,
campaigns and levies, and fee groups. The server (secret key, `is_server()`) may do everything.
Nobody writes tables directly; all writes go through the RPCs, which return errors as SQLSTATE
`P0001` with a stable `HINT` code (e.g. `month_already_paid`, `not_admin`, `reason_required`) for
the app to translate (`src/lib/data/errors.ts`). Rows from m1–m27 above describe history
(public views, receipts, member links); the later rows say what was removed.

## Accuracy audit

`accuracy_audit()` (m35, committee or server, read-only) recomputes every figure the app shows from
the base tables: 28 checks, one row each (`check_name, ok, detail`), counts only. It is the single
source of the checks:

- production by hand: `tests/accuracy_audit.sql` (MCP `execute_sql`), expect 28/28;
- daily on production: `/api/audit` (Vercel cron) records `job_runs` (job `audit`, m36) and pushes
  an alert to the «مسؤول» accounts when a check fails;
- `run.sh`: `tests/local/accuracy_audit_checks.sql` (the fee-completeness check is skipped: the
  tests keep groups without a fee on purpose);
- e2e stack after the flows (CI): `tests/e2e/audit.sh`.

A new figure in the app gets a check here. A failing check means a wrong number somewhere: find the
cause, never "fix" data from the audit.

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

`src/lib/supabase/database.types.ts` follows the **production** schema, so it is updated after a
migration is applied:

- `pnpm db:types` regenerates it from the project (needs the `supabase` CLI logged into the owner's
  account; Prettier formats it). Review `git diff` and commit.
- Without that login, use the Supabase MCP `generate_typescript_types`, or patch the file by hand
  for the change (the Functions/Views/Tables entry of what the migration touched).
- Local generation (`supabase gen types --db-url` against the `run.sh` database) needs Docker
  (postgres-meta); it is not part of the workflow.

## Remote state

Applied to project `vhcdgxgwdlflmxmqnxzf` on 2026-09-28 through the Supabase MCP. The file names
match the remote migration versions, so `supabase db push` sees them as already applied.
No seed data was applied remotely: only the groups and 2026 prices (`*_m1_groups.sql`).

## Writing a migration

- Name it `YYYYMMDDHHMMSS_mNN_<slug>.sql`. While testing before it is applied, use the placeholder
  `29990101000000_mNN_<slug>.sql` and run `ALLOW_PLACEHOLDER=1 supabase/tests/local/run.sh`.
- Remote schema changes go to the lead for review first. Apply with the Supabase MCP
  (`apply_migration`, the exact file text), then check
  `select md5(array_to_string(statements, E'\n')) from supabase_migrations.schema_migrations where version = '…'`
  equals `md5 -q <file>`, and `git mv` the file to the recorded version. `run.sh` fails on a
  placeholder or future version, and on two files with one version.
- **New write RPC:** the body goes in `app_private.<name>` (`security definer set search_path = ''`,
  re-check the caller's role inside, `app_private.fail('<code>')` for expected errors); add
  `public.<name>` as a `language sql security invoker set search_path = ''` wrapper with the same
  parameters and defaults (`select app_private.<name>(p_x => p_x, …)`); revoke all from public/anon,
  grant execute on both to `authenticated, service_role`. A test fails if a SECURITY DEFINER
  function lands in `public`.
- **Change an RPC:** `create or replace function app_private.<name>`. Touch the wrapper only when
  the signature changes (then drop and recreate both).
- Every UPDATE/DELETE inside a function needs a WHERE (the API loads pg_safeupdate; run.sh checks).
- Every new `fail('<code>')` / `hint = '<code>'` needs an Arabic message in
  `src/lib/data/errors.ts` (a test reads the migrations and fails otherwise).
- Add the undo at the top of `rollback/m2_down.sql`, tests to `tests/m1_test.sql`, a row to the
  table above, and update `src/lib/supabase/database.types.ts` (see Types).

## Security advisor

Since m13 no SECURITY DEFINER function is in the exposed `public` schema (lints 0028/0029 are gone):
each RPC's body lives in `app_private` and `public` holds a SECURITY INVOKER wrapper. A new write RPC
follows the same pattern (definer in `app_private`, invoker wrapper in `public`); a SQL test fails
otherwise. The remaining auth warning (leaked password protection) is a dashboard setting.
