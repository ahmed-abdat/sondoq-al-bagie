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
- /report for phones: big summary cards, collapsible sections, month dots (مدفوع / متأخر / لم يحن
  بعد; no «مقدَّمًا»), «دفع X من 12 شهرًا». Link preview: /report/opengraph-image (Alexandria from
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

## How to verify
`pnpm check && pnpm build`. Screenshots: `SONDOQ_FIXTURES=1 pnpm dev -p 3400`; /committee needs a
signed-in committee user, or a temporary UNCOMMITTED bypass in `src/proxy.ts`
(`process.env.SONDOQ_FIXTURES !== "1" &&` in the redirect condition) — revert before committing.
Compare with http://localhost:3100/prototype/direction?variant=M.
