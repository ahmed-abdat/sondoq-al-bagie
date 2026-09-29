# صندوق الرابطة — PRD v1

Owner: AHMED (committee member, 2026 term) · Status: draft for approval · Date: 2026-09-28

## 1. Problem

The youth fund of **رابطة شباب قرية البقيع** (~71 members) collects monthly subscriptions in old ouguiya (MRO):

| Group | Monthly | Yearly |
|---|---|---|
| A | 1000 | 12000 |
| B | 500 | 6000 |

Today: a member sends money to the treasurer's wallet (Bankily, Masrvi, …), posts a screenshot in the WhatsApp group, and the treasurer ticks a paper grid (member × 12 months). Page totals are summed by hand, and other committee members keep a copy to cross-check.

Pain points seen on the 2026 sheets:
- A tick is not linked to its screenshot, wallet, or who confirmed it.
- Ticks drift onto the wrong row; members get added by hand under the table.
- Arrears only appear by counting empty boxes. There is no reminder history, so a member can say "nobody told me".
- Members cannot see the fund balance or their own status without asking.

## 2. Goals (v1)

1. The committee records and confirms every payment with proof, with no double counting, even when several admins act at once.
2. Any member opens one link (no login) and sees the fund balance plus who is paid up or behind.
3. Arrears are always computed, never counted by hand.
4. WhatsApp reminders and receipts go out in one tap, and every reminder is logged with its date.
5. The committee can open a **one-off donation campaign** (تبرع) for a specific purpose, with a target amount and chosen contributors, tracked separately from the monthly fund.
6. The app works on cheap Android phones with weak internet, is installable (PWA), is fully in Arabic (RTL), and is readable offline.

**Non-goals for v1:** member self-service upload (v2), automatic WhatsApp sending via the Cloud API (v2), native app-store apps, online payment processing.

## 3. Users and roles

| Role | Who | Can |
|---|---|---|
| Treasurer (أمين الصندوق) | 1 committee member holding the money | Everything, including **confirm/reject** payments |
| Committee (مشرف) | 2–5 others | Record payments (stay *pending*), record expenses, send reminders, view everything and the audit log |
| Admin | AHMED (initially) | Manage members, groups, committee accounts, seasons |
| Public | Any member with the link | Read-only: balance, totals, the names/months grid with status colours. No phone numbers, no screenshots. |

Only the treasurer confirms, because the treasurer is the one who actually received the money. This is configurable, so more confirmers can be allowed.

## 4. Core flows

### 4.1 Record a payment (committee)
1. Tap **"تسجيل دفعة"**.
2. Choose who it covers: one or several members, e.g. a brother paying for himself and a relative. Type-ahead search by name or number.
3. For each member choose the months: **"السنة كاملة"**, **"الأشهر المتأخرة"**, or tap specific months on a 12-box strip. The amount is computed from the group price and shown big.
4. Choose the wallet (Bankily / Masrvi / Sedad / نقدًا / أخرى) and attach the screenshot. The image is compressed on the phone before upload.
5. Save. Status is **pending** if saved by a non-treasurer, or **confirmed** directly if saved by the treasurer.

### 4.2 Confirm (treasurer)
- A **"بانتظار التأكيد"** queue shows each payment with its screenshot, members and months, and **تأكيد / رفض** buttons (a reason is required when rejecting).
- Confirmation is **atomic on the server**:
  - It succeeds only if the payment is still `pending` and none of its months are already paid.
  - The first action wins. Anyone later sees "أكّدها فلان الساعة ١٠:٢٥" and nothing changes.
  - A month can never be paid twice: the database enforces a unique rule on (member, year, month).
- After confirming, a **"أرسل الإيصال"** button opens WhatsApp with a prefilled receipt to the payer.

### 4.3 Arrears and reminders
- Arrears for a member = months from January (or their join month) up to the current month that are not paid, × the monthly price.
- The **"المتأخرات"** screen lists members sorted by amount owed, with a **"ذكّر"** button. It opens `wa.me/<phone>?text=…` with a message giving the member's name, the months and the amount.
- **"رسالة المجموعة الشهرية"** generates one message listing everyone behind (names and amounts), for pasting into the WhatsApp group.
- Every reminder tap is logged (member, who, when, channel).

### 4.4 Expenses (minimal in v1)
- Record an expense: activity (التدريس / التكريم / الرياضة / أخرى), amount, date, note, and an optional receipt photo.
- Balance = opening balance + confirmed payments − expenses.

### 4.5 Public page (member view)
A modern dashboard, not a copy of the paper sheet (see §7):
- **Top summary cards:**
  - fund balance (large),
  - collected this year,
  - spent this year,
  - members up to date vs behind (ring chart).
- **"أين ذهب المال؟"**: spending by activity (donut chart) and a short list of recent expenses.
- **Monthly collection chart**: a bar chart of collected vs expected per month.
- **Open campaigns**: cards with a progress bar and the % reached.
- **Members**: a searchable list of cards. Each card shows:
  - name and group,
  - a status chip (منتظم / متأخر),
  - a small progress ring ("٨ من ١٢ شهرًا"),
  - the amount owed, if the committee enables it.
  - Tapping a card opens a bottom sheet with the member's 12 months as a timeline of dots and their payment history.
- **Recent activity feed**: e.g. "تم تأكيد دفعة • منذ ساعة". It builds trust without exposing screenshots.
- Filters as chips: الكل / المتأخرون / A / B. A "آخر تحديث" timestamp.

### 4.6 Offline behaviour
- The app shell and the last fetched data are cached on the device. With no internet the app opens, shows the data, and displays a banner: "غير متصل — آخر تحديث قبل ساعتين".
- **Writes need a connection** in v1. Buttons are disabled offline with an explanation. This removes the sync-conflict class entirely: the server is the single source of truth.
- While online, committee screens receive live updates (another admin's confirmation appears without a refresh).

### 4.7 Donation campaigns (تبرع خاص)
Sometimes the fund is short, or the committee does not want to draw on it, so it asks for a one-off contribution for a specific purpose (e.g. equipment for the team, a prize ceremony).

**Create a campaign ("تبرع جديد"):**
- Title, purpose, target amount, optional deadline.
- **Who contributes:**
  - everyone,
  - one group (A or B),
  - or hand-picked members.
- **How much each person pays:**
  - the same fixed amount for all,
  - an amount per group (e.g. A 2000 / B 1000),
  - a custom amount per person,
  - or **open** (any amount, voluntary).
- Outsiders can also give. Their payments are recorded with a free-text name (e.g. "محسن من القرية").

**Collect:**
- Payments use the same flow as 4.1/4.2: record with proof, then the treasurer confirms atomically. The only difference is that a payment is linked to the campaign instead of to months.
- A payment can cover several participants (a brother paying for his family).
- Paying less than the assigned amount leaves the rest as the participant's remaining balance on that campaign. It never touches monthly arrears.

**See progress:**
- A progress bar shows collected / target and the % reached.
- Lists show who paid, who hasn't, and remaining amounts.
- The WhatsApp buttons work as before: a group message announcing the campaign, per-person reminders, and receipts.

**Money:**
- Each campaign has its own balance: confirmed contributions − expenses tagged to it.
- When a campaign is closed, the committee chooses what to do with any surplus: transfer it to the main fund (recorded as a transfer) or keep it for a later use.
- The public page shows open campaigns with their progress bar and paid/unpaid list.

### 4.8 Audit log
Every create, confirm, reject, edit and delete writes a row: who, what, before/after, when. Nothing is hard-deleted. A payment is cancelled via **"إلغاء"** with a reason, which frees its months.

## 5. Data model (Postgres)

```
groups           id, name ('A'|'B'), monthly_amount int
members          id, number int unique, full_name, phone, group_id, joined_on date, active bool, note
seasons          year int pk, opening_balance int, closed bool
committee        user_id (auth), display_name, role ('treasurer'|'committee'|'admin'), active
payments         id, campaign_id null, payer_name, method, amount int, proof_path, status ('pending'|'confirmed'|'rejected'|'cancelled'),
                 note, created_by, created_at, decided_by, decided_at, reject_reason
payment_months   payment_id, member_id, year, month (1-12), amount int
                 UNIQUE (member_id, year, month) WHERE status_active   -- partial unique index
campaigns        id, title, purpose, target_amount int, deadline date, amount_mode ('fixed'|'per_group'|'custom'|'open'),
                 status ('open'|'closed'), surplus_action ('to_fund'|'keep'|null), created_by, created_at
campaign_members campaign_id, member_id, expected_amount int null      -- null when amount_mode = 'open'
                 UNIQUE (campaign_id, member_id)
campaign_contributions payment_id, campaign_id, member_id null, donor_name null, amount int  -- inserted on confirm
transfers        id, from_campaign_id, to_fund bool, amount, created_by, created_at
expenses         id, year, campaign_id null, activity, amount, spent_on, note, receipt_path, created_by, created_at, cancelled
reminders        id, member_id, kind ('individual'|'group'|'receipt'), sent_by, sent_at
audit_log        id, actor, action, entity, entity_id, before jsonb, after jsonb, at
```

Rules:
- Arrears and totals are **computed** (SQL views), never stored.
- `payment_months` rows for pending payments are held in a `pending_months` jsonb on the payment and only inserted by the `confirm_payment()` function inside one transaction. The unique index therefore guards confirmed months only.
- Money is stored as integers in MRO.
- Main fund balance = opening + confirmed monthly payments − fund expenses + transfers from campaigns. Campaign balances are computed separately, so the two pots never mix.

## 6. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | One codebase for public page, committee app and API. Server components keep the public page fast on weak networks. |
| UI | **Tailwind CSS + shadcn/ui**, `dir="rtl"`, font **IBM Plex Sans Arabic** or **Tajawal** | Tailwind logical properties (`ms-`, `pe-`) make RTL painless. shadcn gives accessible big-button components we own. |
| Backend | **Supabase** (Postgres, Auth, Storage, Realtime, RLS) | Real relational DB for the unique-month rule and atomic `confirm_payment()` RPC. Row-Level Security enforces roles in the DB. Realtime gives live sync between admins. Storage holds screenshots. The free tier is enough. |
| Data fetching / offline cache | **TanStack Query** persisted to IndexedDB | Instant open offline with the last data, refetch when back online. |
| PWA | **Serwist** (`@serwist/next`) | Maintained successor of next-pwa: installable app, cached shell. |
| Charts / motion | shadcn/ui charts (Recharts) + Motion (framer-motion) | Modern, RTL-friendly charts and subtle animations |
| Forms / validation | react-hook-form + zod | Same schemas on client and server. |
| Image compression | `browser-image-compression` | Screenshots go from ~1 MB to ~150 KB, saving the storage quota and members' data. |
| Hosting | **Vercel** (free) + Supabase (free) | Zero cost. A custom domain is optional (~10 USD/year). |
| Auth | Supabase email + password for committee accounts (≤ 6 people), created by the admin | SMS OTP costs money and is unreliable. Members don't log in in v1. |
| Testing | Vitest for arrears/allocation logic, Playwright for a smoke test of record → confirm | |

Free-tier notes:
- Supabase free projects pause after 7 days with no activity. A daily ping from a Vercel cron or GitHub Action keeps it awake.
- The 1 GB of storage holds ~6000 compressed screenshots, which is years of use.

Alternatives considered:
- **Google Sheets + Apps Script**: no real concurrency safety or roles, and a poor phone UI.
- **PocketBase**: simple, but it needs a server we'd have to host.
- **Firebase**: fine, but Firestore makes the "month paid once" rule and the SQL reports harder than Postgres does.
- **Flutter / native apps**: app-store friction for 71 non-technical users. A PWA link in WhatsApp is easier.

## 7. Design and UX principles

The app should feel like a modern app, not a digitised paper sheet. It uses current UI patterns to make the money easy to understand at a glance, while staying usable by members who are not comfortable with technology.

**Visual style**
- **Official logo:** the association's logo (green disc, gold crescent, star, "تعاون – نجاح – تميّز"), file `/mnt/project-files/brand/logo-rabita-albaqie.jpg`. It is used for the app icon, the splash screen, the header and the public page. The palette follows it: logo green `#237A3B` as primary, crescent gold `#E8B30E` as accent, white.
- Clean, card-based layout, generous spacing, soft shadows and rounded corners. One accent colour taken from the association's logo (green/gold), with neutral backgrounds.
- A modern Arabic typeface (IBM Plex Sans Arabic or Tajawal), large text (≥ 18px body) and a clear hierarchy: the one number that matters is always the biggest thing on screen.
- Light and dark mode.
- Status is shown with colour **and** icon/text, never colour alone (green ✓ منتظم, amber جزئي, red متأخر).

**Show, don't make people count**
- Charts replace tables where they explain better:
  - progress rings and bars for "how much of the year is paid",
  - bars for monthly collection,
  - a donut for spending by activity,
  - progress bars for campaigns.
- Every number has a plain-language label and, where useful, a comparison (e.g. "٧٥٪ من المتوقع هذا الشهر").
- Empty states explain what will appear, and skeleton loaders cover slow networks.

**Easy to use**
- Mobile-first, with bottom navigation of 4 tabs at most: الرئيسية / الأعضاء / التبرعات / المزيد (the committee sees الانتظار instead of المزيد).
- One primary action per screen, big tap targets (≥ 48px), and bottom sheets instead of new pages for details and quick actions.
- Guided multi-step flows (stepper) for recording a payment or creating a campaign, with a clear summary before saving.
- Instant feedback: toasts, an **undo** window after actions, and gentle micro-animations (Motion) that respect "reduce motion".
- Quick search everywhere by name or number, and filter chips instead of dropdowns.
- The public page needs zero taps to be useful: open the link and the answer is on screen.

**Committee power view**
- The committee also gets a compact **heatmap** (members × months) for fast scanning and bulk checks. It is an optional view, not the main design.

**Transparency by design**
- The balance equation is always visible: opening + collected − spent (+ campaign transfers).
- An activity feed and audit log are available, with "آخر تحديث" shown on every screen.
- Privacy: no phone numbers or screenshots on public screens.

**Quality bar**
- Accessible contrast (WCAG AA), works on small Android screens (360px) and slow 3G.
- Before building the screens, a short design pass: key screens (home, member sheet, record payment, campaign) in Figma or as a clickable prototype, reviewed with the committee.

## 8. Data migration

- Transcribe the 2026 paper sheets into a CSV (`number, name, group, m1..m12`) and import them with a seed script. Imported ticks become confirmed payments with the method set to "سجل ورقي" (paper record), no proof, and a note.
- The page for members 21–27 was not in the photos yet.
- A phone number for each member is needed for reminders. It can be filled progressively.

## 9. Milestones

| # | Deliverable |
|---|---|
| M0 | Repo, Next.js + Supabase setup, RTL layout, auth for committee, CI (lint, typecheck, tests), deploy preview |
| M1 | Schema + RLS + `confirm_payment()` / `cancel_payment()` RPCs, seed groups, import 2026 CSV |
| M2 | Committee: record payment, pending queue, confirm/reject, live updates, audit log |
| M3 | Public page: summary cards, charts, member cards + detail sheet, activity feed |
| M4 | Arrears screen, WhatsApp reminder / receipt / group message links, reminder log |
| M5 | Expenses (main fund), PWA install + offline read cache, keep-alive cron |
| M6 | Donation campaigns: create (all / group / selected, fixed / per-group / custom / open amounts), collect via the same confirm flow, progress bar, campaign balance, close + surplus transfer |
| M7 | Pilot with the committee for ~2 weeks, fix issues, then share the public link in the group |

## 10. v2 backlog

- Member self-service "دفعت" button: pick own or a relative's name, upload the screenshot, and it lands in the same pending queue. Identity is by phone number plus a simple PIN.
- Automatic monthly reminders and receipts via the WhatsApp Cloud API. Utility templates cost ~0.004 USD/message in "Rest of Africa", under 1 USD/month. This needs a dedicated number, a Meta business account, approved templates and an international card.
- Year-end report (PDF) and handover to the next committee; season close.
- Queued offline writes, if the pilot shows a real need.

## 11. Success metrics

- 100% of 2026 payments in the app, with the paper sheets retired by the end of the pilot.
- Zero double-counted months, which the database enforces.
- A monthly group reminder sent every month, with a log to prove it.
- Committee members stop asking each other "did X pay?".

## 12. Open questions

1. Does anyone join mid-year? If so, arrears start from their join month.
2. Can a member change group (A ↔ B) during the year?
3. Is the opening balance of the fund at the start of 2026 known?
4. Should the public page show amounts owed per person, or only paid/behind status?
