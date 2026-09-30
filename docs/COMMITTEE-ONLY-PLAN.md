# Committee-only app · plan (owner decision 2026-09-30)

The app becomes a tool for the committee only. No public pages, no member access. Visitors see only
/login. Members get information only through what the committee sends on WhatsApp (receipt images,
report PDFs/images, «المتأخرات», reminders). Base: `m2-app` = main 3e591d4.

Supersedes: docs/MONEY-PRIVACY.md, docs/MEMBER-ACCESS.md (mark both "retired" in step 2).
DECISIONS.md: "Members submit a payment" becomes "the committee records every payment from the
WhatsApp screenshot".

## 0. Real data (production counts, 2026-09-30, read-only query)

| What | Rows | Plan |
|---|---|---|
| member_links | 1 (active) | revoke in step 3 (set `revoked_at`, audited). Drop the table only after the owner OKs it |
| payments.submitted_via_link | 1 (confirmed) | keep (history). Drop the FK to member_links before any table drop |
| member_push_subscriptions | 0 | table can be dropped once the owner OKs it |
| push_subscriptions (committee) | 2 | keep |
| members / payments / campaigns / expenses / committee | 91 / 63 / 1 / 2 / 4 | keep, untouched |

No real data is deleted. Every change can be undone (rollback file plus grants).

## 1. Inventory: delete / keep / simplify

### Lane A: supabase/**, src/lib/supabase/**, src/lib/data/**, src/app/api/**, auth

| Item | Path | Mark |
|---|---|---|
| Member-link routes | `src/app/m/[token]/route.ts` (+test), `src/app/m/demo/route.ts`, `m/demo2/route.ts`, `m/invalid/page.tsx`, `m/switch/page.tsx` | delete (proxy sends `/m/*` to /login) |
| Member reads | `src/lib/data/member.ts` (+test), `member-types.ts` | delete |
| Member server actions | `src/lib/data/member-actions.ts` (+test): memberUploadProof, memberSubmitPayment, memberSavePush/DeletePush, memberSwitch/Accept/Decline, memberSignOut | delete |
| Member cookies and token | `src/lib/member-cookies.ts`, `src/lib/member-link.ts`, `src/lib/fail-limiter.ts` (only /m uses it; check with grep) (+tests) | delete |
| Committee link actions | `actions.ts`: createMemberLink, revokeMemberLink | delete (the one active link is revoked by SQL in step 3) |
| Money split for viewers | `src/lib/data/money.ts`: moneyViewer / getMoney / getReportForViewer / getMoneyContributions | simplify: committee-only reads (`committee(read.x)`), no viewer branch |
| Public cached reads | `src/lib/data/public.ts` (`unstable_cache` + `createPublicClient`) | simplify: move the reads committee pages still use (memberRows, memberIndex, groupPrices, fundAccounts, fundInfo) to the session client in `committee.ts`. Delete getFundStats, getActivityPublic, getLedgerPublic, getCampaignsPublic, getExpensesPublic, getTermsInfo, getContributorsPublic, getReportShell, getReceipt |
| Anonymous client | `src/lib/supabase/public.ts` | delete after the move (keepalive uses a raw fetch, not this client) |
| `verify_receipt` read | `read.ts` verifyReceipt, `types.ts` receipt check types | delete |
| Report shell (amount-free) | `report.ts` loadReportShell / toReportShell, `types.ts` ReportShell, FundStats, *Public types | delete. Keep assembleReport / loadReport |
| `touchesPublic` + PUBLIC_TAG | `actions.ts` run(), `tags.ts` | simplify: `revalidatePath` of the committee pages, or keep the tag for the committee cache |
| Push to members | `src/lib/push/member.ts` (+test); notifyMember call in confirm/reject | delete |
| Committee push | `src/lib/push/send.ts`, `payload.ts` | keep. Change `/r/<code>` and `/me` URLs in `payload.ts:68` to `/committee/payments` |
| Crons | `src/app/api/keepalive`, `src/app/api/backup` | keep. Keepalive needs `anon` SELECT on `keepalive` |
| Backup tables | `src/lib/backup/export.ts` | keep member_links in `BACKUP_TABLES` until the table is dropped |
| Errors | `errors.ts` codes member_rate_limited, link codes | delete in step 3 (the migration test reads the SQL) |
| Login | `src/app/login/*`, `src/app/committee/setup` | keep. `login/page.tsx:31` link to "/" → delete it |
| Types | `database.types.ts` | regenerate after step 3 |

### Lane B: sw.ts, offline, install, manifest, share/report-pages/pdf libs, e2e/**, CI

| Item | Path | Mark |
|---|---|---|
| Public page cache | `sw.ts` NetworkFirst `isPublicPage` → PAGES_CACHE; `cache-rules.ts` PUBLIC_VIEWS, isPublicViewRead | delete. Every navigation network-only, with `offline.html` as the fallback |
| Old caches | `RETIRED_CACHES` | add `pages-v2`, `sb-public-views-v2`, `warm-meta`, deleted on activate |
| Page warming | `src/lib/offline/warm.ts`, `data-saver.ts`, `served-from-cache.ts` (+tests), `providers/sw-update.tsx` WarmOfflinePages / SaveVisitedPages | delete |
| Saved query cache | `providers/index.tsx` PersistQueryClientProvider, `offline/persister.ts`, `cache-seed.tsx` PublicCacheSeed | simplify: no persisting (plain QueryClientProvider). A committee offline read, if wanted later, needs a device cache cleared on sign-out |
| Install invite for strangers | `providers/install.tsx` InstallBanner / InstallWatcher / InstallCapture, `offline/install.ts`, `components/app/engaged.tsx` | simplify: keep only `InstallEntry` (in «حسابي»). Delete the banner, the engagement timing and the member «أنت» hold |
| Paste a member link | `providers/member-link-paste.tsx` (+test) | delete |
| Member push | `providers/member-push.tsx`, `lib/push.ts` kind "member" | delete. Keep committee push |
| Pull to refresh, offline banner, badge, SW update toast | `providers/pull-to-refresh.tsx`, `offline-banner.tsx`, `app-badge.tsx`, `sw-update.tsx` (ServiceWorkerUpdates) | keep |
| OCR cache | `sw.ts` `/ocr/` CacheFirst | keep |
| Manifest | `src/app/manifest.ts` | simplify: `start_url: "/committee"` (keep `id: "/"` so installs survive); drop the /members shortcut; new description; regenerate screenshots of committee screens (`scripts/manifest-screenshots.mts`) |
| Robots, OG image | `src/app/robots.ts` (keep noindex), `src/app/report/opengraph-image.tsx` | keep / delete |
| Receipt image | `src/lib/share-receipt.ts` verifyUrl + QR, `src/lib/qr.ts` (+test) | simplify: no QR, no URL in the image or the text. Keep the receipt number and code as plain text |
| Report images/PDF | `src/lib/share-report.ts`, `report-pages.ts`, `pdf.ts`, `canvas-share.ts`, `report-check.ts` | keep and extend (§4 reports). Remove `reportUrl` / app link from the share text. «المتأخرات» stays without amounts |
| e2e (fixtures) | `member.spec.ts`, `member-ui.spec.ts`, `member-links.spec.ts`, `money-privacy.spec.ts`, `money-privacy-offline.spec.ts`, `offline-warm.spec.ts`, `donations.spec.ts` | delete |
| | `install.spec.ts` | simplify: only the «حسابي» entry |
| | `pwa.spec.ts` | simplify: manifest valid; offline → offline page; nothing cached; old caches dropped |
| | `smoke.spec.ts` | rewrite: `/`, `/members`, `/m/x`, `/r/x`, `/report` → /login when signed out |
| | `report.spec.ts` | move to `/committee/reports`; drop "visitor reads" |
| | `share.spec.ts` | assert no URL/QR |
| | `committee.spec.ts`, `record.spec.ts`, `edge-cases.spec.ts`, `push.spec.ts`, `pull-to-refresh.spec.ts` | keep |
| e2e flows (local Supabase) | `flows/pay-confirm.spec.ts`, `flows/reject-resend.spec.ts` (member pays by link) | rewrite: a «مشرف» records → a treasurer confirms / rejects → re-records |
| | `flows/campaign.spec.ts` ("a member gives… a stranger sees •••") | rewrite: the committee records a contribution → confirm → campaign page totals |
| | `flows/cash.spec.ts` | keep |
| e2e seed | `supabase/tests/e2e/seed-e2e.sql`, `helpers.ts` (member link fixtures) | simplify |
| CI | `.github/workflows/ci.yml` | keep all jobs. Merge a step only with the spec changes that step needs so flows stay green |

### Lane C: src/components/**, src/app/(app)/**, globals.css

| Item | Path | Mark |
|---|---|---|
| Public pages | `src/app/(app)/(public)/page.tsx`, `members/`, `accounts/`, `donations/`, `layout.tsx`, `error.tsx` | delete |
| Member page | `src/app/(app)/me/page.tsx`, `views/me.tsx`, `views/member-switch.tsx` | delete |
| Public report and receipt check | `src/app/report/page.tsx`, `src/app/r/[code]/page.tsx`, `not-found.tsx` | delete. The report moves to `/committee/reports` |
| Public views | `views/home.tsx`, `views/members.tsx`, `views/accounts.tsx`, `views/donations.tsx`, `hero.tsx` | delete. Reuse pieces (the month grid in members, the ledger in accounts) in the committee screens |
| Money hiding | `money.tsx` (Dots, MoneyHint, useMoney, useReportMoney), `money-model.ts`, `money-action.ts`, `viewer.ts`, `viewer-action.ts` | delete. Amounts come in the server props |
| Member link and member mode | `member-card.tsx`, `member-card-cache.ts`, `member-act.tsx`, `member-view-action.ts`, `member-slot.tsx`, `demo-member.ts` (+test), `demo-link.ts`, `member-links.tsx`, `member-links-model.ts` (+test), `member-link-admin.tsx`, `donate-proof.tsx`, `pay-to.tsx` (maybe keep for reminder text), `walk-return.ts` (check), `recent-members.ts` (check) | delete (check each with grep/knip) |
| Links page | `(committee)/committee/member-links/page.tsx`; the «روابط الأعضاء» row in `views/committee.tsx` | delete |
| Record sheet | `record.tsx` (member mode lines ~150, 479, 626, 829) | simplify: committee mode only |
| Review slip | `slip.tsx`, `views/committee.tsx` «أرسلها العضو» label | simplify. Keep the queue: a «مشرف»'s recordings still wait for a confirmer |
| Shell | `shell.tsx` TABS (public tabs, `/accounts#bq-sum` aside, compact balance), `(app)/layout.tsx` heroData | rewrite (§4) |
| Receipt | `receipt.tsx` Qr, `audience="public"`, `receipt-model.ts` verifyPath | simplify: one audience, no QR/link |
| Report | `report-view.tsx` (shell/money split, SITE_URL footer, `/accounts` back link), `report-share.tsx` (useCommitteeViewer gate) | simplify → `/committee/reports` |
| Demo | `demo.ts`, `fixtures.ts` (member fixtures fxMember*, fxDemoTokenOf, fxMemberLinks), `source.ts` (member and money-privacy sections) | simplify |
| Logout | `logout.tsx` href "/" | → /login |
| Keep | `act.tsx`, `sheet.tsx`, `expense.tsx`, `campaign-form.tsx`, `handover.tsx`, `members-admin.tsx`, `accounts-admin.tsx`, `reminders.tsx`, `settings-cards.tsx`, `views/settings.tsx`, `views/account.tsx`, `views/payments.tsx`, `views/setup.tsx`, `cancel-payment.tsx`, `date-field.tsx`, `search-field.tsx`, `lib/ocr/**` | keep |
| CSS | `globals.css` blocks for hero, compact bar, `bq-me`, member card, money dots, verify, install banner, donations | delete in step 2. Month grid: plain ✓ or empty (§4) |

## 2. Database

Must stay (real data or still used): every base table (members, membership_periods, payments,
payment_allocations, payment_months, expenses, transfers, campaigns, campaign_participants,
reminders, audit_log, committee, settings, groups, group_prices, fund_accounts, terms, handovers,
balance_adjustments, push_subscriptions, job_runs, member_links, member_push_subscriptions); the
committee views (arrears, payment_queue, members_admin, committee_accounts, handovers_admin,
expenses admin); the money views now only for committee (fund_summary, monthly_collection, …,
guarded by `can_see_money()`); `keepalive` (anon, cron).

Migration m28 `committee_only` (reversible; test in `run.sh`; rollback at the top of `m2_down.sql`):
1. `revoke select` from anon on every view: member_status_public, member_months, fund_stats,
   activity_public, campaigns_public, expenses_public, terms_info, campaign_contributors_public,
   fund_accounts_public, fund_info, group_prices_public. Keep `authenticated` (the committee reads
   them).
2. `revoke execute` from anon on public.verify_receipt, app_private.verify_receipt,
   app_private.public_* helpers (public_member_months, public_group_prices, …). Keep keepalive.
3. Drop the functions only the server used for members:
   member_session(s), member_history, member_recent_beneficiaries, member_submit_payment,
   member_save_push (both signatures), member_delete_push, create_member_link, revoke_member_link,
   member_link_for, link_member (both schemas). Drop the view member_links_admin. Rollback
   re-creates them from the m24/m25 text.
4. `update member_links set revoked_at = now(), revoked_by = null where revoked_at is null` (1 row,
   audited). Only if the owner OKs it; otherwise the proxy redirect is enough.
5. `verify_receipt`: drop (both), or keep revoked for authenticated committee lookup (recommended:
   drop; the committee finds receipts in «الدفعات»).
6. Optional later (m29, after owner OK): the amount-free m26 views and `can_see_money` (replace the
   guard by `is_committee()`); drop member_push_subscriptions (0 rows); drop the FK
   payments.submitted_via_link → member_links, then member_links (1 row) – keep the column.
7. `payment_queue.submitted_by_member`: keep the column (null) until the types are regenerated,
   then drop it in m29.

Tests (`supabase/tests/m1_test.sql`, 16 lines touch links/verify_receipt): remove the member-link
tests; add "anon can read nothing except keepalive" (loop over `information_schema.role_table_grants`).

## 3. What the committee does day to day

| Job | Now | Committee-only |
|---|---|---|
| Payments | members send proofs; committee confirms | the committee records from the WhatsApp screenshot (OCR fills the amount, date and txn number). A treasurer/deputy/admin's recording is confirmed at once; a «مشرف»'s waits in «للمراجعة» |
| Cash | record, method cash | same |
| Receipt | image + /r link + QR | image only (share sheet → WhatsApp), no link |
| Reminders | `/committee/late`, wa.me walk | keep; message text without an app link; «المتأخرات» PDF |
| Members | add, edit, status, group, join month, credit | keep; add a per-member statement (§4) |
| Expenses | record, cancel | keep; on home and in each campaign |
| Campaigns | create, edit, close; contributions came from members | the committee records contributions (member or outside donor: `member_id` null works). Per-campaign page (§4) |
| Report | public /report + share for committee | `/committee/reports`, 7 reports, amounts allowed except «المتأخرات» |
| Handover, settings, fund wallets, accounts, push, «حسابي» | keep | keep |

Pointless now (remove): money privacy split («•••», MoneyHint, lock, «لديك رابط؟»), member «أنت»
card, `/me`, «أرسلت دفعة» / «ادفع عن شخص آخر», family profiles and switcher, links page, member push,
stranger donation share (`donate-proof`), install invite and its timing, public home hero, compact
balance bar, public ledger, OG preview, receipt QR, page warming and offline pages, «كيف أدفع؟» shown
to the public (the wallet numbers stay in the reminder text).

## 4. New admin information architecture

Rules: simple everyday Arabic; flat Material 3 (tonal surfaces, no heavy shadows, no box in a box);
month grid = plain ✓ or empty cell (no circles, tints or current-month emphasis); no «X من 12» or
«متأخر 9»; Western digits; every target ≥ 48 px.

Routes (keep `/committee/*` so push links and bookmarks still work; `/` → `/committee`):

Bottom nav (5):
1. **الرئيسية** `/committee`
2. **الأعضاء** `/committee/members`
3. **التبرعات** `/committee/campaigns`
4. **التقارير** `/committee/reports`
5. **المزيد** `/committee/more`: المصاريف, الدفعات الأخيرة, تذكير المتأخرين, تسليم الصندوق,
   الإعدادات (wallets, prices, backup, committee accounts), حسابي, تثبيت التطبيق, خروج

Home (what the treasurer sees first, top to bottom):
- «في الصندوق» balance (one number), one line under it: «هذا الشهر: دخل 12 000 · صرف 3 000»
- Two big buttons: **سجّل دفعة** (primary), **سجّل مصروفًا** (tonal)
- «تنتظر التأكيد» (only if any): rows name · amount · who recorded; tap → slip with ✓ / ✗
- «هذا الشهر»: «دفع 18 عضوًا، بقي 3» → tap = late list with «ذكّر»
- «آخر العمليات»: 5 rows (payment/expense), «عرض الكل»
- Open campaign row (title, collected / target) → campaign page

Flows and tap counts:
- Record a transfer from a screenshot: سجّل دفعة (1) → choose the image (2, OCR fills) → pick the
  member (3, search or recent) → months are pre-chosen = oldest owed (0–1 to adjust) → سجّل (4)
  → receipt → مشاركة الوصل (5) → WhatsApp. Target ≤ 6 taps.
- Cash: سجّل دفعة → «نقدًا» → member → months → سجّل: 5.
- Expense: سجّل مصروفًا → amount, what for, (campaign) → سجّل: 3–4.
- Confirm a «مشرف» recording: home row → ✓: 2.
- Remind one late member: home «بقي 3» → ذكّر → WhatsApp: 3.
- Share a report: التقارير → report card → period → صور / PDF: 4.

**Members tab:** search, list by list A/B, month grid ✓ or empty; tap a member → sheet: months,
payments, «سجّل دفعة له», «كشف حسابه» (share), edit, status.

**Campaigns tab** (stronger):
- List: open first (title, collected/target bar, contributors count), closed below.
- «حملة جديدة» (title, target, dates, who takes part).
- Campaign page `/committee/campaigns/[id]`: collected / spent / left; contributors with amount
  and date (member or outside donor); expenses of the campaign.
- Actions: «سجّل مساهمة» (record sheet pre-set to this campaign, amount only), «سجّل مصروفًا
  للحملة», «شارك تقرير الحملة» (PDF / images), edit, «أغلق الحملة» (surplus → fund, existing RPC).
- Lane A: one committee read `campaign_detail(id)` (contributions + expenses + transfers) or reuse
  campaign_contributions + expenses admin filtered by campaign.

**Reports tab** (each: preview → **PDF** · **صور واتساب** · **نص**; period picker: this month /
month / year / committee term / from–to):
1. **ملخص الشهر**: collected, spent, balance at start/end, count who paid.
2. **جدول الأشهر**: per list, ✓ or empty per month (the full report grid).
3. **المتأخرات**: names and months only, **no amounts** (owner rule; existing export).
4. **المصاريف**: list for the period, total, per campaign.
5. **تقرير حملة**: target, collected, contributors, spent, balance.
6. **ملخص السنة / الدورة**: monthly bars in/out, totals, opening/closing balance, handover line.
7. **كشف عضو**: one member's months and payments for a year (for a member who asks).

Data: 1, 2, 3, 6 come from `loadReport` (year/term) → add month and period options. 4 needs
`expenses_admin` for the period (drop the 50-row public limit, `expensesComplete`). 5 needs the
campaign read. 7 needs a committee read `member_statement(member, year)` (new view or RPC,
recipe B). Rendering: extend `report-pages.ts` with block types per report, reuse `pdf.ts` and
`canvas-share.ts`.

## 5. Rollout (production works at every step)

1. **Gate (Lane B + A, one small release).** `src/proxy.ts`: matcher on everything except
   `_next/static`, `_next/image`, `sw.js`, `swe-worker*`, `manifest.webmanifest`, `icons/`, `ocr/`,
   `offline.html`, `logo.jpg`, `api/keepalive`, `api/backup`. Signed out → `/login?next=…`, except
   `/m/*` and `/r/*` → `/login` (no `next`, no message) and the member cookies cleared. Signed in:
   `/` → `/committee`, `/members` → `/committee/members`, `/report` → `/committee/reports` (or keep
   /report behind the gate for now), `/accounts`, `/donations`, `/me`, `/m/*`, `/r/*` → `/committee`.
   Redirects `Cache-Control: no-store`. Login page: remove the «/» link. e2e smoke updated. Demo
   mode: gate skips as today.
2. **Remove UI (Lane C + A reads).** Delete the public, member and money-privacy code (§1). New
   shell and IA (§4) in slices: shell + home → reports → campaign page. Move the public.ts reads
   to the session client. Receipt without QR. Specs updated in the same merges.
3. **DB (Lane A).** m28 (§2), tested with `run.sh`, applied through MCP, types regenerated,
   errors.ts cleaned. Only after step 2 is live (nothing calls anon reads).
4. **SW/offline (Lane B).** No page cache, `RETIRED_CACHES` += pages-v2 / sb-public-views-v2 /
   warm-meta, no persister, manifest `start_url` `/committee`, new screenshots, install invite
   reduced to the «حسابي» entry. Owner decision needed: this worker should take over by itself
   (skipWaiting for this release only), so installed phones drop old saved pages without a tap.
5. **Later, after owner OK:** m29 (drop the m26 views, member_push_subscriptions, the FK and
   member_links). Docs: HANDOFF, DECISIONS, supabase/README rows, retire MONEY-PRIVACY and
   MEMBER-ACCESS.

Risks:
- **Strangers' installed PWAs / old SW:** until the new worker takes over, an offline phone can
  show the last saved public page (no amounts since m27, but names and ✓). Mitigation: step 4
  skipWaiting + delete caches; online, every page already redirects after step 1.
- **Old SW caching the redirect target under "/":** only if the login response is storable. Keep
  /login and the redirects `no-store`.
- **Member link cookies (`bq_member*`):** harmless after step 1; cleared on the /m redirect.
- **Receipts already sent** contain a QR/link to /r → now /login. Accept (owner decision); the
  receipt number still identifies it.
- **Push:** member subs 0. Committee push URLs `/r/…` and `/me` must change in step 2
  (`lib/push/payload.ts`).
- **Committee pages break on the anon revoke** if step 3 goes before the read move (memberRows,
  fundAccounts, fundInfo, groupPrices use the anon cached client today).
- **Caching private data:** unstable_cache with a session client is wrong (cookies). Use per-request
  reads (`committee()`) or a server-only secret-key client behind the gate.
- **CI:** `flows` job runs on PRs to main; the member flows must be rewritten in the same step as
  the removal, and `seed-e2e.sql` cleaned. knip will report many unused files: use it to finish
  the clean-up.
- **Keepalive** must keep anon SELECT on `keepalive`, or the free project pauses.
- **Demo/fixtures:** `source.ts` / `fixtures.ts` must lose the member and public parts without
  leaving `Partial` demo stubs that call the real server.

## 6. Prototype brief (localhost:3700, fixtures, throwaway branch `proto/committee-home`)

Same data, same rules (§4), each variant = home + the record-payment flow + the Reports and
Campaigns tabs, reachable by `?v=a|b|c`.

- **A · «مهام اليوم»:** home is a to-do list: pending confirmations, late members to remind this
  week, open campaign. A fixed bottom «سجّل دفعة» bar above the nav. Record flow = a full-screen
  3-step wizard (image → member & months → check & save → share receipt).
- **B · «الصندوق أولًا»:** big balance, month in/out, two big buttons, then recent activity.
  Record flow = one long sheet (image at top with OCR, member search, month grid ✓/empty tap,
  amount, save) with a sticky summary footer. Reports tab = 7 cards with a period chip row.
- **C · «ابدأ من العضو»:** home = search field + the members list (month ✓/empty rows), balance
  in a slim top line; tap a member → «سجّل دفعة له» (member already chosen, oldest owed months
  pre-ticked) → image → save → share. Campaigns tab = list with per-campaign page and «سجّل
  مساهمة» first.

Show each with: taps counted for "record transfer from screenshot", "record cash", "remind one
late member", "share the monthly summary", "record a campaign contribution".
