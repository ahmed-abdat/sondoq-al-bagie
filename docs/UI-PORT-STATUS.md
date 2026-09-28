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

## Remaining / next
1. Committee campaign form (createCampaign / updateCampaign / closeCampaign) and campaign
   allocations in the record sheet — actions exist on m2-app, UI not built.
2. Expenses: record-expense sheet (`recordExpense`, `uploadProof` kind "expenses") — not built.
3. Per-member reminders list (`reminderLink` + `logReminder` individual) on /committee; only the
   group reminder is wired.
4. Group prices: `source.groupPrices()` is a constant A 1000 / B 500 — TODO(lane-a) public
   `group_prices` read.
5. Offline "last updated": pages are Server Components (SW caches the HTML); public data is not
   yet mirrored into TanStack Query, so the offline banner has no timestamp from them.
6. Lane A copy: `src/lib/data/reminders.ts` says «حالة الاشتراكات» — must be «الرسوم الشهرية».

## How to verify
`pnpm check && pnpm build`. Screenshots: `SONDOQ_FIXTURES=1 pnpm dev -p 3400`; /committee needs a
signed-in committee user, or a temporary UNCOMMITTED bypass in `src/proxy.ts`
(`process.env.SONDOQ_FIXTURES !== "1" &&` in the redirect condition) — revert before committing.
Compare with http://localhost:3100/prototype/direction?variant=M.
