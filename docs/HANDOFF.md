# Handoff: how to continue this project

> **بالعربية باختصار:** هذا الملف لأي نسخة من Claude Code تكمل العمل. فيه ما أُنجز، وما بقي بالترتيب، وما يجب طلبه من AHMED، وقواعد المشروع. كل المستندات في مجلد `docs/`.

## Start here

1. Read [DECISIONS.md](DECISIONS.md) first. It records what the owner confirmed, the defaults already adopted, and the open questions.
2. Read the PRD: [prd/PRD-sondoq-al-bagie-v1.md](prd/PRD-sondoq-al-bagie-v1.md) (English). The Arabic version is [prd/PRD-sondoq-al-bagie-v1-ar.md](prd/PRD-sondoq-al-bagie-v1-ar.md).
3. Read [prd/edge-cases-review.md](prd/edge-cases-review.md) (Arabic). It is not merged into the PRD, but its §13 data-model additions are part of the plan (see M1 below).
4. Open [design/prototype.html](design/prototype.html) in a browser. It is the clickable mock-up the owner saw and liked: screens, navigation, colours, and the record-payment flow. It uses sample names only.
5. Read the Next.js 16 docs in `node_modules/next/dist/docs/` before writing Next code (see `AGENTS.md`). Middleware is `src/proxy.ts`.

## People and communication

- **Owner:** AHMED (GitHub `ahmed-abdat`), a committee member. Writes in Arabic and English, and prefers **replies in Arabic**.
- Explain things simply. The committee and members are not technical.
- Never ask for or commit secrets. From Supabase, ask only for the **Project URL** and the **publishable key**. The database password and the `service_role` key stay with the owner, in Vercel/Supabase settings.

## Conventions

- UI text is **Arabic, RTL** (`<html lang="ar" dir="rtl">`), with Western digits (`ar-MR-u-nu-latn`). Fonts are IBM Plex Sans Arabic for body text and Reem Kufi for headings.
- Colours come from the logo: primary green `#237A3B`, gold, and a dark mode. Tokens live in `src/app/globals.css`.
- **Money:** integers in **old ouguiya (MRO)** everywhere in the DB and code. Receipts show new ouguiya (MRU); convert with `mruToMro()` in `src/lib/money.ts`.
- Arrears and totals are **computed in SQL views**, never stored.
- Nothing is hard-deleted. Cancel with a reason, and write every change to `audit_log`.
- Before pushing, run `npm run lint && npm run typecheck && npm test && npm run build`. CI runs the same.
- Tailwind v4 (`@theme inline` in `globals.css`). Vitest for unit tests. Add Playwright when the UI flows exist.

## Stack

Next.js 16 (App Router, TS, `src/`), Tailwind v4, Supabase (Postgres, RLS, Auth email+password for the committee, Storage for receipt images, Realtime), Serwist for the PWA service worker, TanStack Query persisted to IndexedDB for offline read, react-hook-form + zod, browser-image-compression, Recharts, and Tesseract.js (ara+fra, on-device) for receipt reading. Hosting is free Vercel. A keep-alive cron is needed because Supabase free projects pause after 7 idle days.

## Milestones

| # | Deliverable | State |
|---|---|---|
| M0 | Repo, Next.js + Supabase setup, RTL layout, logo/manifest, committee login, `proxy.ts`, CI | **Done** (PR #1) |
| M1 | Schema + RLS + `confirm_payment()` / `cancel_payment()` RPCs, seed groups, import 2026 paper data | Next |
| M2 | Committee: record payment (with receipt OCR), pending queue, confirm/reject, live updates, audit log | |
| M3 | Public page: summary cards, charts, member cards + detail sheet, activity feed | |
| M4 | Arrears screen, WhatsApp reminder / receipt / group-message links, reminder log | |
| M5 | Expenses, PWA install + offline read cache, keep-alive cron, weekly backup | |
| M6 | Donation campaigns (PRD §4.7) | |
| M7 | Pilot with the committee for about 2 weeks, then share the public link | |

## M1 notes (next step)

- Put SQL in `supabase/migrations/` (Supabase CLI format) so it can be applied with `supabase db push`, or pasted into the SQL editor by the owner.
- Use the PRD §5 model **plus** these edge-case additions, which are adopted defaults (see DECISIONS.md):
  - `group_prices(group_id, year, monthly_amount)` instead of `groups.monthly_amount`.
  - `membership_periods(member_id, from, to, status, group_id, reason)`, with status `active | exempt | away | left | deceased`.
  - On `payments`: `paid_on`, `method`, `txn_ref` with a partial unique index `(method, txn_ref)` on non-rejected/cancelled rows, `proof_path`, `proof_hash`.
  - `payment_allocations(payment_id, kind 'months'|'campaign'|'credit', member_id, campaign_id, amount)`. The allocations must sum to the payment amount.
  - `payment_months` is filled only by `confirm_payment()`, with `UNIQUE(member_id, year, month)`. The first confirmation wins, done atomically (`SELECT ... FOR UPDATE`, status must still be `pending`).
  - A payment that covers the treasurer's own membership cannot be confirmed by the treasurer. Link `committee.member_id` to check this.
  - Grace period: a month is due after day 10.
- Roles are `admin`, `treasurer`, `deputy` and `committee`. RLS: the public (anon) can only read views that expose no phone numbers and no proof images. The committee writes through RPCs.
- Add tests for the SQL, e.g. run Postgres in Docker in CI, or use pgTAP.
- Import: the 2026 paper sheets become a CSV (`number, name, group, m1..m12`). Each tick becomes a confirmed payment with method `سجل ورقي` and no proof. Ask AHMED for the data; it is not in the repo.

## Receipt reading (for M2)

The recommendation and the benchmark are in [research/receipt-ocr/free-ocr-benchmark-ar.md](research/receipt-ocr/free-ocr-benchmark-ar.md). Earlier results are in `results.md`, and the scripts are in `research/receipt-ocr/`.
- Tesseract.js **ara+fra**, running in a Web Worker on the phone, reads the receipt. Language data comes from npm `@tesseract.js-data/*`, not the CDN, which was blocked in testing.
- If the field checks fail, it does a second pass with image preprocessing.
- Per-wallet rules:
  - **Bankily:** 19-digit ID, MRU.
  - **Sedad:** `TR` + 11 digits (OCR may read `TRO`; fix O→0), with the amount like `1.500,00`.
  - **Masrvi:** 9-digit reference, recipient name only.
- The result must pass these checks: the amount equals the expected dues, and the recipient is the fund's number or name.
- Show a confirmation screen before saving. The manual fallback is the amount plus the last 6 digits of the transaction ID.
- The benchmark scored 164/168 fields on 32 distorted images. On a simulated low-end phone a read takes about 6.5 s.
- Phone numbers and recipient names in the fixtures are redacted, and the receipt images are not in the repo.

## Where things came from

The work was done in a Claude project with the owner. These files are copies of that project's shared files:
- `/mnt/project-files/prd/`
- `/mnt/project-files/research/`
- `/mnt/project-files/brand/`

The published prototype is at https://claude.ai/artifact/HE1tM5WA2K2XCKGCBodvTX, and the OCR phone-test page at https://claude.ai/artifact/VNohahE5jTJhuy7yHHBoQC. Both are private to the owner's account.
