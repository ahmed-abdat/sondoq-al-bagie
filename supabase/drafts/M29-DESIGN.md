# m29 / m30 design · committee tools (plan §7, §8) · Lane A draft 2026-09-30

Nothing here is applied. Real data (production, read-only, 2026-09-30): committee 4 active
(admin 1, deputy 1, committee 2; all 4 linked to a member); payments 50 confirmed, 13 cancelled,
**0 pending, 0 rejected**; campaigns 1 (mode `open`, closed), campaign_participants 0;
reminders 7; members without phone 89 / 91; push_subscriptions 2; audit_log 2 095 rows.

Two migrations, so each review stays small:

- **m29 `committee_tools`**: one committee level + auto-confirm, activity feed, member
  statement, per-kind push. No schema risk, mostly function bodies.
- **m30 `levies`**: «اللوحة». New columns and rules; needs the owner's answers below first.

Both: placeholder, run.sh + tests, rollback file (catalog diff = identical, like m28), apply after
m28.

## 1. One committee level, confirmed at once (§8.2) · m29

Already there:
- `record_payment` confirms immediately when the recorder `can_confirm()`.
- `cancel_payment` with a reason, audited.
- Receipts are issued in `confirm_payment`.
- `is_admin()` = role `admin`.

Change (function bodies only, no data change):
- `can_confirm()` becomes `is_committee() or is_server()`. Every active committee member records,
  confirms and cancels.
- `confirm_payment`: drop the own-membership rule (`own_membership`).
  `record_payment`: always confirm (drop the "mine" branch), so a new record is never pending.
- `record_payment`: `paper` is no longer admin-only (see Q2).
- Admin-only stays ONLY for account management: `set_committee_member`, `set_committee_active`,
  `delete_committee_member`, password reset (server action), `committee_accounts`.
- Admin-only today that becomes any-committee:
  - `change_member_status`;
  - `cancel_payment` (already allowed to confirmers; after the change, to everyone);
  - `require_campaign_manager` / `require_money_keeper`, which become `require_committee`;
  - handover `accept_handover`: see Q1.
- `reject_payment` stays callable, for any old pending payment (0 today); the UI drops it.
  `payment_queue` stays.
- Roles: the column and enum stay (history, audit `actor_role`). `deputy` / `treasurer` behave like
  `committee`. The UI shows «مسؤول» for `admin`, nothing else. Optional data clean-up, only with an
  owner OK: `deputy` → `committee` (1 row).
- `errors.ts`: drop `own_membership`, `paper_admin_only`, `not_confirmer` once unused.

## 2. Reminders retired (§8.1)

Nothing needed in SQL. `members.phone` is already optional (89 without one). `log_reminder` stays
until the UI stops calling it, then goes in a later clean-up. The table (7 rows) is kept. The
`arrears.last_reminded_at` column stays (null for new).

## 3. «سجل العمليات» activity feed (§7.1) · m29

`audit_log` already has one row per changed row: actor, action (the business action set by
`set_action`, e.g. `record_payment`, `cancel_payment`, `add_member`), table, row id, changed
columns.

New:
- `public.activity_log(p_before bigint default null, p_limit int default 50)`, committee only,
  newest first.
- One entry per business action: the audit rows of one statement are grouped by
  (actor, action, at). The entry carries the main row (payments / expenses / members / campaigns /
  committee / membership_periods …).
- Each entry returns: `id` (cursor), `at`, `actor_name`, `action`, `kind`, `subject` (payer or
  member name, campaign title, expense note), `amount` (payments/expenses), `payment_id` /
  `member_id` / `campaign_id` for links, `reason` (cancel, reject, status change).
- Paginated by id: `p_before` is the last id seen.
- Index `audit_log (id desc)` exists (identity pk). Add `(action, id desc)` if the grouping needs it.
- Existing 2 095 rows show at once, no backfill.
- Every committee read screen can also show «سجّلها X · أكّدها Y» from `created_by` / `decided_by`.
  `payment_queue` already has `created_by_name`, `decided_by_name`.

## 4. «كشف حساب» member statement (§7.3) · m29

`public.member_statement(p_member_id uuid, p_year smallint)` → jsonb, committee only:

- `member`: ref, name, group, status, periods.
- `months`: 12 × {month, state (paid/late/upcoming/not_owed/exempt…), price, payment_id}. This is
  the same grid as `member_months`.
- `payments`: every payment touching the member in that year, any status. Each has date, amount
  for this member, total, method, receipt_no, receipt_code, status, reason (reject/cancel),
  recorded_by name + at, confirmed_by name + at, the note, and the months/campaign it covers.
- `levies`: {title, expected, paid, left, exempt} after m30. Until then, an empty list.
- `owed`: months_count, amount_owed (fees), levy_left (m30), credit.

No new tables. Built on the `payment_allocations`, `payments`, `committee` and `month_grid()`
functions.

## 5. Committee push per kind (§7.2) · m29 (+ TS in src/lib/push)

Already there:
- `push_subscriptions` (per user, per device).
- `src/lib/push/send.ts` sends to confirmers except the actor, with a 404/410 clean-up.

New:
- Column `push_subscriptions.kinds text[] not null default '{payment,expense,contribution,levy,cancel,member}'`.
- `public.set_push_kinds(p_endpoint text, p_kinds text[])`: own subscription only; a check
  constraint on known kinds.
- TS: `notifyCommittee(kind, actorId, payload)` sends to every active committee member except the
  actor, filtered by kind. It is called after record_payment / record_expense / campaign
  contribution / create_levy / cancel.
- Text: «سجّل X دفعة لـ Y» etc. No "needs confirming".

## 6. «اللوحة» levy (§7.4) · m30

Already there:
- `campaigns.amount_mode` `fixed` / `per_group` / `custom`.
- `campaign_participants (campaign_id, member_id, expected_amount)`.
- Payment allocation `kind = 'campaign'` with `member_id`.
- `public_campaign_progress.participants_paid`.

New:
- `campaigns.kind` (`donation` | `levy`, default `donation`; the 1 existing row is `donation`).
- `campaign_participants`: add `exempted_at`, `exempted_by`, `exempt_reason`. Add the audit
  trigger (it is not audited today).
- `create_levy(p_id, p_title, p_purpose, p_deadline, p_participants jsonb)`, any committee:
  - participants `[{member_id, expected_amount}]`, computed by the app for "all active / group /
    chosen" (like create_campaign);
  - each `expected_amount > 0`.
- `add_levy_members(p_id, p_participants)`, then `exempt_levy_share(p_id, p_member_id, p_reason)`
  and `unexempt_levy_share` (audited, reason required).
- Payments: `record_payment` allocations `{kind:'campaign', campaign_id, member_id, amount}`
  against a levy are checked:
  - the member is a participant and not exempted;
  - the amount is ≤ what is left of the share (Q3);
  - a closed levy still takes share payments (Q4).
- Debt:
  - `app_private.member_levy_owed()` returns (member, campaign, expected, paid, left) for shares
    not exempted with left > 0;
  - `arrears` gets `levy_left` + `levies jsonb`, and lists members with only levy debt;
  - `member_status` is unchanged (months only). The statement and «المتأخرات» use the new columns.
- Committee views:
  - `levy_status`: per levy per member, expected / paid / left / exempt;
  - `member_levies`: per member, across levies.
- Close: `close_campaign` on a levy keeps unpaid shares as debt. Surplus handling: Q4.
- Contributions from non-participants to a levy: refused (use a donation). The UI shows only
  participants.

## Owner answers (2026-09-30)

1. Handover: «مسؤول» only (accept_handover stays admin; starting / counting it is any committee
   member).
2. Paper records: any committee member.
3. «اللوحة» share: **full share only**, one payment of exactly the share (no parts, no more).
4. After a «لوحة» closes, unpaid shares stay debt. Late payments go to the **main fund** but stay
   recorded as coming from that «لوحة»: the allocation stays on the levy and, when the levy is
   closed, an automatic transfer levy → fund of that amount.
5. Amount: one amount for all, editable for a single member (per-member override). Optional A/B
   pair at creation.
6. Exempt a share: any committee member, reason required, audited.
7. The `deputy` row stays as is (treated like `committee`).

m29 as built (placeholder `29990101000015_m29_committee_tools.sql`):
- `can_confirm` = any committee member.
- confirm without the own-membership rule; record always confirms; paper for all.
- 10 day-to-day functions become `require_committee`: change_member_status, add_member,
  update_member, change_member_group, set_join_month, cancel_last_period, set_group_price,
  update_settings, add_fund_account, update_fund_account.
- New `activity_log`, `member_statement`, `push_subscriptions.kinds` + `set_push_kinds`.
- Rollback `rollback/m29_revert.sql`: the catalog diff is identical.

## Effort (Lane A)

- m29 (one level + auto-confirm, activity_log, member_statement, push kinds + TS send filter):
  ~1.5 days incl. tests and rollback.
- m30 (levies incl. arrears, views, allocation checks, statement levies): ~1.5 days after the
  answers.
- UI and exports are Lanes B and C.
