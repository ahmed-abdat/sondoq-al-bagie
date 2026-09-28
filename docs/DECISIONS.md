# Decisions

What has been decided, by whom, and what is still open. Read this before the PRD: some items here override or extend it.

## Confirmed by AHMED (committee member, project owner)

- Two member groups: **A = 1000 MRO/month**, **B = 500 MRO/month**. Months 1–12 = January–December.
- Any mark on the paper sheet (X or +) means the month was paid.
- The UI must be very simple: most members are not technical. Arabic, right to left.
- PWA that opens offline with the last data; writing needs internet. No offline write sync.
- Members submit a payment, the committee approves it. Two committee members must never confirm the same payment twice.
- Reminders and receipts go through WhatsApp. v1 uses free prefilled `wa.me` links (see [research/whatsapp-reminders.md](research/whatsapp-reminders.md)).
- Donation campaigns ("تبرع خاص") are part of v1 (milestone M6).
- The design must be modern (cards, charts), **not** a copy of the paper grid.
- The official logo must be used (`public/logo.jpg`, `docs/design/logo-rabita-albaqie.jpg`).
- Receipt reading must be **free**: no paid or cloud AI models. On-device Tesseract.js (see [research/receipt-ocr/free-ocr-benchmark-ar.md](research/receipt-ocr/free-ocr-benchmark-ar.md)).
- 2026-09-28: "go ahead" to build. Repo created by AHMED.

## Defaults Claude adopted while building (told to AHMED; change only if the committee says so)

1. Money is stored as whole numbers in **old ouguiya (MRO)**. Wallets show new ouguiya (MRU); the form lets you enter MRU and converts ×10.
2. A month is marked paid only when paid in full. Any extra becomes **credit** for the member.
3. One transfer can be **split** across monthly subscriptions and a campaign (payment allocations).
4. The wallet **transaction number is unique per wallet**, to catch the same screenshot recorded twice.
5. Member status by period: **active, exempt, away, left, deceased**. Only active months count as owed. Deceased members are never reminded.
6. Group prices are stored **per year** (`group_prices`). Arrears carry over into the next year.
7. A month counts as late after a **10-day grace period** (the edge-case review suggested 15; 10 was what AHMED was told).
8. A named **deputy** can confirm when the treasurer is away. A payment that covers the treasurer's own membership must be confirmed by someone else.
9. **Weekly automatic backup** export (Supabase free tier has no restorable backups).

## Still open (ask AHMED / the committee)

- Is Sedad's "1.500,00 أوقية" in new ouguiya (MRU)? Assumed yes.
- Does anyone join mid-year? (Arrears then start from the join month; the schema supports it.)
- Opening balance of the fund at the start of 2026.
- Should the public page show amounts owed per person, or only paid/behind? Edge-case review recommends names and status only.
- The paper page for members 21–27 was never received.
- A larger or transparent PNG of the logo for the app icon.
- The remaining committee questions in [prd/edge-cases-review.md §12](prd/edge-cases-review.md) (transfer fees, annual payment deadline, number of admins).
