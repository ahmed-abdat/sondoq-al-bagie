# Handoff: how to continue this project

Read this, then [DECISIONS.md](DECISIONS.md). Extending the app: [RECIPES.md](RECIPES.md).

## Status (2026-09-29)

- **Live** at https://baqie.vercel.app with the fund's real data.
- Built: public pages (home, members, accounts, donations, `/r/[code]` receipt check, `/report`),
  committee (payments queue + record with on-device OCR, late members + WhatsApp reminders,
  expenses, campaigns, members admin, handover, settings, account, push notifications), installable
  offline-read PWA, daily keep-alive and weekly backup crons.
- Database: migrations m1 through m13 applied to Supabase project `vhcdgxgwdlflmxmqnxzf`. Since
  m13 every write RPC body lives in `app_private` (SECURITY DEFINER) behind a `public` SECURITY
  INVOKER wrapper of the same name. See [supabase/README.md](../supabase/README.md).
- UI port details: [UI-PORT-STATUS.md](UI-PORT-STATUS.md). Open review items:
  [ARCHITECTURE-AUDIT.md](ARCHITECTURE-AUDIT.md) (read its "Lead corrections" first).

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
- Accounts: **no email flows**. Public sign-up is off; the admin creates committee accounts (email
  or phone + generated password) and resets passwords in the app. First sign-in (or after a reset)
  goes to `/committee/setup` (name, own membership, new password). Members need no account.

## What's next

- Guard-rail plans from the audit (SQL harness in CI, migration version guard, error-code drift
  test, exhaustive demo stubs, one committee page guard).
- Open questions for the committee: see [DECISIONS.md](DECISIONS.md) "Still open".
- Idea only, **not approved**: member access to their own history through a personal link. Do not
  build it without the owner's go-ahead.

## Background

Product and research history (may not match the app): [prd/](prd/), [context/](context/),
[design/prototype.html](design/prototype.html), [research/](research/).
