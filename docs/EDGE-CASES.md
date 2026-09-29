# Edge-case audit: صندوق الرابطة (m2-app @ 44c67d8, 2026-09-29)

Read-only. Nothing in the repo or the remote DB was touched.

- **verified (harness)**: reproduced on a throwaway local Postgres with every migration applied
  (probe script: `scratchpad/probe/probe.sql` + `run.sh`, same shim as `supabase/tests/local`).
- **verified (code)**: the path is unambiguous in the source; not executed.
- **suspected**: depends on runtime behaviour I could not run here.
- `pnpm check`: green (55 files, 358 tests). `errors-sql.test.ts` passes, so **every P0001 code has
  an Arabic message** (verified).

Severity: **P0** money or data wrong/lost · **P1** wrong or confusing, blocks work · **P2** polish.
Lanes: **A** backend (`supabase/**`, `src/lib/data/**`, `src/app/api/**`) · **B** platform (SW,
offline, providers, e2e, CI, vercel) · **C** UI (`src/components/app/**`, pages).

---

## 1. Money and months

| # | Case | Current handling (evidence) | Verdict | Sev | Fix (lane) | New Arabic message |
|---|---|---|---|---|---|---|
| M1 | **Retry after a lost response records the payment/expense twice** | `record.tsx:541` and `expense.tsx:45` create `crypto.randomUUID()` *inside* `submit`, so every tap is a new id and `record_payment`'s replay on `p_id` (`m1_rpc.sql:80-84`) never triggers. Duplicate is caught only by `month_already_paid` (confirmed months), `duplicate_txn_ref` or `duplicate_proof`. Cash / credit / campaign-only payments and all expenses have no other dedupe. With a confirmer recording, the second tap on months shows «أحد هذه الأشهر مدفوع من قبل» although the first one worked. | bug, verified (code) | **P0** | C: create the id once per open form (`useState(() => crypto.randomUUID())`), keep it across retries, reset only after success. Same for expense and campaign create. A: none needed (replay exists). | none |
| M2 | Server action throws (network drop, 3G timeout, deploy skew) | No `try/catch` around `await uploadProof/recordPayment` (`record.tsx:548,557`), `recordExpense` (`expense.tsx:52,59`), `cancelPayment` (`cancel-payment.tsx:148`), `closeCampaign`/`createCampaign` (`campaign-form.tsx:38-53,207`), `run()` helpers (`handover.tsx:86`, `members-admin.tsx:202`), `accounts-admin.tsx:218,406,685,738`, `completeSetup` (`setup.tsx:43`). A rejected promise leaves `busy=true`: the button spins forever, no message, the user reloads and retypes (then M1 bites). Only `settings.tsx:109 runSave` catches. | bug, verified (code) | P1 | C: one `safeAct(fn)` helper that catches and returns `failure("network")`; use it everywhere a server action is awaited. | reuse `network` |
| M3 | Confirm/reject «undo» window then send fails or app is killed | `slip.tsx:82-119`: optimistic stamp; the RPC is sent after 5 s (or on `pagehide`). If the call **throws** (not `ok:false`) nothing sets `failed`, and the collapsed row (`slip.tsx:145-150`) shows the confirmed mark while nothing reached the server. `pagehide` sends are often dropped on iOS/Android when the PWA is swiped away. The server `undo_payment` RPC (`m2_accounts.sql:118`) is unused by the UI. | bug, verified (code) | P1 | C: catch in `send`, set `failed`; show the mark only when `sent`; keep a «جارٍ الإرسال…» state; on next open the payment is simply pending again (acceptable). | «لم يصل التأكيد بعد. تحقق من الإنترنت ثم اضغط أعد المحاولة.» |
| M4 | Concurrent confirm by two confirmers | `FOR UPDATE` + `already` result (`m2_receipts.sql:76-82`); `race.sql` in run.sh proves first wins, second no-op. | OK, verified (harness) | | | |
| M5 | Two payments for the same month | Unique `payment_months_paid_once` + catch → `month_already_paid` (`m2_receipts.sql:92-99`); run.sh race proves it. But a **pending** duplicate is not flagged at record time (pre-check reads confirmed months only, `m1_rpc.sql:94-99`). | OK / gap | P2 | A: return `pending_overlap: true` from `record_payment` when a live pending payment covers the same month; C: show a warning on the new slip. | «يوجد دفعة أخرى بانتظار التأكيد لنفس الشهر.» |
| M6 | Confirm vs cancel race | both lock the row; loser gets `not_pending` → «هذه الدفعة لم تعد بانتظار التأكيد.» | OK, verified (code) | | | |
| M7 | Short / over amount, credit | Short: blocked with the exact difference, «fit months» offer (`payment-draft.ts:56-73`). Over: credit to one member. **Credit can never be spent**: no RPC applies credit to months, month allocations must equal the price and a payment needs `amount > 0` (`m1_schema.sql:135,175`). A member with credit still shows late. | gap, verified (harness: no credit RPC) | P1 | A: `apply_credit(p_member, p_year, p_months[])` that writes an internal payment (new method `credit`, excluded from `fund_summary` money-in because the cash was already counted) with month allocations and a negative credit row (or a `credit_uses` table); `member_credit()` subtracts uses. C: «ادفع من الرصيد» chip on the record screen when credit ≥ one month. | «الرصيد لا يكفي لهذا الشهر.» |
| M8 | **Group change mid-year, then paying earlier months** | Record screen prices every month with the member's *current* group (`record.tsx:429`, `payment-draft.ts:29,99`); DB prices by the period of each month (`m1_guards.sql:485-491`) → `wrong_month_amount`, whose message says «افتح الصفحة من جديد» (reload does not help). | bug, verified (code) | P1 | A: expose per-month price in `member_months` (or a `member_month_prices` view); C: price each chosen month from it. | fix existing `wrong_month_amount`: «مبلغ الشهر لا يساوي الرسوم الشهرية لذلك الشهر. راجع المسؤول.» |
| M9 | **Not-owed months (before joining, exempt, left) are selectable and in the defaults** | `defaultMonths` / `RowCard` treat every non-paid month as open (`record.tsx:52-57,242-244`), so a June joiner defaults to January–September → `month_not_owed`; «المتأخرة (n)» is inflated. | bug, verified (code) | P1 | C: exclude `not_owed` months from `open`/`late` and disable their chips. | none |
| M10 | Error does not say **which** member/month failed (multi-member transfer) | One transaction (all or nothing, good), but the code only: «أحد هذه الأشهر مدفوع من قبل.» | gap | P1 | A: raise with `detail` = `member_ref:YYYY-MM`; `codeOf` passes it; C: append the name and month. | «شهر {الشهر} لـ {الاسم} مدفوع من قبل.» |
| M11 | **Year boundary (Dec → Jan): last year's arrears cannot be recorded** | Month codes keep only `ctx.year` (`month-code.ts:10-18`, `page-data.ts:28`); the draft has one `year` (`payment-draft.ts:25,97`). From 1 January 2027 every unpaid 2026 month is invisible on the member sheet and unrecordable, though SQL still counts it late. `currentDueMonth` returns 0 in early January (`derive.ts:255-258`). | bug, verified (code) | P1 (time bomb: 3 months) | A: member rows carry late months of past years (the `arrears.months` text array already has them). C: record screen gets a year switcher or a «متأخرات السنة الماضية» row; draft allocations carry their own year. | none |
| M12 | **No prices for the new year** | `set_group_price` has no UI (only `act.tsx`). On 1 Jan 2027 `ctx.prices` is empty → record blocked («لا نعرف الرسوم الشهرية…»), `month_grid.owed` is NULL so late members show 0 owed (`m1_views.sql:34-38`). | gap, verified (code) | P1 | A: `month_grid` falls back to the latest earlier year's price; or a yearly carry-forward in `set_group_price`. C: «الرسوم الشهرية» card in settings (admin) to set next year. | «حدد الرسوم الشهرية لسنة {السنة} قبل بدايتها.» |
| M13 | Price change mid-year | Prices are per year; frozen once any allocation exists (`tg_price_freeze`). Mid-year change not representable. | OK (by design) | P2 | Decision for AHMED. | |
| M14 | Exempt/left member with owed months | Owed months before the change stay owed (`month_grid`), but `arrears` lists active members only (`m7_member_lists.sql:116`), so the debt of someone who left disappears from reminders. | gap (policy) | P2 | A: add `former_with_debt` to `members_admin`; C: show it in the member sheet. | «عليه رسوم شهرية سابقة لم تُدفع.» |
| M15 | Back-dated exempt while a payment for that month is pending | Status change allowed; confirm still writes the month (`m1_rpc.sql:269-272` checks confirmed months only). Harness: month shows paid in an exempt period. | gap, verified (harness) | P2 | A: in `change_member_status` also refuse pending allocations after `m` (`months_pending_after`). | «توجد دفعة بانتظار التأكيد لأشهر بعد هذا التاريخ.» |
| M16 | Rounding MRU ↔ MRO, zero/negative/huge | `mruToMro` rounds; zod `mro` int 1..100 000 000; DB `amount > 0`. «المبلغ المحوّل» has no unit hint (`record.tsx:834`): typing the wallet figure in MRU blocks with a wrong difference (safe, confusing). | OK / gap (suspected) | P2 | C: suffix «أوقية قديمة» and a hint when `sent × 10 = total`. | «يبدو أنك كتبت المبلغ بالأوقية الجديدة. اضربه في 10.» |
| M17 | Duplicate proof / same txn ref | Exact `txn_ref` per method (pre-check + partial unique) and exact SHA-256 of the **compressed** bytes (`actions.ts:570-584`). A screenshot re-shared through WhatsApp (recompressed) or a ref read with a space/leading zero passes. | gap (suspected) | P2 | A: normalise `txn_ref` (strip spaces, upper, drop leading zeros) in SQL; soft duplicate check (same method + amount + paid_on ±3 days) returned as a warning. C: confirm dialog. | «دفعة بنفس المبلغ والطريقة سُجّلت قبل أيام. هل هي دفعة جديدة؟» |
| M18 | Date in the future / before opening balance / year boundary | Future: DB `> current_date + 1` → `future_date`; OCR ignores future dates; DateField `noFuture`. **Before opening balance**: accepted (harness: `paid_on 2020-01-01` confirmed), counted on top of the opening balance and in no term's «collected». | gap, verified (harness) | P2 | A: refuse `paid_on/spent_on < settings.opening_balance_on` (`before_opening`) except `paper`. | «التاريخ قبل بداية سجلات الصندوق.» |
| M19 | Prepaying next year's months | Accepted (harness) but `month_grid` stops at December of the current year, so the months are invisible until January. | gap, verified (harness) | P2 | A: grid to `max(Dec this year, last paid month)`. | |
| M20 | Timezone, 31st, leap year | DB `current_date` and JS `todayIso()` are UTC = Nouakchott (`dates.ts:81`); months are first-of-month dates. | OK | | | |

## 2. Members

| # | Case | Current handling | Verdict | Sev | Fix (lane) | Message |
|---|---|---|---|---|---|---|
| E1 | **Wrong status change or wrong join month cannot be undone** | No RPC cancels a `membership_period`; `change_member_status` needs `m > cur.from_month` (`m1_rpc.sql:263`). A mistaken «غادر» from October leaves October not owed forever; a join month set too late makes earlier months `month_not_owed` for good (paper import risk). | gap, verified (code) | P1 | A: `cancel_last_period(p_member, p_reason)` (admin): stamps `cancelled_at` on the latest period and reopens the previous one (`to_month` is a stamp column today; add a guarded path like `sondoq.delete_account`), refused if paid months exist in it. Also `set_join_month` for a member with no payments. C: «تراجع عن آخر تغيير» in the member sheet. | «لا يمكن التراجع: توجد أشهر مدفوعة في هذه الفترة.» |
| E2 | Duplicate number | pre-check `number_taken` + unique mapped (`errors.ts:90`) | OK | | | |
| E3 | Renumbering, swap A-3 ↔ A-5 | Needs a free temporary number (unique constraint) | gap | P2 | C: hint in the form. | «اختر رقمًا غير مستخدم، ثم غيّر الرقم الآخر.» |
| E4 | Deleting a member with payments | Impossible (append-only); «غادر» instead | OK | | | |
| E5 | Link committee account to member | `update_my_profile`: active + not taken (`m12`). Admin paths (`set_committee_member`, `createCommitteeAccount`) accept a left/exempt member (only the unique index). | gap | P2 | A: same `member_not_active` check in `set_committee_member` when the link changes. | existing |
| E6 | **Own-membership rule skipped by «لست عضوًا»** | Rule depends on `committee.member_id` (`m2_receipts.sql:84`); setup lets a confirmer pick «لست عضوًا» (`actions.ts:809-812`), then they can confirm their own fees. | gap (policy) | P1 | A: `committee_accounts` exposes `member_id is null`; C: accounts list flags «غير مربوط بعضو» for admin/treasurer/deputy; ask AHMED whether confirmers must be linked. | «هذا الحساب يؤكد الدفعات وليس مربوطًا بعضو.» |

## 3. Committee and auth

| # | Case | Current handling | Verdict | Sev | Fix | Message |
|---|---|---|---|---|---|---|
| U1 | Deactivated account still signed in | `getCommitteeSession` reads `active` fresh (`committee.ts:27`); RLS `is_committee()` checks `active`; RPCs `not_committee`; login refuses (`login/actions.ts:33-41`); push goes to active only (`send.ts:34-38`). | OK, verified (code) | | | |
| U2 | Setup (`setup_pending`) partial failure | Order profile → password → flag. If the flag update fails after the password changed, the retry hits `same_password` («اختر كلمة سر غير التي أرسلها المسؤول» is then wrong). | gap, verified (code) | P2 | A: in `completeSetup` skip `setPassword` when sign-in with the new password already works, or map `same_password` during setup to success. | |
| U3 | Admin demotes the last admin | Self-demote/deactivate refused (`cannot_demote_self`). Two admins demoting each other at the same moment can both commit (no lock) → zero admins. | gap (suspected, rare) | P2 | A: in `set_committee_member`/`set_committee_active` lock `committee` rows `for update` and refuse when no other active admin would remain (`last_admin`). | «يجب أن يبقى مسؤول واحد على الأقل.» |
| U4 | Delete account with history | `has_history`; login deleted after the row; `delete_failed` if auth delete fails | OK | | | |
| U5 | Admin creates an account, response lost, retries | Second call → `login_taken`; the admin never saw the password. | gap | P2 | C: on `login_taken` offer «أعد تعيين كلمة السر» for that login. | «الحساب موجود. أعد تعيين كلمة السر لتحصل على كلمة جديدة.» |
| U6 | Password reset for a lost phone | `resetCommitteePassword` sets a new password but does not end the old sessions; not in `audit_log`. | gap | P2 | A: after reset call `auth.admin.signOut` for the user (or tell the admin to deactivate); insert an `audit_log` row `reset_password`. | «كلمة السر الجديدة لا تُخرج الهاتف القديم. أوقف الحساب إن ضاع الهاتف.» |
| U7 | Login failure reasons | Every auth error → «البيانات غير صحيحة» (`login/actions.ts:30`), including rate limit and network. Passwords are trimmed at login but not at set (`setPassword`). | gap | P2 | A/C: map `over_request_rate_limit`/network; trim in `passwordSchema`. | «محاولات كثيرة. انتظر دقيقة ثم حاول.» |
| U8 | Role changed while another device is open | UI buttons stale; DB re-checks (`not_confirmer`, `not_admin`) | OK | | | |
| U9 | Session expiry mid-action | Proxy refreshes on `/committee` POSTs; a dead refresh token redirects the action POST to /login (suspected: form lost, no message). | gap (suspected) | P2 | C: M2 helper maps a redirect/unknown throw to `not_signed_in`. | existing |

## 4. Campaigns, expenses, handover

| # | Case | Current handling | Verdict | Sev | Fix | Message |
|---|---|---|---|---|---|---|
| H1 | **Handover: activity between submit and accept is booked as a «difference»** | `accept_handover` recomputes the balance at accept and books `counted − computed` (`m8:306-315`). Harness: count 5000 submitted, a real 1000 transfer confirmed, accept → adjustment **−1000**, public balance 5000, feed shows «فرق عند التسليم −1000» against the outgoing treasurer. Expenses in between do the opposite. | bug, verified (harness) | **P0** | A: difference = `counted − computed_balance at submit` (already stored by `submit_handover`); money after submit belongs to the new term. Or refuse confirm/record while a handover is `submitted` (`handover_in_progress`). C: show «دفعات بانتظار التأكيد: n» and the balance change since submit on the accept screen. | «تغيّر الرصيد بعد إرسال التسليم بـ {المبلغ} أوقية.» |
| H2 | Handover while payments pending | No warning (`handover.tsx` has no pending count). | gap | P2 | C: show pending count before submit. | «توجد {n} دفعات بانتظار التأكيد. أكّدها أو ارفضها قبل التسليم.» |
| H3 | Cancel after accept | `handover_confirmed` | OK | | | |
| C1 | **Close campaign with pending contributions** | `close_campaign` moves the surplus, but pending allocations were validated at insert only; confirm later adds money to a closed campaign that is neither in the fund nor transferable (harness: collected 8000, transferred 3000, balance 5000 stuck). UI gives no warning (`campaign-form.tsx:200-215`). | bug, verified (harness) | P1 | A: `close_campaign` refuses when pending contributions exist (`campaign_has_pending`), or `confirm_payment` re-checks `campaign_closed`. C: show the pending count in the close sheet. | «للحملة مساهمات بانتظار التأكيد. أكّدها أو ارفضها قبل الإغلاق.» |
| C2 | Expense on a closed campaign | `record_expense` never checks the campaign status: harness balance −4000. | bug, verified (harness) | P1 | A: `campaign_closed` in `record_expense` (keep allowed for `keep` campaigns if AHMED wants). | existing |
| C3 | Expense larger than the balance | Accepted (harness: fund −98 997 000 before cancel). | gap, verified (harness) | P2 | C: warn when `amount > balance`; A: optional `insufficient_balance` warning flag. | «المبلغ أكبر من رصيد الصندوق الحالي. تأكد منه.» |
| C4 | Cancel a confirmed contribution after the transfer | Campaign balance goes negative (same logic as C2). | gap | P2 | A: refuse when campaign closed with `to_fund`. | |

## 5. Offline and PWA

| # | Case | Current handling | Verdict | Sev | Fix | Message |
|---|---|---|---|---|---|---|
| O1 | Stale cached pages show an old balance | Public pages NetworkFirst 6 s, views SWR (`sw.ts:34-75`). «آخر تحديث» is rendered server side from `lastActivityAt`, so a cached HTML keeps «اليوم» on later days. | gap (suspected) | P2 | B: offline banner with the fetch time (persister already stamps it); C: compute the relative label on the client. | «هذه نسخة محفوظة من {الوقت}.» |
| O2 | Write attempts offline | Buttons disabled on `!online`, `OfflineWriteHint`; SW `NetworkOnly` for non-GET. Captive/zero-bandwidth networks still report online → M2. | OK / see M2 | | | |
| O3 | **Old client after a deploy (skew)** | `skipWaiting: false` keeps the old precached bundle until «تحديث»; server action ids of the old bundle may not exist on the new server → throw → M2 spinner. | gap (suspected) | P1 | B: enable Vercel Skew Protection (`deploymentId`), and on a failed action show the update toast. | «نسخة جديدة من التطبيق متاحة. اضغط تحديث ثم أعد المحاولة.» |
| O4 | Large / HEIC images | `compressImage` to ≤200 KB; HEIC on Android fails → «تعذّر فتح الصورة. جرّب صورة أخرى.» | OK / P2 | P2 | C: say how to fix. | «هذه الصورة بصيغة لا يقرؤها الهاتف. أرسل لقطة شاشة بدلًا منها.» |
| O5 | OCR failure | `.catch` → manual entry (`record.tsx:527`); ~8 MB model downloaded on first open of the record sheet (`warmOcr`). | OK / P2 | P2 | B: warm only on the first picked image when `saveData`. | |
| O6 | Realtime disconnect | backoff resubscribe + catch-up on wake (`realtime.ts:218-258`) | OK | | | |
| O7 | Private data offline | persister public-only (`persister.ts:11`), SW never caches `/committee`, `/r`, storage | OK | | | |

## 6. Errors

| # | Case | Current handling | Verdict | Sev | Fix | Message |
|---|---|---|---|---|---|---|
| R1 | Every P0001 code has a message | `errors-sql.test.ts` scans all migrations; passes | OK, verified | | | |
| R2 | Non-P0001 SQLSTATEs | Unmapped → «حدث خطأ غير متوقع»: `23503` FK (harness: unknown member id), `23502` not-null (harness: campaign participant null), `23P01` period overlap, `22003` overflow, `57014` timeout, `40001/40P01`, `PGRST202` (schema cache after a migration), 23505 on `handovers_one_active`. | gap, verified (harness for 23503/23502) | P2 | A: map 23503/23502 → `invalid_input`, 57014 → `timeout`, 40001/40P01 → `busy`, `handovers_one_active` → `handover_in_progress`, PGRST202 → `busy`. | `timeout`: «استغرقت العملية وقتًا طويلًا. تحقق هل حُفظت ثم أعد المحاولة.» `busy`: «الخادم مشغول. حاول بعد لحظة.» |
| R3 | 500 on a page | `ErrorState` calm message + retry | OK | | | |
| R4 | Proof uploaded, `record_payment` failed | File stays in `proofs` (no delete policy, by design); each retry with a new id adds another file (M1). | gap, verified (code) | P2 | A: weekly cleanup job (service role) removing `payments/<id>-*` with no payment row older than 1 day. | |
| R5 | Multi-member partial failure | Single transaction, nothing half saved | OK (see M10 for the message) | | | |

## 7. Data and database

| # | Case | Current handling | Verdict | Sev | Fix | Message |
|---|---|---|---|---|---|---|
| D1 | **Backup paginates without ORDER BY** | `readAll` uses `.range()` with no `.order()` (`backup/export.ts:44-49`); tables over 1000 rows (`audit_log` already, `payment_months` soon) can come back with rows skipped or repeated between pages. Reads are also not one snapshot. | bug, verified (code), impact suspected | P1 | A: order by primary key (`id`, or the composite keys) in every page; one RPC `backup_snapshot()` returning all tables in one statement is better. | |
| D2 | Backup/cron failure is invisible | Only `console.error` (`backup/route.ts:21`); keepalive returns `ok:false` to nobody. | gap | P1 | A: store `last_backup_at/ok` in `settings` (or a `jobs` table); C: settings card «آخر نسخة احتياطية»; push the admin on failure. | «فشلت النسخة الاحتياطية الأسبوعية. راجع المسؤول التقني.» |
| D3 | Backup lives in the same Supabase project; proof images not backed up | `backups` bucket in the same project | gap | P2 | B: also send the file to a second place (e-mail/Drive of the owner). | |
| D4 | Append-only integrity | Guards on every table, no truncate, stamp-once, audit trigger | OK | | | |
| D5 | Audit gaps | Storage uploads, admin password resets, auth account creation/deletion in Auth, push rows: not audited | gap | P2 | A: audit rows from the server actions for reset/create. | |
| D6 | `account_has_history` scans `audit_log` by `actor` without an index, once per account row of `committee_accounts` | `m11:23` | gap | P2 | A: `create index audit_log_actor_idx on audit_log (actor)`. | |
| D7 | RLS | anon executes only public read functions + `verify_receipt` (harness list); committee reads all tables (by design, any role). | OK, verified (harness) | | | |
| D8 | Storage policies | `proofs`: committee read/insert, no update/delete, 400 KB, jpeg/png/webp; `backups`: service only | OK; any committee account can upload without limit | P2 | | |
| D9 | `verify_receipt` enumeration | 3.3 billion codes, no rate limit; the last 30 codes are public in `activity_feed` anyway (by design). Returns payer name and member names. | OK / P2 privacy | P2 | Decide with AHMED whether `payer_name` of non-members should show publicly. | |
| D10 | Paper import dates vs term reports | `public_terms` sums by `paid_on`, so a back-dated payment after a handover changes the closed term's «collected» but not its closing balance | gap | P2 | A: count by `decided_at` for terms. | |

---

## Counts

- **P0: 2** (M1 double record on retry, H1 handover difference absorbs later activity)
- **P1: 15** (M2, M3, M7, M8, M9, M10, M11, M12, E1, E6, C1, C2, O3, D1, D2)
- **P2: 30**
- OK items: M4, M5 (confirmed dupes), M6, M20, E2, E4, U1, U4, U8, H3, O2, O6, O7, R1, R3, R5, D4, D7, D8.

## Prioritized fix list

### Lane C (UI), do first

1. **M1 (P0)** `record.tsx`, `expense.tsx`, `campaign-form.tsx`: `const [id] = useState(() => crypto.randomUUID())` at form level; pass it to `uploadProof` and the record call; regenerate only after `ok` (or when the form closes). Test: call submit twice with the first action resolving after a simulated drop; the second call must send the same id.
2. **M2 (P1)** Add `safeAct` in `src/components/app/act.tsx` (wraps any action: `try { return await fn() } catch { return failure("network") }`); replace every raw `await <action>` in record, expense, slip, cancel-payment, campaign-form, handover `run`, members-admin `run`, accounts-admin, setup. Always `setBusy(false)` in `finally`.
3. **M3 (P1)** `slip.tsx`: catch in `send`; collapsed view renders the mark only when `st.sent`; otherwise «جارٍ الإرسال…» and a retry button.
4. **M9 (P1)** `record.tsx:52-57,242-244`: `open` = months whose state is `late` or `upcoming`; `not_owed` chips disabled with «غير مستحق».
5. **M11/M12 UI (P1)** Record screen: past-year late months (from A's data) as a separate row with its year; settings card to set next year's «الرسوم الشهرية» (calls existing `setGroupPrice`), shown from 1 December.
6. **C1/H1/H2 UI**: pending counts on the close-campaign sheet and handover screens; accept screen shows balance change since submit.
7. **E6**: flag confirmers without a member link in the accounts list.
8. P2 polish: M16 unit hint, U5 reset offer, O4 HEIC message, C3 balance warning, E3 hint.

### Lane A (backend)

1. **H1 (P0)** `accept_handover`: use `h.computed_balance` from submit for the difference, or refuse writes during `submitted`. Add a harness test: submit, confirm a payment, accept → difference 0.
2. **C1/C2 (P1)** `close_campaign` refuses `campaign_has_pending`; `record_expense` and `confirm_payment` refuse a closed campaign. Harness tests from `scratchpad/probe/probe.sql` section B.
3. **E1 (P1)** `cancel_last_period` + `set_join_month` RPCs (admin, reason, refused with paid months), with a guarded path in the append-only trigger.
4. **M7 (P1)** `apply_credit` design (internal payment not counted twice in `fund_summary`), plus `member_credit` minus uses.
5. **M8/M11/M12 data (P1)** per-month price in the member month data; past-year late months in member rows; `month_grid` price fallback to the latest earlier year.
6. **M10 (P1)** `detail` with member ref and month on `month_already_paid` / `month_not_owed` / `wrong_month_amount`; `codeOf` keeps it; message template.
7. **D1/D2 (P1)** backup ordered pages (or one snapshot RPC); record last backup result and expose it to the admin.
8. P2: R2 SQLSTATE mapping, M15 `months_pending_after`, M18 `before_opening`, M5 pending overlap flag, U3 last-admin lock, D6 index, R4 orphan cleanup, U6 audit reset.

### Lane B (platform)

1. **O3 (P1)** Vercel Skew Protection; on an action failure while a waiting SW exists, show the update toast.
2. **D3 (P2)** second backup destination; SQL harness in CI (already Plan 2 of the architecture audit).
3. **O1/O5 (P2)** offline banner with fetch time; OCR warm only on first image when data saver is on.

### Questions for AHMED

- Must admin/treasurer/deputy accounts be linked to a member (E6)?
- Is credit meant to pay later months (M7)?
- After someone leaves, should old unpaid months stay in reminders (M14)?
- May a closed campaign with «يبقى في حساب الحملة» still pay expenses (C2)?
