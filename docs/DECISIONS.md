# Decisions

What has been decided, by whom, and what is still open. Read this before the PRD: some items here override or extend it.

## Confirmed by AHMED (committee member, project owner)

- Two member groups: **A = 1000 MRO/month**, **B = 500 MRO/month**. Months 1–12 = January–December.
- Any mark on the paper sheet (X or +) means the month was paid.
- The UI must be very simple: most members are not technical. Arabic, right to left.
- PWA that opens offline with the last data; writing needs internet. No offline write sync.
- ~~Members submit a payment, the committee approves it.~~ Since 2026-09-30 the committee records every payment from the WhatsApp screenshot, confirmed at once (see below). Two committee members must never confirm the same payment twice.
- ~~Reminders and receipts go through WhatsApp (`wa.me` links).~~ Since 2026-09-30: no individual reminders and no receipts; the committee shares «المتأخرات» and reports in the WhatsApp group (see below).
- Donation campaigns ("تبرع خاص") are part of v1 (milestone M6).
- The design must be modern (cards, charts), **not** a copy of the paper grid.
- The official logo must be used (`public/logo.jpg`, `docs/design/logo-rabita-albaqie.jpg`).
- Receipt reading must be **free**: no paid or cloud AI models. On-device Tesseract.js (see [research/receipt-ocr/free-ocr-benchmark-ar.md](research/receipt-ocr/free-ocr-benchmark-ar.md)).
- 2026-09-28: "go ahead" to build. Repo created by AHMED.

## Committee-only app (AHMED, 2026-09-30)

Full plan: [COMMITTEE-ONLY-PLAN.md](COMMITTEE-ONLY-PLAN.md). Supersedes the member-facing parts above
and retires [MONEY-PRIVACY.md](MONEY-PRIVACY.md) and [MEMBER-ACCESS.md](MEMBER-ACCESS.md).

- **Committee only.** No public pages, member links or receipt check; visitors see only `/login`.
  Members get information from what the committee shares on WhatsApp.
- **Two levels.** Every committee member: record payments (confirmed at once; cash, paper, levy
  shares, contributions), expenses, credit, member name/phone/note, settings, fund wallets, all
  reads and reports, undo his own record within 30 s. **«مسؤول»** only: committee accounts,
  handover (alone, no second person), add a member and change status / group / join month,
  cancel payments and expenses (with a reason, audited), campaigns and levies, fee groups.
- **No receipts.** No receipt screen, image or share; «سُجّلت الدفعة ✓» + «تراجع» (30 s).
- **No individual reminders.** No phone numbers needed; «شارك المتأخرات» (no amounts) for the group.
- **Everything is visible to the committee:** who recorded, cancelled or changed what, and when
  («سجل العمليات»). Push to the other committee members on new records; each chooses the kinds.
- **«اللوحة» (mandatory levy):** a fixed share per member (optional group-B amount, per-member
  override); paid in full in one payment; unpaid shares stay a debt until paid or exempted
  (reason, audited); a closed levy still takes shares (the money goes to the fund).
- **Money model:** main fund = opening + fees − main expenses + transfers + adjustments; campaign
  and levy money stays with the campaign until spent or moved. Reports count the whole association
  (closing = fund + campaigns held).
- **Reports:** a year by default («شهر» optional); months table and «المتأخرات» always a full year;
  «المتأخرات» never shows amounts.
- **«الإحصاءات»:** counts and percentages, never names. Last year is compared as it stood on the
  same day a year ago; no comparison before the first recorded payment (2026-09-28).
- **Fee groups («الفئات»):** «مسؤول» only; a move starts at a month (default January next year),
  past months keep their fee, never over paid or waiting months; list numbers never change.
- **Accuracy first, then ease.** No wrong or misleading number anywhere (`accuracy_audit()`, daily
  on production); fewest taps for every job.

## Defaults Claude adopted while building (told to AHMED; change only if the committee says so)

1. Money is stored as whole numbers in **old ouguiya (MRO)**. Wallets show new ouguiya (MRU); the form lets you enter MRU and converts ×10.
2. A month is marked paid only when paid in full. Any extra becomes **credit** for the member.
3. One transfer can be **split** across monthly subscriptions and a campaign (payment allocations).
4. The wallet **transaction number is unique per wallet**, to catch the same screenshot recorded twice.
5. Member status by period: **active, exempt, away, left, deceased**. Only active months count as owed. Deceased members are never reminded.
6. Group prices are stored **per year** (`group_prices`). Arrears carry over into the next year.
7. A month counts as late after a **10-day grace period** (the edge-case review suggested 15; 10 was what AHMED was told).
8. ~~A named **deputy** can confirm when the treasurer is away; own membership confirmed by someone else.~~ Superseded 2026-09-30 by the two levels below (no confirmation step, no own-membership rule).
9. **Weekly automatic backup** export (Supabase free tier has no restorable backups).

## Still open (ask AHMED / the committee)

- Is Sedad's "1.500,00 أوقية" in new ouguiya (MRU)? Assumed yes.
- Does anyone join mid-year? (Arrears then start from the join month; the schema supports it.)
- Opening balance of the fund at the start of 2026.
- Should the public page show amounts owed per person, or only paid/behind? Edge-case review recommends names and status only.
- The paper page for members 21–27 was never received.
- A larger or transparent PNG of the logo for the app icon.
- The remaining committee questions in [prd/edge-cases-review.md §12](prd/edge-cases-review.md) (transfer fees, annual payment deadline, number of admins).
