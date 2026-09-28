# UI port status (Lane C, branch m2-ui)

Porting prototype «M» (proto worktree: src/app/prototype/direction/variant-m.tsx, receipt.tsx)
into production code. Token source: DESIGN.md + .impeccable/design.json (merged from m2-app).
Data types: src/lib/data/types.ts (merged from m2-app, Lane A — do not edit).

## Done
- m2-app merged (types.ts, DESIGN.md).
- `src/app/globals.css`: full token set (green ramp, gold, neutrals, one red, radii, green-tinted
  shadows, motion vars, type scale 14/17/22/28/40/56 as `text-label/body/title/headline/figure/display`),
  legacy + shadcn token mapping (providers/offline banner/ui primitives still compile), and every
  prototype component style ported under a `bq-` prefix (`vm-` → `bq-`, receipt `rc-` not yet).
  Coordinator drift fixes already applied in CSS: switch off-track #8A968F (≥3:1), one red
  (#8A3B2F on #F6E9E6), green-tinted snack shadow, no !important, no dead success-screen CSS,
  month picker sub-label 14px, badge 14px, tab VT via React `<ViewTransition>` classes
  `tab-fwd`/`tab-back`, nav/aside anchored (`bq-bnav`, `bq-rail`, `bq-aside`).
- Verified: CSS compiles through @tailwindcss/postcss.

## Remaining, in order
1. Pure helpers `src/components/app/derive.ts` (+ tests): month names (standard MSA list — do NOT use
   `monthName()` from src/lib/dates: Intl ar-MR gives «شتمبر/أغشت/دجمبر»), monthsWord, monthCount,
   monthsLabel, monthsInWords (runs), amountInWords, memberState (ahead/ok/late from
   MemberStatus.monthsBehind/monthsPaidThisYear), lateLabel, maskTxn («•••• 2917»), normalizeAr +
   searchMembers, dayWords/dayDate/clock/dotDate (UTC), relativeAgo, groupLabel, categoryLabel.
2. `qr.ts` (port qrMatrix from receipt.tsx) + test; `receipt-model.ts`: ReceiptView + mappers from
   VerifiedReceipt and PendingPayment (+ tests).
3. `fixtures.ts` (71 fictional members, A 1000 / B 500, ~45% full year, ~37% none, rest partial;
   today 2026-09-28) returning types.ts shapes; `source.ts` (server-only reads, the ONLY fixture
   importer, TODO swap to "@/lib/data"): getFundSummary, getFundInfo, listMembers, listMemberMonths,
   getMonthly, listExpenses, listExpenseTotals, getCampaigns, listContributions, listLedger,
   listPending, listFundAccounts(+admin), listArrears, verifyReceipt, getCommitteeSession (supabase
   getUser, role TODO). `mutations.ts` (client, optimistic stubs → ActionResult; TODO Lane A actions):
   confirm/reject/undo/recordPayment/recordExpense/settings.
4. Components in `src/components/app/`: icons, Num/Roll, AppShell (Link + usePathname, transitionTypes
   tab-fwd/back, optimistic pill idx, badge, rail, SnackProvider), Hero (+compact bar IO), Reveal,
   MemberRow, StatusTag, MethodBadge, Track, Segmented, Sheet (drag/velocity/interruptible, VT morph),
   MemberSheet, Receipt/Stamp/ConfirmedMark/Proof/Qr (port rc- CSS with the drift fixes: system type
   scale, muted #4F5C55, primary #1A5F2E, reject chip tonal, nothing <14px, rejected stamp #8A3B2F),
   PayTo, MonthBars, EmptyState, PendingSlip, RecordPayment/RecordExpense/AddAccount sheets,
   receipt PNG share (TODO swap to Lane B src/lib/share-receipt.ts).
5. Routes: move page.tsx → `(public)/page.tsx`; `(public)/{members,accounts,donations}`;
   `(public)/layout.tsx` + `(committee)/layout.tsx` (AppShell + aside hero); `(committee)/committee`
   (queue, follow-up, FAB) and `/committee/settings`; `/r/[code]` (dynamic, no-store); restyle
   `/login` (gate look). Delete old `src/app/committee/page.tsx`. Pages wrap content in
   `<ViewTransition enter/exit={{'tab-fwd','tab-back',default:'none'}} default="none">`.
6. Offline: disable writes with `useOnline()` + `<OfflineWriteHint/>`.
7. pnpm lint / typecheck / test / build; Playwright screenshots at 390 + 1280 on `pnpm dev -p 3400`.

## Known issues / gaps to raise with Lane A (types.ts)
- No public ledger type with amount/method/receipt code for «آخر العمليات» (ActivityItem.payment_confirmed
  has no amount, method, id or receipt code) → UI-only `LedgerEntry` type needed.
- No campaign contributions list type («آخر المساهمات»).
- VerifiedReceipt lacks confirmedByName/role and masked txn (last 4) used by the public receipt.
- FundAccount has no `active` flag for the committee settings toggle.
- PendingPayment has no receipt number/code (fine while pending; confirm action should return them).
- /committee is behind proxy auth: for screenshots, temporarily patch (do not commit) or log in.

## How to verify
`pnpm lint && pnpm typecheck && pnpm test && pnpm build`; `pnpm dev -p 3400`, screenshot routes at
390×844 (dpr 2) and 1280×800 with the pattern in ../foundation/shot.tmp.mjs; compare with
http://localhost:3100/prototype/direction?variant=M.
