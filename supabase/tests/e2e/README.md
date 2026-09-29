# Two-person e2e flows: local Supabase

Real app (no fixtures) against a **local** Supabase in Docker, with fictional data only. The
production project is never touched: `up.sh` runs only `--local` commands and refuses a linked
project; `helpers.ts` refuses any env that is not `127.0.0.1`; `assertLocalApp()` checks the built
app's bundle.

## Run

1. Docker running (OrbStack / Docker Desktop).
2. `supabase/tests/e2e/up.sh`: starts the stack (`supabase/config.toml`, project `sondoq-e2e`, API
   `127.0.0.1:55321`, DB `:55322`, Postgres 17 like production), resets it (all migrations +
   `supabase/seed.sql` + `seed-e2e.sql`) and writes `supabase/tests/e2e/.env.e2e` (gitignored).
   `--no-reset` keeps the data.
3. Build and serve the app with that env in the **process** env (it wins over `.env.local`; Next
   inlines `NEXT_PUBLIC_*` at build time, so build with it too), port 3420, `SONDOQ_FIXTURES` unset.
   Use **`http://localhost:3420`** as baseURL, not 127.0.0.1: `next start` builds `request.url` with
   `localhost`, so `/m/<token>` redirects there and a cookie set on 127.0.0.1 would be lost.
4. Playwright globalSetup: `e2eEnv()` → `bootstrap()` → `assertLocalApp("http://localhost:3420")`.
5. `supabase/tests/e2e/down.sh` stops the stack.

## Data

- `seed.sql`: 91 fictional members, expenses, the open campaign `E2E_CAMPAIGN_ID` («ترميم المسجد»,
  target 300 000, 70 000 collected).
- `seed-e2e.sql`: one untouched member per flow (`E2E_MEMBERS`): B-901 pay, B-902 reject,
  B-903 campaign, B-904 cash. Group B, 500 MRO a month, active since 1 January, nothing paid.
- `bootstrap()`: committee accounts `COMMITTEE.admin | treasurer | committee` (email login,
  fixed local passwords, setup already done). Admin and treasurer can confirm.

## helpers.ts API

| Export | What |
|---|---|
| `e2eEnv()` | the checked env from `.env.e2e` (spread into the webServer env) |
| `assertLocalEnv(env)` | throws unless every value is local and `SONDOQ_FIXTURES` is unset |
| `assertLocalApp(baseURL)` | throws unless the running app's bundle uses `127.0.0.1:55321` and names no hosted project |
| `bootstrap()` | create/refresh the 3 committee accounts (idempotent) |
| `resetAll()` | `up.sh` (full reset) + `bootstrap()`, ~20–40 s |
| `COMMITTEE[who]` | `{ userId, login, password, name }` for `/login` |
| `signedIn(who)` | supabase-js client signed in as that account |
| `memberLink(ref, by?)` | new personal link like the app makes it → path `/m/<token>` |
| `memberId(ref)` | member uuid for `"B-901"` |
| `paymentsFor(ref)` / `latestPayment(ref, { status?, timeoutMs? })` | payments touching the member (status, amount, receiptCode, rejectReason, submittedViaLink) |
| `monthStates(ref, year?)` | `{ 1: "paid", 2: "late", … }` from `member_months` |
| `campaignProgress(id?)` | `{ collected, balance, participantsPaid, targetAmount }` |
| `E2E_MEMBERS`, `E2E_CAMPAIGN_ID` | the fixed test data above |
