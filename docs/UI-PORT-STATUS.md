# UI port status (Lane C, branch m2-ui)

Prototype «M» (proto worktree `src/app/prototype/direction/variant-m.tsx`, `receipt.tsx`) ported
into production code on the real Lane A data layer. Tokens: DESIGN.md + `src/app/globals.css`.

## Done
- Routes: `(public)/` home, `/members` (`?filter=late|none|A|B`), `/accounts` (`#bq-sum`,
  `#bq-pay`, `#bq-ops` anchors), `/donations`; `(committee)/committee` (queue, follow-up, FAB →
  record sheet) and `/committee/settings` (amount switch, fund accounts, WhatsApp number, invite,
  password, logout); `/r/[code]` (network, `connection()`); `/login` restyled (gate look, «نسيت
  كلمة السر»). Old `src/app/page.tsx` and `src/app/committee/` removed.
- Components in `src/components/app/`:
  - `source.ts` — the ONLY data door for pages (server-only). Reads `@/lib/data`; with
    `SONDOQ_FIXTURES=1` serves `fixtures.ts` (fictional, 71 members, today 28 Sep 2026).
  - `page-data.ts` (hero + member-sheet context), `derive.ts` (+tests: Arabic wording, member state,
    search, UTC dates), `receipt-model.ts` (+tests: VerifiedReceipt / PendingPayment → ReceiptView →
    ShareableReceipt), `types.ts` (LedgerEntry view model).
  - `shell.tsx` (bottom bar / rail, sliding pill with optimistic index, `Link transitionTypes`
    tab-fwd/back, desktop aside hero, compact bar on mobile home, reveal, `useSnack`), `tab.tsx`
    (React `<ViewTransition>` per page), `hero.tsx`, `sheet.tsx` (drag/velocity + avatar/receipt
    morph via `useSheet`), `receipt.tsx` (Receipt, Stamp, ConfirmedMark, Proof with signed URL,
    QR from `@/lib/qr`), `slip.tsx`, `record.tsx`, `member.tsx`, `entries.tsx` (rows, sheets,
    share via `@/lib/share-receipt`), `pay-to.tsx`, `month-rail.tsx`, `segmented.tsx`, `bits.tsx`,
    `icons.tsx`, `num.tsx`, `views/*`.
- Confirm/reject: the stamp lands at once, the action is sent after the 5 s inline «تراجع» window
  (or on pagehide/unmount), so undo never reverses a confirmed payment server-side. Decided slips
  stay collapsed to one line (with WhatsApp share once the receipt code is back).
- Record payment: member search, quick month chips, method grid, screenshot → OCR
  (`@/lib/ocr`: prefill method/ref/date, «تحقق» marks) → compress → `uploadProof` → `recordPayment`.
- Offline: write buttons disabled via `useOnline()` + `<OfflineWriteHint/>`; `<InstallCard/>` on home.
- Realtime: `usePaymentsRealtime` in `(committee)/layout.tsx` → `router.refresh()`.
- Drift fixes: `monthName()`/`formatDay()` use يناير…ديسمبر (Intl ar-MR gave شتمبر/أغشت/دجمبر);
  receipt `rc-` CSS on the 14/17/22/28/40 scale, slate muted, forest actions, one red, no hairlines.
- Verified: `pnpm check` + `pnpm build` green; Playwright screenshots 390/1280 of every route and
  of sheet/confirm/record flows, no console errors, no horizontal overflow.

## Round 2 (done)
- Fixture mode shows «بيانات تجريبية — ليست أرقام الصندوق الحقيقية» on every page (root layout).
- Group prices from `getGroupPrices(year)` (`source.groupPrices`, fixtures keep A 1000 / B 500).
- /committee is split by a segmented control: الدفعات · المتأخرون · المصاريف · الحملات
  (الحملات for admin/treasurer/deputy only).
  - المتأخرون (`reminders.tsx`): group reminder (`groupReminderText`, logged as "group") and one
    WhatsApp button per member (`reminderLink`, logged as "individual"), «ذُكّر قبل 3 أيام».
  - المصاريف (`expense.tsx`): record sheet (category chips, note, amount, date, main fund or an
    open campaign, invoice photo → `uploadProof` kind "expenses" → `recordExpense`); recent list
    (`getExpensesAdmin`) with «إلغاء» + reason chips → `cancelExpense`.
  - الحملات (`campaign-form.tsx`): new (`createCampaign`, amountMode "open"), edit
    (`updateCampaign`), close with surplus choice (`closeCampaign` to_fund/keep).
- Offline banner time: `cache-seed.tsx` (public layout) writes the server-read fund summary into
  the persisted public query cache with its read time, so the banner says «آخر تحديث قبل …».

## Demo mode (round 3)
- On only when `SONDOQ_FIXTURES=1` and `VERCEL_ENV !== "production"` (`src/components/app/demo.ts`,
  unit-tested). Then: /committee opens without a login (`src/proxy.ts`, one branch) as a fake
  admin «مستخدم تجريبي»; banner «نسخة تجريبية — البيانات وهمية ولا يُحفظ شيء».
- Every committee write goes through `useAct()` (`src/components/app/act.tsx`): real server
  actions normally; in demo, simulated after ~400 ms with a local store (`useDemoState`) that the
  screens merge (new pending slips, expenses, campaigns, accounts, members). Receipt codes
  `BQ-DEMO-0001…` open a sample receipt on /r. OCR stays real (on the phone).
- Outside demo, the committee session is always the real signed-in one, even with fixtures.

## Member management (round 3)
- Two lists, each numbered from 1, shown as «A-12» / «B-12» (`memberRef`, avatars, rows,
  search accepts «A-12», «b12», «ب 12»). Fixtures: A 1–21, B 1–70 (91 people, one exempt, one
  left, one deceased).
- /committee → «الأعضاء» (admin/treasurer/deputy): search, list and state filters, «إضافة عضو»
  (list, next free number, name, optional phone, first month → `addMember`), member sheet with
  «تعديل البيانات» (`updateMember`), «تغيير الحالة» (نشط/معفى/غادر/متوفى, from month, reason,
  calm confirmation for غادر/متوفى → `changeMemberStatus`) and «نقل إلى الفئة …».
- Public lists hide غادر/متوفى; معفى shows «معفى» with no owed months; «X من N» counts active only.
- Record payment: one transfer can also carry a campaign contribution (months + campaign
  allocations in one `recordPayment`). The record sheet lists active members only.
- Real contract (m2-app fa3431f): `memberRef` shown everywhere, `getMembersAdmin()`,
  `addMember({ listCode, … })`, `nextMemberNumber` (local guess first, server number replaces it),
  `changeMemberStatus` (MEMBER_STATUSES), `changeMemberGroup` (the list and number stay; only the
  fee group changes), «X من N» from `FundSummary.membersActive`.

## Round 4 (simplify + polish)
- /committee is a hub: «بانتظار التأكيد» slips + FAB «سجّل دفعة», then a short menu to one-level
  sub-pages with «رجوع إلى اللجنة»: /committee/late, /expenses, /members, /campaigns, /settings.
  Rare actions sit inside sheets (close a campaign, change a member's fee group).
- Record payment: several members in one transfer (rows with smart default months: late, else rest
  of year), editable payer, optional transfer amount (short → blocked, over → credit for a chosen
  member), 4 main wallets + «محفظة أخرى», date defaults to today, campaign on demand; OCR fills
  method/ref/amount/date. Confirmed-at-once recordings show the stamp and share.
- Slips: confirm only with `canConfirm` and never on one's own payment; failed send keeps the card
  with the reason and «إعادة المحاولة». Pending badge has one source (`pending-count.ts`).
- Settings: inline saving/saved/failed per field, confirm before showing amounts owed, opening
  balance, «حسابات اللجنة» (create account, credentials once via WhatsApp/copy, new password,
  stop/restart); login takes email or phone.
- QA: no hydration mismatch (relative times after mount via `useNow`), unknown /r code → 404,
  «المجموعة أ / ب» wording, Arabic month pickers, Arabic-Indic digits accepted, Open Graph,
  receipt sheet/receipt copy fixes, lazy receipt/QR/share code on public pages.
- Motion: 240ms pill/reveal, 320ms sheet, 220ms tab slide, 450ms bars, focus kept inside sheets.

## Round 5 (handover + terms)
- /committee/handover (from «الإعدادات» → «تسليم الصندوق للجنة الجديدة», admin/treasurer/deputy):
  start → count per active wallet + «نقدًا» + extra lines with live total and calm difference →
  who stays → note → submit; another admin accepts («قبول التسليم وبدء الدورة N», optional title)
  or anyone cancels with a reason; success shows the stamp and «محضر التسليم» (WhatsApp/copy).
- Public: hero and /accounts show «الدورة N · منذ …»; /accounts adds «فرق عند التسليم» to the
  balance sum and «الدورات السابقة».
- Demo: the handover lives in the act seam's local store (submitted «by someone else» so accept
  can be tried).

## Round 6 (report, export, donations layout)
- /report (public, no nav): A4 print-ready report — header, summary (carried-over balance → now),
  «ما جُمع كل شهر», members × 12 months grid per group (repeated headers), expenses, campaigns,
  footer link. Tools (screen only): «حفظ PDF» (print), «صورة الملخص» (Lane B's PNG card),
  «مشاركة في واتساب». Linked from /accounts «تقرير كامل» and the committee menu.
  TODO(lane-a): read from getReport() when it lands (today: the existing getters).
- /donations: stacked title/purpose/pill, calm zero state, facts columns, contact line without
  fund numbers.

## Round 8 (WhatsApp report, pickers, owner changes)
- «مشاركة التقرير» sheet (/report, /report#share from /accounts and the committee menu): images,
  PDF, summary image, copy link via Lane B's share-report; renders start when the sheet opens
  (prepareReportShare); «retry» shows «اضغط مرة أخرى» on the same option. «طباعة» stays small.
- /report for phones: big summary cards, collapsible sections, month dots (no «مقدَّمًا»; since
  r19: a ✓ badge per paid month, see «Report members grid» below). Link preview: /report/opengraph-image (Alexandria from
  Google Fonts at render; the renderer has no bidi, so words are laid out in reverse order).
- Date/month pickers: `date-field.tsx` (shadcn calendar in the bottom sheet, Monday first,
  «اليوم»/«أمس», no future where it makes no sense; 12-month grid for from-month).
- Owner: states نشط / معفى / غادر only; CSV export UI removed (the report PDF is the export);
  owed amounts read «عليه حتى الآن … أوقية».

## Remaining / next
0. «محضر التسليم» as a shareable image (like the receipt PNG) — later; today it is text (WhatsApp/copy).
   The new term's start date and public term line come from the server (`termStartedOn`); the demo
   cannot change public pages, and says so on the success card.
1. Lane B: `PERSIST_MAX_AGE` (30 days) is used as `gcTime`; it exceeds setTimeout's 2^31 ms, so
   queries without observers are garbage-collected immediately. Use `gcTime: Infinity` (or ≤ 24
   days) in `src/components/providers/index.tsx`. `cache-seed.tsx` works around it with a
   disabled observer.
2. Campaign allocations in the record-payment sheet (a transfer split between months and a
   campaign) and participants for fixed/per-group campaigns — not built.
3. Lane A copy: `src/lib/data/reminders.ts` still says «حالة الاشتراكات» (must be «الرسوم الشهرية»).

## Member numbers and cancelling payments
- Numbers read «أ 12» where groups mix and «12» inside one group (`memberLabel`, `MemberNo`,
  `Avatar` in `derive.ts`/`bits.tsx`; the mixed form reuses `memberNumber` from share-receipt).
  memberRef «A-12» stays the internal key. Search accepts 12، أ12، أ 12، A12، a-12، Arabic digits.
- «إلغاء هذه الدفعة» under a confirmed receipt for admin, treasurer, deputy (`cancel-payment.tsx`).
  Public pages are cached, so the viewer's role comes from `viewer.ts`: seeded by the committee
  layout, or one server action (`whoCanCancel`) when a Supabase session cookie exists.
- /committee/payments: recent confirmed payments (`getRecentPayments`), cancelled ones dimmed.

## Payloads (fixtures, 89 members)
Home reads `getMemberIndex` (search index only: ref, name, status label; a result opens
`/members?m=REF`); /members and the record sheet read `getMemberRows` (12-letter month code).
Home prefetch RSC 134.8 KB → 24.7 KB, /members 132.9 KB → 40.0 KB, home HTML 170 KB → 46 KB.
Nav probe (`nav.mjs`, CPU 4×, Fast 3G): 0 blank frames, nav never remounts, pill slides on every tab.

## Rounds 9–14 (search, accounts, «حسابي», sheet rebuild)
- Member search everywhere (`search-field.tsx`, `search-text.ts`, `use-speech.ts`,
  `recent-members.ts`): 🎤 Web Speech (ar-SA → ar, hidden when unsupported), «رقم» keypad sheet
  (أ/ب + digits, live «أ 12 · name»), «آخر من بحثت عنهم» (5, per device), forgiving names
  (ولد/بنت, order, ال, hamza, ة/ه, ى/ي), spoken numbers 1–99. Record list: «المتأخرون» first +
  group chips. Tests in `search-text.test.ts`.
- Committee accounts (`accounts-admin.tsx`): required role picker (4 roles, no default), «تغيير
  الدور» (setCommitteeMember), credentials text with no bidi marks, «المزيد…» → stop (confirm
  sheet) / delete (canDelete, deleteCommitteeAccount), «موقوف» chip, reactivation toast.
- Push: `<CommitteePushToggle/>` in «حسابي» (confirmers only; hidden in demo),
  `forgetCommitteePush()` before logout (`logout.tsx`), `<CloseStalePushNotifications>` +
  one-time `PushSuggest` card on the hub, `<AppBadgeSync>` in `pending-badge.tsx`.
- «حسابي» `/committee/account` (`views/account.tsx`): name (updateMyProfile, sends memberId
  unchanged), role/login/last sign-in read-only, password (setPassword), link own membership once
  (canLinkMember, active members, read-only after), notifications, «الخروج من كل الأجهزة»
  (signOutEverywhere with this browser's push endpoint, clears the query persister), «خروج».
  Settings are fund-only now (link row to «حسابي»). Hub name line links to «حسابي».
- Receipts: cancel a confirmed payment (`cancel-payment.tsx`, viewer role via `viewer.ts` +
  `whoCanCancel`), /committee/payments list. Fund renamed «صندوق الرابطة» in this lane.

## Sheet rebuild on Base UI (1c1c883) — status
Done: `src/components/app/sheet.tsx` keeps its API (`Sheet`, `useSheet`, `canVT`, `startVT`); no
call site changed. Phones: `@base-ui/react/drawer` (Root/Portal/Backdrop/Viewport/Popup/Content,
swipeDirection down, Title/Description as `bq-sr-only` wired to aria-labelledby, our handle +
«إغلاق»). Desktop ≥1024px: `@base-ui/react/dialog`, centred. CSS in globals.css («Base UI Drawer»
block): slide/fade via data-starting/ending-style, `--drawer-swipe-movement-y`,
`--drawer-swipe-progress` on the scrim, `.is-vt` skips the slide for view-transition morphs,
nested sheet dims the lower one, reduced-motion = opacity only, print hides it,
`body { position: relative }` for iOS. vaul removed; `src/components/ui/drawer.tsx` is now the
shadcn base-maia Base UI drawer (unused, kept per the request).

Re-tested at 390px in demo (script `/private/tmp/claude-502/sondoq-shots/r14.mjs 390`, shots in
`r14/`): member sheet, home receipt (✕), keypad, install steps, full receipt from a slip, record
payment + nested keypad + nested date picker (stack 2 → Escape closes only the top), record
footer, cancel payment, add member, admin member, add account, «المزيد…» → stop confirm, expense,
campaign form, «حسابي» pick + nested keypad, report share. All: aria-labelledby = label, scroll
locked, Escape closes, focus returns to the opener.

Closed (26a51af, 473dbd5; scripts `r14.mjs 390|1280`, `r15.mjs`, shots in `r14/`, `r15/`):
- 1280: every sheet is a centred dialog, sticky footers hold, nested dialogs stack; the lower
  dialog now dims (`[data-nested-dialog-open]`, brightness 0.88) since nested ones have no scrim.
- Swipe (CDP touch drag, 390): from the handle or on content at the top closes; inside scrolled
  content (record sheet at scrollTop 400) it scrolls the content (400 → 159) and stays open.
- Lane B e2e: 39/39 green against a fixtures build (`SONDOQ_FIXTURES=1 pnpm build`, then
  `SONDOQ_FIXTURES=1 PORT=3410 pnpm test:e2e`; port 3100 default may be taken). The share spec
  needs fixtures (it fails on a real-data build by design).
- Reject flow (inline, «تراجع» shows), date pickers in expenses/campaigns (nested, Escape closes
  only the top), handover page (no sheets), home receipt → «إلغاء هذه الدفعة» → cancelled stamp.
- View-transition morphs: member avatar and home receipt open with `.is-vt`, close cleanly.
- Snackbar: portalled to <body> (not under the aria-hidden `.bq-app`), so a snack raised while a
  sheet stays open (cancel on home) is tappable; with a sheet open it sits at the top in the scrim.
- Initial focus: the sheet itself (screen readers read its title; Tab → «إغلاق»), unless a field
  inside autofocused. Focus returns to the opener everywhere, incl. install steps (the old test
  tagged the row's inner span, not the button: false alarm).
Notes:
- Base UI hides the background with aria-hidden (not inert) and keeps `[aria-live]` regions and
  their ancestors visible, so on settings/account `.bq-app` itself is not hidden (by design);
  the scrim blocks pointers.
- Lane B (not changed): `src/lib/offline/pull.ts` still lists `[data-vaul-drawer]`; can be
  dropped (Base UI popups carry `role="dialog"`, already matched).
- A phone tap does not focus a button on iOS Safari, so focus return there lands on <body>.
- Swipe was checked with CDP touch in Chromium only; a pass on a real iPhone/Android is still worth doing.

## User management pass + first sign-in setup (27ba717..fc57dbd)
- Audit (impeccable): accounts rows carried 3 inline links + «المزيد…» and 3 sublines; stop/delete
  needed 2 sheets; «موقوف» used reject red (red is only «مرفوض»); member link typed as «أ 12» text;
  «حسابي» repeated admin-only notes, no password reveal; add member put the name 4th and showed
  «B-71»; «B-12» in an empty-state hint. Detector: clean.
- Accounts (`accounts-admin.tsx`): one tappable row (role · number · last sign-in) → one sheet with
  facts and actions (كلمة سر جديدة, تغيير الدور, ربط/تغيير العضوية, إيقاف or أعد تفعيل, quiet «حذف
  الحساب نهائيًا» when canDelete); confirmations replace the sheet content. Own row → «حسابي».
  «إضافة حساب» picks the member with the shared search/keypad (active, not linked yet).
  Unlinking is not offered (setCommitteeMember maps null to "keep").
- Shared `member-pick.tsx`: MemberPick, PickedMember, PasswordField («إظهار»).
- «حسابي»: role + login facts, «يغيّرهما المسؤول»; linked membership read-only («يغيّرها المسؤول
  فقط»); link-once kept when not linked.
- Setup: `src/app/committee/setup` (outside the app shell, «خروج» kept). `source.committeeSession()`
  redirects a setupPending session there; the setup page, nav badge and viewer check use
  `anyCommitteeSession()`. completeSetup via `useAct()` (demo stub). Demo: `/committee?setup=1`.
  An admin-set link is shown, not asked. Real pending path not exercised (needs a real account).
- Login: «نسيت كلمة السر؟ اطلب من المسؤول كلمة سر جديدة.» (no email reset).
- Verified: shots `r16/` (390, 1280), check + both builds green, e2e 41/41 on fixtures.

## Record payment, simplified (Lane C2, branch m2-ui-record)
Audit and plan: `docs/RECORD-PAYMENT-AUDIT.md`. All in `record.tsx` + one marked CSS block at the
end of `globals.css` («Lane C2»). Server contracts unchanged (`recordPayment`, `uploadProof`,
`@/lib/ocr`, `useAct` demo seam).
- Order: who (late months by default, amount per row) → «أرفق صورة التحويل» card (thumbnail,
  reading status, «تغيير») → «كيف دفع؟» → date → «تفاصيل أخرى» (amount sent, ref, payer,
  campaign), folded; it opens by itself when the amount sent differs or the payer is empty.
- Footer: «سيُسجَّل» + figure, then «رسوم من يناير إلى سبتمبر · بنكيلي · اليوم» (members,
  contribution, credit, method, date). One button: «سجّل الدفعة» when ready, otherwise it names
  the step («اختر كيف دفع», «اختر الأشهر», «صحّح المبلغ», «اختر لمن الباقي», «اكتب اسم الدافع»),
  scrolls to it and rings it once. Disabled only for a missing group price or offline.
- OCR: «من الصورة» (or «تحقق») mark per field, cleared when edited; an older reading never
  overwrites a newer picture; future dates ignored; the amount mark follows the live difference.
- Short transfer: «أقل من المجموع بـ …» plus «سجّل N أشهر فقط» when one member. Over: the rest
  goes to the only member by default (said in the summary), or a chosen one when several.
- «عضو آخر في نفس التحويل» is a quiet link; the form hides while picking; focus lands on the new
  member's name. Sections enter 220ms (opacity + 8px), fade only with reduced motion.
- Common case (one late member, screenshot read): 6 taps + 2 scrolls → FAB, member, screenshot
  (+ gallery pick), «سجّل الدفعة» (4, no scroll). Without a screenshot: FAB, member, method, save.
- Checked: 390/1280 (`/private/tmp/claude-502/sondoq-shots/rec/flow.mjs`, shots `rec/`), reduced
  motion, keyboard order, e2e `e2e/record.spec.ts` (43/43 with the suite).
- Remaining: the reading has no sender name (Lane B/OCR); with it the payer or member could be
  suggested. Starting from a WhatsApp share (share target) would save the gallery step.

## Edge-case fixes (docs/EDGE-CASES.md, Lane C list)
- M1: one id per open form (`once-id.ts`: `useOnceId`, `sendOnce`) in record payment, expense,
  new campaign, handover start; reused on every retry and for `uploadProof`, renewed only after ok
  (closing the form drops it). Unit test `once-id.test.ts` (retry after a lost answer sends the
  same id to upload and record). Demo stubs replay on the same id like the server. No e2e: demo
  writes never touch the network, so a lost answer cannot be staged there.
- M2: `safe-act.ts` + `useAct()` wraps every action: a throw becomes `network`; with the real
  actions Lane B's `reportActionError` is asked first (old app after a deploy → update toast,
  `stale_app`, empty message). Busy reset in `finally` in the run helpers.
- M3: a decided slip shows the mark only once the server accepted; «جارٍ الإرسال…» meanwhile,
  after 15 s «لم يصل التأكيد بعد…» + «أعد المحاولة».
- M9: record offers only late/upcoming months (`payableMonths` in payment-draft.ts, tested);
  «غير مستحق» chips disabled. Fixture B-12 joined in June to show it.
- C1/H1/H2: close-campaign sheet counts pending contributions (`pendingForCampaign`) and waits for
  them; the leftover always goes to the fund (no «keep» choice, owner decision). Handover: pending
  payments before submit and accept; accept screen shows «زاد/نقص الرصيد بـ … منذ إرسال التسليم»
  (fund balance − computedBalance at submit; demo submit simulates +1 000).
- P2: M16 «(أوقية قديمة)» + ×10 offer; O4 HEIC message; C3 expense above the fund/campaign balance
  note; E3 member number editable with the swap hint; U5 «login taken» offers a new password for
  that account (demo: the same login twice is taken).
- e2e `e2e/edge-cases.spec.ts` (M9, M16, H1/H2). Shots `/private/tmp/claude-502/sondoq-shots/r17/`
  (script `r17/shots.mjs 390`, incl. the stalled slip via a held demo timer).
- Lane A data (m2-app 4740ca4): record screen shows earlier years' late months (`MemberRow.pastLate`,
  chosen by default, own chip strip), prices each month from `row.prices[ym]` else this year's
  group price (`rowMonths`/`fitRow` in payment-draft.ts, tested), a year with no price blocks
  with «حدد الرسوم الشهرية لسنة … أولًا.»; allocations carry their year. Settings: «الرسوم
  الشهرية لسنة …» (admin, setGroupPrice, from 1 December or when this year has none; demo
  `?prices=1`) and «آخر نسخة احتياطية» (getBackupStatus, admin). Member sheet (admin): «تراجع عن
  آخر تغيير» (cancelLastPeriod) and «تصحيح شهر الانضمام» (setJoinMonth), reason required.
  Fixtures: A-4 late Nov/Dec 2025 at 800; backup ok on 27 Sep.
- m2-app 68e8ddc: member sheet «ادفع من الرصيد» (applyCredit, one id per form, the oldest late
  months the credit covers at the group price; credit from arrears.credit) and «عليه رسوم شهرية
  سابقة لم تُدفع: N · X أوقية» (formerDebtMonths/Amount). Accounts: «غير مربوط بعضو» when
  needsMemberLink, admin «ليس عضوًا» / «إلغاء "ليس عضوًا"» (setCommitteeNotMember). Setup hides
  «لست عضوًا» for admin/treasurer/deputy. Close-campaign sheet has no «keep» option. Fixtures:
  B-12 credit 2 000, B-33 old debt 2 months. e2e: credit, past-year months, settings cards.
- pendingOverlap (m2-app): after saving, «يوجد دفعة أخرى بانتظار التأكيد لنفس الشهر.» is added to
  the snack (demo stub checks its own pending). Demo: the demo user is «ليس عضوًا», a deputy
  «المختار» carries «غير مربوط بعضو»; a demo credit payment lowers the shown arrears and credit.
  Report-images e2e was flaky (the share mock pushed files one by one); it now publishes at once.

## Member access, Lane C (docs/MEMBER-ACCESS.md)
- Home «أنت» (`member-slot.tsx` → lazy `member-card.tsx`): only when the readable `bq_member_on`
  flag exists (`hasMemberFlag`); then the server action `memberHome()` (`member-view-action.ts`)
  reads the session. Home stays static; non-members load none of this code and see Lane B's
  `MemberLinkPaste` (installed app only). Card: name, «أ 3», «أنت منتظم» / «عليك 3 أشهر · 3 000
  أوقية», this year's months as dots (+ key), credit, «دفعة واحدة بانتظار التأكيد», «أرسلت دفعة»,
  «ادفع الآن» (PayTo + amount due), link «دفعاتي».
- «أرسلت دفعة» = `RecordBody` with `member={ selfId, selfName, recent }`: picker «أنت» → «دفعت لهم
  سابقًا» → everyone; screenshot required (CTA «أرفق صورة التحويل», right after months); «كيف
  دفعت؟»; payer defaults to the member; optional «ملاحظة للجنة»; footer «سيُرسل … / أرسل إلى
  اللجنة»; one id per sheet (`sendOnce`) for `memberUploadProof` + `memberSubmitPayment`; result
  snack «أُرسلت إلى اللجنة. ستصلك رسالة عند التأكيد.» (+ pending overlap note). Sheet data loads on
  open (`memberSheetData()`).
- `/me` «دفعاتي» (`(app)/me`, dynamic): card, «بانتظار التأكيد», «مرفوضة» (reason), «دفعاتي
  المؤكَّدة» (receipt link + WhatsApp share), «دفعات أرسلتها لغيري», «هذا الجهاز» (push toggle
  slot, «خروج من هذا الجهاز» → forgetMemberOnThisDevice → memberSignOut). No session: calm empty
  state + paste field.
- Committee: «رابط العضو» in the admin member sheet (`member-link-admin.tsx`): create → URL once +
  «إرسال عبر واتساب» («هذا رابطك الخاص في صندوق الرابطة:» text, member's phone) / copy; «رابط جديد»
  (confirm: the old stops); «إيقاف الرابط»; «آخر استخدام قبل …». Links from `src.memberLinks()`.
  Queue slip: «أرسلها العضو X عبر رابطه» (`submittedByMember`), reject shows «يصل السبب إلى العضو.»
- `/m/invalid` (calm page), `/m/demo` (route handler, demo only: `bq_member=demo` + flag, 303 →
  `/?welcome=1`); `source.memberSession/History/Beneficiaries` serve fixtures for the demo cookie
  (demo member A-3, late July to September; history has a rejected and two confirmed payments).
- One phone, up to 5 people (Lane B `src/lib/member-cookies.ts`, Lane A m25): `/m/switch` (another
  person's link: «هذا الهاتف مفتوح باسم … (أ 3).» / «هذا رابط … (ب 6).», «أضف … وانتقل إليه»,
  «ابقَ باسم …», «لا يضيع شيء…»; a dropped person when full is said before going home); «تبديل:»
  chips in the card (memberSwitch); /me «إزالة X من هذا الهاتف» (only the active one;
  forgetMemberOnThisDevice only when it is the last person).
- Demo: `/m/demo` (A-3) and `/m/demo2` (B-6) go through the real cookie rules (`demo-link.ts`);
  switch/accept/decline/remove are demo server actions on those cookies (`member-view-action.ts`).
  Member writes are simulated in `member-act.tsx` (`useMemberAct`); a submission also lands in the
  demo committee queue (same tab, client navigation). Link create/stop stubs in `act.tsx` (`links`).
- Contracts: `@/lib/data/member` (memberSession, memberHistory, memberRecentBeneficiaries,
  getMemberLinks, memberProfiles, memberPending), `@/lib/data/member-actions`, createMemberLink /
  revokeMemberLink via useAct, Lane B MemberLinkPaste, MemberPushToggle, forgetMemberOnThisDevice.
- Tests: `member-model.test.ts`, `demo-member.test.ts`; e2e `e2e/member-ui.spec.ts` (6) next to
  Lane B's `e2e/member.spec.ts`; suite 61/61 on fixtures.

## Report members grid: a ✓ badge per paid month (owner decision, r19; replaces r18's ● / ○ + ✓ column)
- Shared images, PDF (Lane B's `report-pages.ts`, edited by Lane C for this) and /report on
  phones: no circles. Each of the 12 month cells (header 1–12, January on the right) shows a
  green ✓ badge (filled green disc, white check, like the prototype's ✓) when the month is paid
  (ahead too); empty when unpaid, not owed or still to come. No current-month emphasis in the grid.
  No status text, no separate ✓ column. Group band: name, «68 عضوًا» and the fee (r20), numbers,
  names, striping unchanged.
- Legend «✓ مدفوع» + «1 = يناير … 12 = ديسمبر». The share sheet's «✓ يعني» option and its
  `bq-report-check` setting are gone; share-report.ts renders once per ReportInput again.
- Images: 40 px cells, 14 px badge radius (`memberCols`, unit tested for fit, name ≥ 380 px).
  /report: a 1–12 header per group over 12 grid cells, 18 px badges (12 px in print); row
  aria-label «مدفوع: يناير، …».
- `src/lib/report-check.ts` is now just `monthPaid`. e2e: 1 test in `report.spec.ts` (grid + no
  option), suite 62/62 on fixtures. Shots `/private/tmp/claude-502/sondoq-shots/r19/`.

## «روابط الأعضاء» (owner decision r20, prototype C of proto/member-links)
- `/committee/member-links` (`requireCommittee`, any committee role), linked from the hub menu
  («روابط الأعضاء») and from the top of «الأعضاء». View `src/components/app/member-links.tsx`,
  pure model `member-links-model.ts` (+ test), styles `bq-ml-*`.
- Active members only, by fee group («المجموعة أ» «3/20»), paper order. Header «X من Y أُرسل ·
  بقي Z» + «أرسل للجميع بالترتيب». Rows: number, name (+ ✓ sent / ✓✓ used, from lastUsedAt),
  «بلا رقم هاتف», a filled WhatsApp button when not sent, a soft «رابط جديد» when sent (calm
  confirm «سيتوقف الرابط القديم. أرسل رابطًا جديدًا؟», the old URL cannot be shown again).
  Legend «✓ أُرسل · ✓✓ يستخدمه». Walk card pinned on top (sticky): current member, «أرسل في
  واتساب», «تخطَّ», «إيقاف»; advances after a send; the current row is tinted.
- Send = `createMemberLink` (useAct, safeAct; demo stub) then `location.href = waLink(phone,
  linkMessage(name, url))` in the same tab: a new window after an await is blocked on iOS; wa.me
  opens the app on Android / the in-app sheet in an iOS PWA and the page stays. No phone → wa.me
  without a number (WhatsApp asks whom). Message = the member sheet's `linkMessage` (the three
  owner lines + «افتحه لترى رسومك… لا ترسله لغيرك.», one message for both places).
- e2e `e2e/member-links.spec.ts` (2; wa.me answered 204 so the page stays). Suite 64/64 on
  fixtures. Shots `/private/tmp/claude-502/sondoq-shots/r20/`.

## Report group band without the month count (owner decision r20)
- Image pages and PDF (`report-pages.ts` `drawMembers`): «X من Y دفعوا رسوم …» removed; the band
  keeps «المجموعة أ», then «68 عضوًا» (`membersWord`, tested) and «الرسوم الشهرية: … أوقية».
  /report group headers never had it (name + count). The summary image and /report summary keep
  their paid line (not a group header).

## Report grid like the paper sheet (owner decisions r21, r22: the 6-year paper sheet)
- Images + PDF (`report-pages.ts` `drawMembers`): the green band stays; under it the paper title
  «صندوق رابطة شباب البقيع 2026» (month key on the left), then a fully bordered white table
  (printed-line grey #9AA59F, heavier outer border): «الرقم» | «الاسم» | 1 … 12 (1 next to the
  name), bold header, no zebra. Paid = green ✓ badge in the cell; unpaid or not owed = empty
  white cell (r21's sand tint and its DESIGN.md exception reverted). Under the grid:
  «المجموع: 156 000 أوقية» (group's last page; `paidTotal` = paid months × the member's group
  fee, shown rows) and the legend «✓ مدفوع · خانة فارغة: لم يُدفع».
- Rows 32 px: 28 per phone page, 35 per A4 page (paper: 27), the total always has its room, so
  no extra page just for it (21 members = one page).
- /report: each member's 12 months as a bordered white strip (bold bordered header), ✓ when
  paid, empty otherwise; same legend; `.rp-gtotal` under each group.
- Member link message stays the 4-line `linkMessage` (lead, r21).
- Shots `/private/tmp/claude-502/sondoq-shots/r22/` (r21 = the sand version, superseded).

## Standing brief for Lane C (UI)
- Worktree `.claude/worktrees/ui`, branch `m2-ui`; merge `m2-app` when asked; small commits,
  plain messages, never push, no Co-Authored-By/AI attribution, never commit member data.
- Owned: `src/components/app/**`, `src/app/**` pages/layouts (not `manifest.ts`, `sw.ts`),
  `src/app/globals.css`, `src/components/brand.tsx`, `src/components/ui/**`, DESIGN.md,
  PRODUCT.md, this doc. Not ours: `src/lib/supabase/**`, `src/lib/data/**`,
  `src/components/providers/**`, `src/lib/push*`, `src/lib/offline/**`, `src/lib/share-*`,
  `src/lib/report-pages.ts`, sw, manifest, `public/**`, `next.config.ts`.
- Data seam: `components/app/source.ts` (fixtures when `SONDOQ_FIXTURES=1`; demo mode =
  fixtures and not production). Client writes via `useAct()` (`act.tsx`); every new real action
  needs a demo stub there so demo never writes to the real DB.
- Screenshots: fixtures only (`SONDOQ_FIXTURES=1 pnpm build && pnpm start -p 3400`, demo opens
  /committee without login), saved under `/private/tmp/claude-502/sondoq-shots/rN/`.
- Copy rules: Arabic RTL, no dashes in UI text, numbers «أ 12» / «12» in a group
  (`memberLabel`/`MemberNo`/`Avatar`), fund name «صندوق الرابطة», subtitle «رابطة شباب قرية
  البقيع», report title «تقرير صندوق رابطة شباب البقيع», empty sections are hidden.
- Contracts in use: getMemberIndex/getMemberRows, getRecentPayments, cancelPayment,
  setCommitteeMember, deleteCommitteeAccount (+canDelete), getMyProfile/updateMyProfile/
  signOutEverywhere, push actions via providers/committee-push, AppBadgeSync.

## How to verify
`pnpm check && pnpm build`; sheets: `node /private/tmp/claude-502/sondoq-shots/r14.mjs 390|1280` against the fixtures server. Screenshots: `SONDOQ_FIXTURES=1 pnpm dev -p 3400`; /committee needs a
signed-in committee user, or a temporary UNCOMMITTED bypass in `src/proxy.ts`
(`process.env.SONDOQ_FIXTURES !== "1" &&` in the redirect condition) — revert before committing.
Compare with http://localhost:3100/prototype/direction?variant=M.
