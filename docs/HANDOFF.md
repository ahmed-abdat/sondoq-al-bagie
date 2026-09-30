# Handoff: how to continue this project

Read this, then [DECISIONS.md](DECISIONS.md). Extending the app: [RECIPES.md](RECIPES.md).

## Status (2026-09-30)

- **Live** at https://baqie.vercel.app with the fund's real data (91 members).
- **Committee-only app** (owner decision 2026-09-30, [COMMITTEE-ONLY-PLAN.md](COMMITTEE-ONLY-PLAN.md)):
  visitors see only `/login`. No public pages, member links, `/me`, receipt check `/r` or member
  push; members get information only from what the committee shares on WhatsApp (report
  images/PDF, «المتأخرات» without amounts). [MONEY-PRIVACY.md](MONEY-PRIVACY.md) and
  [MEMBER-ACCESS.md](MEMBER-ACCESS.md) are retired.
- **Two levels.** Every active committee member records payments (confirmed at once, no review
  queue), cash, paper, levy shares and contributions, expenses, credit, member details, settings,
  fund accounts, reads every report, chooses his own push kinds, and may undo his own record
  within 30 seconds. **«مسؤول»** (role `admin`) only: committee accounts, the handover (alone),
  adding members and their status / group / join month, cancelling payments and expenses,
  campaigns and levies («اللوحة»: create, add members, change a share, exempt), fee groups
  («الفئات»: fees, moves, retire).
- **No receipts.** After a payment: «سُجّلت الدفعة ✓» + «تراجع» for 30 s. Receipt numbers are still
  stamped in the database (history) but never shown.
- **Features:** home (balance, this month, recent), members with month grid and statement («كشف
  حساب»), donations and levies («اللوحة»: mandatory shares, a debt until paid or exempted, a
  closed levy still takes shares), expenses (each names its wallet), «سجل العمليات» (who did
  what), reports (annual, summary, months table, «المتأخرات», expenses, campaign/levy, member
  statement, handover, wallets, committee work), «الإحصاءات» (counts and percentages, never
  names; last year compared at the same day a year ago), fee groups, committee push, on-device
  OCR, handover, settings, installable PWA (no offline pages).
- **Accuracy first** (owner priority #1): `accuracy_audit()` (m35) recomputes every figure from
  the base tables (29 checks). It runs in `run.sh`, on the e2e stack after the flows (CI,
  `supabase/tests/e2e/audit.sh`) and daily on production (`/api/audit`: `job_runs` + a push to
  «مسؤول» on any failure). 29/29 on production 2026-09-30.
- Database: migrations m1–m42 applied to project `vhcdgxgwdlflmxmqnxzf`.
  Every write RPC body lives in `app_private` (SECURITY DEFINER) behind a `public` SECURITY INVOKER
  wrapper; every migration since m28 has its own undo (`supabase/rollback/mNN_revert.sql`, proven
  by a catalog diff). See [supabase/README.md](../supabase/README.md).
- Crons (`vercel.json`): `/api/keepalive` daily, `/api/backup` weekly, `/api/audit` daily.

## People

- Owner: AHMED (`ahmed-abdat`), a committee member. **Reply in English**, concisely (Arabic only
  if he writes in Arabic). The committee and members are not technical.
- Never ask for or commit secrets or member data (names with phones, receipt images, paper sheets,
  `supabase/import/data/`). From Supabase ask only for the URL and publishable key.

## Branches, lanes, shipping

- `main` = **production** (Vercel deploys it). The lead updates it by pushing `m2-app:main`.
- `m2-app` = LOCAL integration branch (never pushed; only `main` deploys). Lanes work in worktrees `.claude/worktrees/<lane>` on branches
  cut from `m2-app`, commit small, never push, and tell the lead; the lead merges.
  - Lane A, backend: `m2-backend` (`supabase/**`, `src/lib/supabase/**`, `src/lib/data/**`, `src/app/api/**`).
  - Lane B, platform: `m2-pwa` (SW, manifest, `public/**`, `scripts/**`, offline, providers, `e2e/**`, `vercel.json`, `.github/**`).
  - Lane C, UI: `m2-ui` (`src/components/**`, `src/app/(app)/**`, `globals.css`, DESIGN/PRODUCT).
  - Full ownership map and contracts: [PLAN-M2.md](PLAN-M2.md).
- Commits: plain messages, **no Co-Authored-By / AI attribution**.
- Before handing over a slice:
  - `pnpm check` (typecheck + lint + unit tests) and `pnpm build`. CI runs the same on pushes to
    `main` and on PRs ([.github/workflows/ci.yml](../.github/workflows/ci.yml)).
  - SQL changes: `supabase/tests/local/run.sh` must print `OK` (not in CI yet).
  - e2e runs on a **fixtures build** only:
    `SONDOQ_FIXTURES=1 pnpm build && SONDOQ_FIXTURES=1 PORT=3410 pnpm test:e2e`.
- Migrations: apply through the Supabase MCP, then rename the file to the version the remote
  recorded and check the md5. Regenerate `src/lib/supabase/database.types.ts` after.

## Conventions

- Tooling: **pnpm only** (Node 22+), never npm or `package-lock.json`. **Next 16**: read
  `node_modules/next/dist/docs/` before writing Next code; middleware is `src/proxy.ts`.
- UI: Arabic, RTL, Western digits, IBM Plex Sans Arabic / Reem Kufi. Tokens in
  `src/app/globals.css` and `DESIGN.md`.
- Money: integer old ouguiya (MRO) everywhere; receipts show MRU (×10), see `src/lib/money.ts`.
- Arrears and totals are computed in SQL views, never stored. Nothing is hard-deleted: cancel with
  a reason; every change lands in `audit_log`. All writes go through RPCs.
- Pages read data only through `src/components/app/source.ts`; committee writes go through
  `useAct()` (`src/components/app/act.tsx`).
- Demo mode: `SONDOQ_FIXTURES=1` on a non-production build serves fictional data and simulates
  committee writes in the browser (`src/components/app/demo.ts`; never on production).
- Accounts: **no email flows**. Public sign-up is off; a «مسؤول» creates committee accounts (email
  or phone + generated password) and resets passwords in the app. First sign-in (or after a reset)
  goes to `/committee/setup` (name, own membership, new password). Members have no access.
- Money checks: a new report, stat or screen ships with cross-check tests (totals reconcile with
  the fund, the grid, the statement) and, when it adds a figure, a check in `accuracy_audit()`.

## What's next

- Owner priorities: accuracy (every number verified end to end) and ease (fewest taps, 360px,
  48px targets, simple Arabic). A UX pass with tap counts on every screen before sign-off.
- Open questions for the committee: see [DECISIONS.md](DECISIONS.md) "Still open".
- Later, only with the owner's OK: drop `member_links` (1 revoked row) and the `payments` FK to it.

## Background

Product and research history (may not match the app): [prd/](prd/), [context/](context/),
[design/prototype.html](design/prototype.html), [research/](research/).
