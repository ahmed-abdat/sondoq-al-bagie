# Product

The app's name is **«صندوق الشباب»** (the fund of رابطة شباب قرية البقيع; owner, 2026-09-28).

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Both audiences carry equal weight in v1 (owner, 2026-09-28):
- **Members (~71)** of رابطة شباب قرية البقيع. They open one public link, usually shared in the WhatsApp group, on cheap Android phones with weak internet. They want the fund balance, who is paid up or behind, and their own months. No login. Most are not technical.
- **Committee (3–6 people)**: the treasurer (أمين الصندوق), who holds the money and confirms payments; a named deputy; committee members (مشرف); and an admin (AHMED at first). They record payments with a screenshot, confirm or reject them, send WhatsApp reminders and receipts, record expenses, and run donation campaigns. They sign in with email and password.

## Product Purpose
It replaces the paper grid (member × 12 months), which is ticked by hand from WhatsApp screenshots. Every payment is recorded with proof and confirmed once, so it can never be double counted. Arrears are computed, never counted by hand. Every member can see where the fund stands. Success means the committee stops using paper, members stop asking "how much is in the fund?" and "did my payment count?", and nobody can say "nobody told me".

## Positioning
A transparency tool built for one village fund, not a generic finance app. It follows the association's real rules: groups A and B, amounts in old ouguiya, local wallets (Bankily, Masrvi, Sedad), WhatsApp as the channel, and the treasurer as the one who confirms. It never holds or moves money.

## Operating Context
- A member transfers money with a wallet, and the screenshot is posted in the WhatsApp group. A committee member records it in the app, and the treasurer confirms it. After that, a receipt goes out via a prefilled `wa.me` link.
- Committee members often act at the same time. The first confirmation wins, and live updates show confirmations made by others.
- The app works offline for reading only: it shows the last data with a "last updated" banner. Writes need internet.
- Receipt screenshots are read on the phone with Tesseract.js (ara+fra). The user checks the result before saving.
- Paper sheets for 2026 exist and will be imported. Members 21–27 are missing a page.

## Capabilities and Constraints
- Stack (existing): Next.js 16, Tailwind v4, Supabase (Postgres + RLS, Auth, Storage, Realtime), Serwist PWA, Vercel free tier.
- Arabic only, RTL, Western digits (`ar-MR-u-nu-latn`).
- Money is stored as integers in old ouguiya (MRO). Receipts show new ouguiya (MRU), which is multiplied by 10.
- Nothing is hard-deleted. Cancelling needs a reason, and every change goes to the audit log.
- The public view never exposes phone numbers or receipt images.
- **Open:** whether the public page shows the amount owed per person. The committee decides later, so there is a switch, off by default.
- **Open:** the copy register (simple standard Arabic, Hassaniya flavour, or formal). It will be chosen by comparing prototypes.
- **Open:** brand personality (official, warm and communal, or modern and energetic). It will be chosen by comparing prototypes.
- Out of scope for v1: members uploading their own receipts, automated WhatsApp sending, app-store apps, online payments.

## Brand Commitments
- The association's official logo must be used (`public/logo.jpg`, `docs/design/logo-rabita-albaqie.jpg`). Its colours are green and gold.
- The design must be modern (cards, charts) and **not** a copy of the paper grid.
- The owner saw and liked the clickable prototype `docs/design/prototype.html`. Treat it as evidence of the flows they approved, not as a locked visual world.

## Evidence on Hand
- PRD in English and Arabic, the edge-case review and the decisions log in `docs/`.
- Receipt-OCR benchmark and scripts in `docs/research/receipt-ocr/`.
- Real member names, phone numbers, receipt screenshots and paper sheets are **not** in the repo and must never be committed. Use fictional names in designs and demos.
- There are no testimonials or usage numbers yet. Do not invent any.

## Product Principles
1. **Proof over trust.** Every number traces back to a confirmed payment with its screenshot and the name of whoever confirmed it.
2. **Simple enough for everyone.** One action per screen, short words, and nothing a non-technical member has to learn.
3. **Transparent, but no shaming.** Show where the fund stands without exposing private data. Personal amounts owed stay hidden unless the committee decides otherwise.
4. **Built for the real phone.** Cheap Android devices, weak networks, offline reading, and WhatsApp as the way people talk.
5. **Never double counted.** Concurrency and correctness are enforced by the server, not by people being careful.

## Accessibility & Inclusion
- Mixed literacy and ages: large type, high contrast, touch targets of at least 44px, and icons paired with words.
- Must work on low-end Android phones over weak or no connectivity.
- Must respect reduced-motion settings.
