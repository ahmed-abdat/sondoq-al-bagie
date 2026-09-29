# Architecture audit: صندوق الرابطة

> **Lead corrections (2026-09-29, after review):**
> - Plan 1 premise is wrong: `main` IS production (lead pushes `m2-app:main`; Vercel deploys `main`), and CI already runs on every push to `main` (runs green for 2378df1, 08eaba4, 3436109). Plan 1 reduces to: also run CI on pushes to `m2-app`, optional.
> - Plan 3: m13 is already renamed to its applied version `20260929073339_m13_rpc_wrappers.sql`; keep only the guard + README convention.
> - Reply language: English (owner's current preference); CLAUDE.md to be updated.

- Audited: worktree `.claude/worktrees/app`, branch `m2-app` @ `08eaba4` (production). Also looked at the `m2-backend` branch for m13 (`be30afa`, `082502b`).
- Mode: read-only. No files were edited. `pnpm check` is green: typecheck, lint, and 52 Vitest files / 334 tests in about 4 s.
- Owner goal: easier to maintain, manage and extend.
- Lanes (from docs/PLAN-M2.md):
  - **A, backend:** `supabase/**`, `src/lib/supabase/**`, `src/lib/data/**`, `src/app/api/**`.
  - **B, platform:** SW, next.config, manifest, `public/**`, `scripts/**`, `src/lib/offline/**`, `src/components/providers/**`, share/report/pdf libs, `e2e/**`, `vercel.json`, `.github/**`.
  - **C, UI:** `src/components/app/**`, `src/app/**` pages, `globals.css`, `components/ui`, DESIGN/PRODUCT docs.
  - **Lead:** root/agent docs (`CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/*`). This is not formally owned by a lane; the lead or Lane C takes it.

---

## 1. Verdict

**The design is healthy. The weak spot is the safety net.** Most of what hurts today is process and guard-rails, not structure.

Strong points:
- The backend seam is well designed. It is typed, error-mapped and table-tested (`run()` in `src/lib/data/actions.ts:25-48`, `codeOf` in `errors.ts`, `actions-rpc.test.ts`).
- The SQL layer is disciplined:
  - writes go through RPCs only;
  - nothing is hard-deleted, and every change is audited;
  - there is a no-Docker harness with race, rollback and import checks.
- The dependency direction is clean: `src/lib` never imports `src/components`.

The biggest risks are elsewhere:
1. **The production branch is not CI-gated.**
2. **The SQL harness never runs in CI.**
3. **Contracts that span layers have no drift tests:**
   - SQL `HINT` codes and the Arabic messages;
   - the demo action map and the real actions;
   - the fixture assembly and the real assembly;
   - migration versions.
4. **The docs that agents must read first are stale.**

Adding an RPC end to end touches about 13 places across 3 lanes, and there is no checklist. Fix the guard-rails first; restructure very little.

---

## 2. What is good and should be kept

| Keep | Evidence |
|---|---|
| **The server-action pattern.** Validate with zod, call one RPC, map the error to `{ok:false, code, message}`, then `updateTag(PUBLIC_TAG)`. Each action is about 10 lines. | `src/lib/data/actions.ts:25-48` |
| **Table-driven RPC contract test:** action to RPC name, snake_case args, and whether the cache is expired | `src/lib/data/actions-rpc.test.ts` |
| **Error mapping in one place:** P0001 `HINT`, then a stable code, then Arabic | `src/lib/data/errors.ts` |
| **One public cache factory, one tag, 60 s.** Committee writes expire it. | `src/lib/data/public.ts:15-27` |
| **Typed flow from `database.types.ts`.** Enums come from it, and views are mapped into non-null UI shapes. Backup table names are checked with `satisfies`. | `src/lib/data/types.ts:6-17`, `read.ts:15`, `backup/export.ts:27` |
| **A single data door for pages, with fixtures and a hard production guard** | `src/components/app/source.ts`, `demo.ts:5` (`VERCEL_ENV !== "production"`) |
| **SQL harness without Docker.** It runs migrations, tests, a scan for unbounded writes, a seed-shape check, a double-confirm race, rollback and re-apply, and an idempotent import. | `supabase/tests/local/run.sh` |
| **RPC-only writes and `security_invoker` views.** RLS protects committee views even when a page guard is missing. | `supabase/migrations/*_m7_member_lists.sql:119` |
| **Env access in one place** | `src/lib/supabase/env.ts` |
| **Pure helpers with unit tests:** money, dates, OCR, offline, receipt-model, report pages | `src/lib/**/*.test.ts` |
| **The import pipeline** has a dry run, a local rehearsal and reports that contain no names | `supabase/import/*` |

Do not rewrite any of these.

---

## 3. Findings, ranked

Impact and effort: S is under 2 h, M is half a day to a day, L is several days.

| # | P | Finding | Lane | Impact | Effort | Evidence |
|---|---|---|---|---|---|---|
| 1 | **P0** | CI does not run on pushes to the production branch `m2-app`. `main` is still the create-next-app commit, and Vercel deploys `m2-app`. | B | High | S | `.github/workflows/ci.yml:3-6`; `vercel.json:5-11`; `git log main` shows only `97c2f88 Initial commit`, and `main..m2-app` has 366 commits |
| 2 | **P1** | The SQL harness (migrations, SQL tests, safe-update scan, seed, race, rollback, import) is not in CI. A broken migration is only caught if someone runs `run.sh` by hand. | B (A consults) | High | S–M | `ci.yml:21-24` has no SQL step; `supabase/tests/local/run.sh` |
| 3 | **P1** | Migration versions have no guard. m13 is named `29990101000000_m13_rpc_wrappers.sql`, so any later migration with a real timestamp sorts before it. Remote apply through MCP assigns a different version. After m13, editing an RPC body means changing `app_private.X`, not `public.X`, and nothing in the repo tells authors this. | A | High (prod schema order) | S | `m2-backend:supabase/migrations/29990101000000_m13_rpc_wrappers.sql`; `supabase/README.md` "Remote state" says file names must match the remote versions |
| 4 | **P1** | Six SQL `HINT` codes have no Arabic message, so users see «حدث خطأ غير متوقع». Nothing tests for this drift. | A | Med–High | S | `m1_guards.sql:185` `price_frozen` (reachable from `setGroupPrice`), `:209` `month_not_owed`, `:213` `no_price`, `:216` `wrong_month_amount`, plus `confirm_only`/`stamp_once` (internal); `errors.ts:4-72` has none of them |
| 5 | **P1** | The entry docs for agents are stale or contradictory, and every new session is told to read them first. | Lead/C | High for agents | S | `CLAUDE.md` says "Before doing anything, read docs/HANDOFF.md"; `docs/HANDOFF.md:33-35` says "M1 … Next" and `npm run …`, and its stack lists react-hook-form, Recharts and browser-image-compression, which are not in `package.json`; `README.md` and `CLAUDE.md` say "only `main` deploys" while `vercel.json:8` deploys `m2-app`; `CLAUDE.md` says "Reply in Arabic" while the owner's memory says English; `PLAN-M2.md` Lane C paths use `src/app/(public)`, but the real path is `src/app/(app)/(public)` |
| 6 | **P2** | Adding an RPC, read, page or sheet needs about 13 edits and has no written recipe. | Lead + A/C | High for extension | S | See §5 |
| 7 | **P2** | The demo action seam is not exhaustive. `demo` is `Partial<Actions>` plus a cast, so any action without a stub silently calls the **real** server action in demo mode: `setGroupPrice`, `savePushSubscription`, `deletePushSubscription`, and `linkCommitteeMember` from m2-backend. Two components also import the actions without going through `useAct`. | C (+B) | Med | S | `src/components/app/act.tsx:79,383,396`; `components/providers/committee-push.tsx:6`; `components/app/push-suggest.tsx:5` |
| 8 | **P2** | The fixture seam re-implements domain assembly. `source.report()` rebuilds `ReportData` by hand with different rules: `"upcoming"` instead of `"not_owed"`, and prepaid based on the due month instead of `nowYm`. `ledger()` holds untested assembly logic in a server-only file. | C (uses A's export) | Med | S–M | `source.ts:172-236` vs `lib/data/report.ts:40-60`; `source.ts:66-117` |
| 9 | **P2** | Payment business rules live inside an 822-line component with 23 `useState`: the totals, the blocking message, the credit/diff logic and the allocation building. None of it is unit-testable. | C | Med | M | `src/components/app/record.tsx:357-510` |
| 10 | **P2** | Dead code and duplicates (list below). | A + B | Med (navigability) | S–M | Details below |
| 11 | **P2** | Committee page guards are inconsistent. The campaigns and members pages do not redirect when there is no session; RLS still returns nothing, so no data leaks. The `next=` value varies from page to page. Each new page copies the guard by hand. | C | Med | S | `committee/campaigns/page.tsx:10-11`, `members/page.tsx:10-11` vs `payments/page.tsx:12`, `settings/page.tsx:17` |
| 12 | **P2** | Types can only be regenerated from the **remote** project, so production must change before the types exist. There is no script and no freshness check. | A | Med | S | `supabase/README.md` "Types" |
| 13 | **P2** | `.env.example` is missing `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SONDOQ_FIXTURES` and `NEXT_PUBLIC_SITE_URL`. | B | Low–Med | S | `.env.example`; used in `lib/push/send.ts:25`, `lib/push.ts:18`, `next.config.ts:27` |
| 14 | P3 | `unstable_cache` is replaced by `use cache` in Next 16. It is contained in one factory; migrate only when adopting Cache Components. | A | Low | M | `lib/data/public.ts:2,20`; `node_modules/next/dist/docs/.../unstable_cache` |
| 15 | P3 | `globals.css` has 4,724 lines, about 553 top-level `.bq-*` rules, and is the file with the most churn (44 commits). About 10 classes are candidate dead code (`bq-com-*`, `bq-desk-only`, `bq-rec-line` …). | C | Low–Med (conflicts) | M | `src/app/globals.css` |
| 16 | P3 | e2e (Playwright, fixture build) never runs in CI. | B | Low–Med | S | `playwright.config.ts:5-9` |
| 17 | P3 | Names drift: `supabase/tests/m1_test.sql` covers m1–m12, and `rollback/m2_down.sql` covers m2–m12. | A | Low | S | files |
| 18 | P3 | The grace-period rule is implemented twice (consistent today). | A/C | Low | S | `derive.ts:253-256` vs `m1_views.sql:33` |
| 19 | P3 | Historical docs (PRD, prototype.html, research) sit next to live ones. | Lead | Low | S | `docs/prd/`, `docs/design/prototype.html` |
| 20 | P3 | Vitest config loads as CJS (warning), and a happy-dom instance is created per file. | B | Low | S | `vitest.config.ts`; `pnpm test` output |

Not worth doing now:
- **Splitting `actions.ts` (823 lines).** The `run()` helper keeps each action tiny, and the section banners make it navigable. Revisit past about 1,200 lines.
- **Splitting `accounts-admin.tsx` and `members-admin.tsx`.** They are big, but mostly form markup. Split only when a feature touches them.
- **Replacing TanStack Query.** It still backs the offline banner's timestamp and the persister. Trim it (#10); do not remove it.

**Details for #10 (dead code and duplicates):**
- `lib/data/queries.ts` has about 130 lines of `publicQueries`/`committeeQueries` factories. Only `publicQueries.fundSummary` is used (`components/app/cache-seed.tsx:23`). Realtime invalidates `["committee","payments"]` and `["committee","arrears"]`, but no query uses those keys (`realtime.ts:130-131`).
- `PUBLIC_KEY` is defined twice: `lib/data/tags.ts:5` and `lib/offline/persister.ts:6`.
- These exports are unused: `getLateMembers`, `getMemberMonthsOf`, `getCurrentTerm`, `getHandover`, `getPayment`, `getProofUrl` (`lib/data/index.ts`).
- Expense category labels are duplicated: `components/app/derive.ts:330` `CATEGORY_LABEL` and `lib/data/labels.ts:4` `CATEGORY_LABELS`.
- There are two independent `PushPayload` contracts: `lib/push/payload.ts` (server, A) and `lib/offline/push-payload.ts` (SW, B).

### Direction (options, not problems)

- **Move the fixture adapter one level down (L, later).** Make the fixtures implement the raw `read.*` functions, which already take a `Client`, instead of 30 `pick()` calls in `source.ts`. Then report, ledger and member rows are assembled by one implementation for both adapters.
  - This is the real "deep module" move: two adapters at one seam.
  - It costs a few days and touches A and C. Do plan 8 first; it removes the worst duplication cheaply.
- **Codify the lane contracts as lint rules** (part of plan 7).
  - `no-restricted-imports` covers: fixtures only from `source.ts`; `@/lib/data/actions` only from `act.tsx`; `@/lib/supabase/admin` only in server files.
  - This makes the PLAN-M2 contract enforceable and not just a convention.

---

## 4. Plans (P0–P2)

Each plan is self-contained.

Shared rules for every plan:
- Verification gate: `pnpm check` (typecheck + lint + unit tests) and `pnpm build`. Use `supabase/tests/local/run.sh` for SQL.
- Package manager is pnpm; never npm.
- Money is integer MRO.
- UI text is Arabic.
- No `Co-Authored-By` lines in commits.
- Do not commit member data.
- Commit on your lane branch; the lead merges into `m2-app`.

### Plan 1 (P0): Gate the production branch with CI — Lane B

**Why.** Vercel deploys `m2-app` (`vercel.json:8`). CI (`.github/workflows/ci.yml:3-6`) runs only on `push: [main]` and on `pull_request`, and all real work lands on `m2-app` by merge or push. `main` is the untouched create-next-app commit. Today, production can ship a red build without CI noticing; only Vercel's own build stands in the way.

**Files.** `.github/workflows/ci.yml` only.

**Steps.**
1. Change the trigger:
   ```yaml
   on:
     push:
       branches: [main, m2-app]
     pull_request:
     workflow_dispatch:
   concurrency:
     group: ci-${{ github.ref }}
     cancel-in-progress: true
   ```
2. Pin Node so `.mts` type stripping works (run.sh and plan 2 need it): `node-version: 22` is fine as long as it resolves to ≥ 22.18. Add a comment saying so.
3. Leave the existing steps as they are (lint, typecheck, test, build).
4. Give the owner these two lines; he must act outside the repo:
   - GitHub → Settings → Branches: protect `m2-app` and require the `check` job.
   - Decide the long-term production branch: either fast-forward `main` to `m2-app` and point Vercel at `main`, or keep `m2-app` and update the docs (plan 5).

**Risks.** None to runtime. Extra CI minutes are negligible.

**Verify.**
- `gh workflow view CI` shows the new triggers.
- Push a no-op commit to a scratch branch that mirrors `m2-app` and see the run. Alternatively, run `act` locally if it is installed; it is optional.
- Done when a push to `m2-app` triggers the `check` job.

**Stop and report if** the owner wants `main` to become production. That changes `vercel.json` and needs his decision.

### Plan 2 (P1): Run the SQL harness in CI — Lane B (Lane A reviews)

**Why.** `supabase/tests/local/run.sh` is the only thing that proves the migrations apply in order and that key behaviour holds:
- RLS and the RPC rules (`tests/m1_test.sql`);
- no unbounded UPDATE/DELETE;
- the seed shape;
- the double-confirm race;
- rollback and re-apply;
- the idempotent paper import.

It needs only `initdb`/`pg_ctl`/`psql` (Postgres 15+ with pgcrypto and btree_gist) and Node. Nothing runs it automatically.

**Files.** `.github/workflows/ci.yml`, adding a second job `sql`.

**Steps.**
1. Add the job:
   ```yaml
   sql:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - uses: actions/setup-node@v4
         with: { node-version: 22 }
       # ubuntu-latest ships PostgreSQL binaries (not on PATH, service stopped)
       - run: echo "$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)" >> "$GITHUB_PATH"
       - run: supabase/tests/local/run.sh
   ```
2. If `initdb` is missing on the runner, replace the PATH step with `sudo apt-get install -y postgresql-16 postgresql-contrib-16` and PATH `/usr/lib/postgresql/16/bin`.
3. The job does not need `pnpm install`. run.sh uses only `node` for `unbounded-writes.mjs`, `import-paper.mts` and the test. If an import fails because it needs node_modules, add the pnpm setup from the `check` job.

**Risks.**
- run.sh uses `mktemp -d /tmp/sbpg.XXXX` and port 55433, which is fine on runners.
- The `sleep`s in the race check may be flaky on a slow runner. If so, raise `sleep 0.3` to `0.6` in run.sh; that edit is Lane A's, so ask them.

**Verify.** The CI job ends with the line `OK`. Locally, `supabase/tests/local/run.sh` should still print `OK`.

**Stop and report if** the race check fails intermittently more than 1 in 10 runs.

### Plan 3 (P1): Migration version guard and the post-m13 RPC convention — Lane A

**Why.**
- Files in `supabase/migrations/` must carry the **same version as the remote `schema_migrations`**, because the README "Remote state" section says `db push` treats them as already applied.
- m13 on `m2-backend` is `29990101000000_m13_rpc_wrappers.sql`, a placeholder. Any migration added before it is renamed would sort *before* m13 locally, and apply in a different order than production.
- After m13, every write RPC is split into `app_private.<name>` (SECURITY DEFINER, holds the body) and `public.<name>` (SECURITY INVOKER wrapper). A future author who writes `create or replace function public.record_payment … security definer` would overwrite the wrapper. The m13 SQL test catches a definer in `public`. Nothing tells authors to edit `app_private.<name>`, or to add both halves for a new RPC.

**Files.**
- `supabase/tests/local/run.sh`
- `supabase/README.md`
- a new tiny check `supabase/tests/local/versions.sh`, or inline it in run.sh

**Steps.**
1. In run.sh, before migrating, fail when any migration version is more than 1 day in the future, or when two files share a version:
   ```sh
   now=$(date -u +%Y%m%d%H%M%S); max=$(( now + 1000000 ))
   for f in "$ROOT"/supabase/migrations/*.sql; do v=$(basename "$f" | cut -d_ -f1)
     [ "$v" -le "$max" ] || { echo "FAIL placeholder/future migration version: $(basename "$f") (rename to the remote version after applying)"; exit 1; }
   done
   ```
   Note that m13 is still a placeholder on m2-backend. Land this guard **together with** renaming m13 to its real remote version when it is applied (see the owner memory "Supabase migration apply + check"). Until then, merging m2-backend would turn CI red. That is intended: it forces the rename.
2. Add a section "Writing a migration" to `supabase/README.md`:
   - Name files `YYYYMMDDHHMMSS_mNN_<slug>.sql`, with a real UTC timestamp.
   - After applying through MCP, rename the file to the version the remote recorded, and check the md5.
   - New write RPC: put the body in `app_private` as `security definer set search_path = ''`, add the `public` wrapper `security invoker` with the same signature and defaults, and grant EXECUTE on both.
   - Change an RPC: `create or replace function app_private.<name>`. Touch the wrapper only if the signature changes, and then drop and recreate both.
   - Every new `fail('<code>')` needs an entry in `src/lib/data/errors.ts` (enforced by plan 4).
   - Add the undo to `rollback/`, and a row to the README table.
3. Keep the file names `m1_test.sql` and `m2_down.sql` for now (P3 #17). Only add a comment at the top of each saying which migrations it covers.

**Risks.** The guard fails on m2-backend until m13 is renamed, as intended. Coordinate with the lead's merge order.

**Verify.**
- `supabase/tests/local/run.sh` prints `OK` on `m2-app`.
- On a scratch copy with a `29990101…` file it prints the FAIL line and exits non-zero.

### Plan 4 (P1): The error-code drift test and the missing messages — Lane A

**Why.** RPCs raise `P0001` with `HINT = <code>`, either through `app_private.fail('<code>')` (`m1_guards.sql:15`) or through `using … hint = '<code>'`. The UI shows `MESSAGES[code]` or the generic fallback (`src/lib/data/errors.ts:74-76`).

These codes have no message today:
- `price_frozen` (`m1_guards.sql:185`), reachable from `setGroupPrice` once payments exist;
- `wrong_month_amount` (`:216`), reachable when a stale price is in the record sheet;
- `no_price` (`:213`);
- `month_not_owed` (`:209`);
- `confirm_only` (`:255`) and `stamp_once` (`:103`), which should be internal.

**Files.** `src/lib/data/errors.ts` and a new `src/lib/data/errors-sql.test.ts`.

**Steps.**
1. Add Arabic messages in the style of the existing ones:
   - `price_frozen`: «لا يمكن تغيير الرسوم لسنة فيها دفعات مسجّلة.»
   - `wrong_month_amount`: «مبلغ الشهر لا يطابق الرسوم الحالية. أعد فتح الصفحة وحاول مرة أخرى.»
   - `no_price`: «لم تُحدَّد رسوم هذه السنة لفئة العضو. راجع المسؤول.»
   - `month_not_owed`: «هذا الشهر غير مستحق على العضو (معفى أو غير نشط).»

   Have the owner confirm the wording.
2. Write the test. It reads every `supabase/migrations/*.sql` with `node:fs`, collects the codes, and checks each against `MESSAGES`:
   - codes come from `/fail\('([a-z_]+)'/g` and `/hint\s*=\s*'([a-z_]+)'/g`;
   - each code must be a key of `MESSAGES` or be listed in `const INTERNAL = ["confirm_only", "stamp_once"]`, with a comment saying these guard rules the RPCs already enforce;
   - use `import.meta.dirname` or `process.cwd()` to reach `supabase/migrations`.
3. Also assert the other direction, softly: every code used in `failure("…")` under `src/lib/data` exists in `MESSAGES`. That already holds today.

**Risks.** The regex misses a code raised dynamically (`hint = v_code`). Grep for `hint = [a-z]` without quotes; there are none today.

**Verify.**
- `pnpm test src/lib/data/errors-sql.test.ts` passes.
- Temporarily delete `price_frozen` from MESSAGES: the test must fail and name it.
- `pnpm check` passes.

### Plan 5 (P1): Make the agent entry docs true — Lead (Lane C for DESIGN/PRODUCT)

**Why.** `CLAUDE.md` tells every session to read `docs/HANDOFF.md` first. That file describes the M0/M1 era:
- "M1 … Next";
- `npm run` commands;
- libraries that are not installed (react-hook-form, Recharts, browser-image-compression);
- "Add Playwright when the UI flows exist".

`README.md` and `CLAUDE.md` say only `main` deploys, but `vercel.json` deploys `m2-app` and `main` is empty. `CLAUDE.md` says to reply in Arabic, while the owner's current preference is English (his memory note). `docs/PLAN-M2.md` lane paths predate the `(app)` route group. For an AI-built project, stale entry docs are the most expensive kind of drift: every agent starts wrong.

**Files.**
- `docs/HANDOFF.md`, rewritten short
- `docs/README.md`
- `README.md`
- `CLAUDE.md`
- `docs/PLAN-M2.md` (paths only)
- move `docs/prd/`, `docs/design/prototype.html`, `docs/research/` and `docs/context/` to `docs/archive/`, and update their links

**Steps.**
1. Rewrite `docs/HANDOFF.md` in about 60 lines:
   - current state: what is live, the production branch, the Supabase project ref;
   - where things live, linking to `CLAUDE.md` §Where things live, `supabase/README.md` and `docs/UI-PORT-STATUS.md`;
   - how to verify: `pnpm check`, `pnpm build`, `supabase/tests/local/run.sh`, and e2e with `SONDOQ_FIXTURES=1`;
   - links to the recipes (plan 6);
   - open questions: keep a pointer to DECISIONS.md.

   Delete the milestone table and the "M1 notes", or move them to `docs/archive/HANDOFF-m0.md`.
2. In `README.md` §Deploy and in `CLAUDE.md`, state the real deploy branch (`m2-app` today, per `vercel.json`) and the cron list (keepalive daily, backup weekly on Sunday 03:00).
3. Ask the owner which reply language agents should use, then make `CLAUDE.md` match. Do not guess.
4. In `docs/PLAN-M2.md`, fix the Lane C paths to `src/app/(app)/(public)/**` and `src/app/(app)/(committee)/**`, and mark the doc as "ownership map (still valid)".
5. `git mv` the historical docs into `docs/archive/`, add a one-line banner "Historical: may not match the app", and update the links in `docs/README.md`, `DECISIONS.md` and `HANDOFF.md`.

**Risks.** Broken relative links. Grep for `](prd/`, `](design/`, `](research/` and `](context/` after the move.

**Verify.**
- `grep -rn "npm run\|M1 .*Next\|react-hook-form\|Recharts" docs/HANDOFF.md README.md CLAUDE.md` finds nothing.
- `grep -rn "only \`main\` deploys" README.md CLAUDE.md` finds nothing.
- All links resolve (`npx markdown-link-check` if it is available; otherwise check by hand).

### Plan 6 (P2): Recipes for extending the app — Lead (content from A and C)

**Why.** Today a new committee write touches about 13 places, and nothing lists them. Agents rediscover them by trial and error. §5 below is the content.

**Files.** A new `docs/RECIPES.md`, linked from `CLAUDE.md` §Where things live and from `docs/HANDOFF.md`.

**Steps.**
1. Copy §5 of this audit into `docs/RECIPES.md`, turning each list into a checklist with file paths.
2. In each checklist, mark which steps are enforced by a test (plans 3, 4, 7 and 11) and which are manual.
3. Add one line to `CLAUDE.md`: "Adding an RPC, read, page or sheet: follow docs/RECIPES.md."

**Verify.** Every path mentioned in the file exists: `grep -oE '\`src/[^\`]+\`|\`supabase/[^\`]+\`' docs/RECIPES.md`, then `ls` each result.

### Plan 7 (P2): Make the demo seam exhaustive and enforce the import boundaries — Lane C (Lane B for providers)

**Why.** In `src/components/app/act.tsx`:
- `const demo: Partial<Actions> = {…} as Partial<Actions>` (lines 79 and 383);
- `DEMO_ACTIONS = { ...real, ...demo }` (line 396).

Any action without a stub silently calls the **real** server action in demo mode. That applies today to `setGroupPrice`, `savePushSubscription` and `deletePushSubscription`, and to `linkCommitteeMember` once m2-backend merges. Also, `components/providers/committee-push.tsx:6` and `components/app/push-suggest.tsx:5` import `@/lib/data/actions` directly and bypass `useAct()`.

**Files.**
- `src/components/app/act.tsx`
- `src/components/providers/committee-push.tsx` (Lane B)
- `src/components/app/push-suggest.tsx`
- `eslint.config.mjs` (Lane B)

**Steps.**
1. In act.tsx, make coverage a compile-time fact:
   ```ts
   type Sim = { [K in keyof Actions]: Actions[K] | "real" };
   const demo = { recordPayment: async (p) => {…}, …, setGroupPrice: async () => ok(undefined),
     savePushSubscription: async () => ok(undefined), deletePushSubscription: async () => ok(undefined),
   } satisfies Sim;
   ```
   Build `DEMO_ACTIONS` by mapping `"real"` to `real[k]`. Remove the `as Partial<Actions>` cast. A new action in `actions.ts` is then a type error until someone decides how demo mode handles it.
2. Route the two push callers through the seam. `push-suggest.tsx` should use `useAct()`. `committee-push.tsx` is a provider mounted inside `DemoProvider`, so it should use `useAct()` too. If it is mounted outside, pass the demo flag through props; check `src/app/layout.tsx`.
3. Add `no-restricted-imports` to `eslint.config.mjs`:
   - `@/lib/data/actions` is allowed only in `src/components/app/act.tsx` and in tests;
   - `./fixtures` / `@/components/app/fixtures` is allowed only in `source.ts`;
   - `@/lib/supabase/admin` is allowed only in `src/lib/**` and `src/app/api/**`.

   Use `files` / `ignores` overrides.

**Risks.**
- `satisfies` with contextual typing of the async stubs: if inference suffers, annotate the parameters with `Parameters<Actions["x"]>[0]`.
- Server actions imported into a map object must keep stable identities; `DEMO_ACTIONS` is still built once at module scope.

**Verify.**
- `pnpm check` passes.
- Temporarily add `export async function fooBar() {}` to `actions.ts`: `pnpm typecheck` must fail in `act.tsx`.
- `pnpm lint` fails on a scratch import of `@/lib/data/actions` inside `views/home.tsx`.
- The demo flows still work: `SONDOQ_FIXTURES=1 pnpm build && SONDOQ_FIXTURES=1 PORT=3410 pnpm test:e2e e2e/committee.spec.ts`. Do not use ports 3200, 3400, 3500 or 3510.

### Plan 8 (P2): One report and one ledger assembly for both adapters — Lane C (reads Lane A's exports)

**Why.**
- `src/components/app/source.ts:172-236` rebuilds `ReportData` for fixtures by hand. Its rules differ from `assembleReport` in `src/lib/data/report.ts:40-60`: the default state is `"upcoming"` instead of `"not_owed"`, prepaid uses the due month instead of `nowYm`, and a new `ReportData` field must be added in two places. So `/report` screenshots and e2e test a different algorithm than production.
- `ledger()` (`source.ts:66-117`) is pure assembly logic with no tests.

**Files.**
- `src/components/app/source.ts`
- a new `src/components/app/ledger.ts` plus `ledger.test.ts`
- if needed, `src/lib/data/index.ts` (Lane A) to export `assembleReport`; it is currently exported from `./report` but not from the barrel

**Steps.**
1. In `source.report()`, replace the fixture branch with a call to `assembleReport({ year, summary: fx.fxSummary(), term, monthly: fx.fxMonthly(), members: fx.fxMembers(), months: fx.fxMemberMonths(), expenses: fx.fxExpenses(), campaigns: fx.fxCampaigns(), info: fx.fxInfo(), prices: <fixture GroupPrice[]>, now: today() })`. First read the full `ReportInput` type at `report.ts:25-38`; add a fixture for any field that is missing.
2. Move the body of `ledger()` into a pure `toLedger(acts: ActivityItem[], exps: Expense[], now: Date): LedgerEntry[]` in `ledger.ts`. Keep the receipt preloading in `source.ts`.
3. Add tests for `toLedger`:
   - a months payment, a campaign-only payment and an expense are ordered newest first;
   - 12 or more months gives «رسوم السنة كاملة»;
   - `kind` is `"donation"` when `months === 0`.

**Risks.** The fixture report visuals may change slightly (for example «upcoming» vs «not_owed» cells). That is the point. Update `e2e/report.spec.ts` expectations if they encoded the old fixture behaviour, and tell the lead.

**Verify.**
- `pnpm check` passes.
- `SONDOQ_FIXTURES=1 pnpm build`, then `pnpm test:e2e e2e/report.spec.ts` on PORT 3410.
- `grep -n "months: Array.from" src/components/app/source.ts` finds nothing.

### Plan 9 (P2): Pull the payment draft rules out of record.tsx — Lane C

**Why.** `RecordBody` (`src/components/app/record.tsx:337-560`) mixes 23 `useState` hooks with the rules that decide money:
- `feeTotal`, `campAmt`, `total` and `diff`;
- the 7-way `block` message (the first blocking reason in order);
- the construction of the allocations (`months` / `campaign` / `credit`) and of the payment amount.

It is the most important client logic in the app and has no unit tests. The server re-validates, so bugs show up as confusing errors, not bad data.

**Files.** A new `src/components/app/payment-draft.ts` plus `payment-draft.test.ts`; `record.tsx`.

**Steps.**
1. Define the draft type:
   `type Draft = { rows: { member: MemberRow; months: number[] }[]; method: PaymentMethod | null; payerName: string; sent: number | null; creditFor: string | null; campaignId: string | null; campaignAmount: number; year: number; prices: Record<string, number> }`.
2. Export `summarize(d): { feeTotal, total, diff, block: string }`. Copy the `block` string chain verbatim from record.tsx:386-402.
3. Export `toRecordInput(d, extra: { id, paidOn, txnRef?, proof? }): RecordPaymentInput`. Copy lines 437-472 verbatim.
4. In `RecordBody`, keep the state hooks and replace the inline maths with `summarize()` and `toRecordInput()`. Do not change the JSX or the copy.
5. Test the cases in the order the rules apply:
   - no rows;
   - zero total;
   - missing price;
   - no method;
   - no payer;
   - underpaid;
   - overpaid without `creditFor`;
   - overpaid with credit, which yields a credit allocation of `diff`;
   - campaign plus months, where the campaign allocation carries the first row's memberId.

**Risks.** Behaviour drift during the move. Keep the functions pure and copy the expressions verbatim. Leave the OCR and upload flow out of scope.

**Verify.**
- `pnpm check` passes.
- `pnpm test src/components/app/payment-draft.test.ts` passes.
- `wc -l src/components/app/record.tsx` drops by about 80 or more.
- The e2e committee flow passes, as in plan 7.

### Plan 10 (P2): Trim dead code and the duplicate contracts, and add knip — Lanes A and B

**Why.** Dead factories and duplicate constants mislead agents: they look like the pattern to follow. Evidence is in #10 above.

**Files.**
- Lane A: `src/lib/data/queries.ts`, `tags.ts`, `index.ts`, `realtime.ts`, `labels.ts`.
- Lane B: `src/lib/offline/persister.ts`, `src/lib/offline/push-payload.ts`, `package.json` (knip dev dependency and script), `.github/workflows/ci.yml`.
- Lane C: `src/components/app/derive.ts` (labels).

**Steps.**
1. **(A)** Remove the unused factories from `queries.ts`; keep `publicQueries.fundSummary`. Remove the unused exports from `index.ts`: `getLateMembers`, `getMemberMonthsOf`, `getCurrentTerm`, `getHandover`, `getPayment`, `getProofUrl`. Delete their implementations only if nothing else uses them; check with `grep -rw`.
2. **(A)** In `realtime.ts:129-133`, keep only `invalidateQueries({ queryKey: [PUBLIC_KEY] })`. The committee screens refresh through `router.refresh()`. Confirm that in the `onChange` callers first.
3. **(A+B)** Keep one `PUBLIC_KEY`, in `lib/offline/persister.ts`, which owns what is persisted. `lib/data/tags.ts` re-exports it.
4. **(A+C)** `derive.ts` `CATEGORY_LABEL` becomes `export { CATEGORY_LABELS as CATEGORY_LABEL } from "@/lib/data/labels"`. Keep the member state labels separate, because they differ on purpose (deceased shows «غادر» in the UI, `derive.ts:136-141`), and add a comment saying so.
5. **(A+B)** Push payload: make `lib/push/payload.ts` export the wire type. `lib/offline/push-payload.ts` imports that type and keeps its tolerant parser. Add a test that `parse(JSON.parse(JSON.stringify(pendingPaymentPayload(...))))` round-trips.
6. **(B)** Add `knip` as a dev dependency, with `knip.json` entries for `src/app/**`, `src/proxy.ts`, `src/app/sw.ts`, `scripts/*.mts`, `e2e/**` and `supabase/import/*.mts`. Add `"knip": "knip"` and run it in CI as non-blocking first (`continue-on-error: true`), then blocking once it is clean.

**Risks.** Removing something a sibling branch (m2-backend, m2-ui) is about to use. Merge those first, or rebase and re-grep.

**Verify.**
- `pnpm check` and `pnpm build` pass.
- `pnpm knip` reports no unused exports under `src/lib/data`.

### Plan 11 (P2): One guard for committee pages — Lane C

**Why.** Each committee page hand-rolls `if (!session) redirect("/login?next=…")`:
- the `next` values differ;
- `campaigns/page.tsx:10-11` and `members/page.tsx:10-11` only check the role and fall through when the session is null.

RLS still protects the data (the views are `security_invoker`), but a new page copies whichever pattern it sees.

**Files.** `src/components/app/source.ts` and all `src/app/(app)/(committee)/committee/*/page.tsx`.

**Steps.**
1. Add the guard to `source.ts`:
   ```ts
   export async function requireCommittee(next: string, opts: { roles?: CommitteeRole[] } = {}) {
     const s = await committeeSession(); // already redirects a pending setup
     if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
     if (opts.roles && !opts.roles.includes(s.role)) redirect("/committee");
     return s;
   }
   ```
2. Replace the guards on every committee page with it, keeping each page's current role rule:
   - members and campaigns: `roles: ["admin","treasurer","deputy"]` (they redirect `committee` today);
   - handover: the same.
3. Leave `/committee/setup` alone; it deliberately uses `anyCommitteeSession()`.

**Risks.** Demo mode: `anyCommitteeSession()` returns a fake admin, so the guard passes. Check that the proxy (`src/proxy.ts`) behaviour is unchanged.

**Verify.**
- `pnpm check` passes.
- `grep -rn 'redirect("/login' "src/app/(app)/(committee)"` finds nothing.
- e2e committee spec passes.

### Plan 12 (P2): Types regeneration as a script — Lane A

**Why.** `database.types.ts` can only be made with `supabase gen types … --project-id vhcdgxgwdlflmxmqnxzf` (supabase/README "Types"), which means after the change is applied to production. There is no script, and nothing notices stale types.

**Files.** `package.json` (script only; coordinate with Lane B, who owns scripts) and `supabase/README.md`.

**Steps.**
1. Add `"db:types": "supabase gen types typescript --project-id vhcdgxgwdlflmxmqnxzf > src/lib/supabase/database.types.ts && prettier --write src/lib/supabase/database.types.ts"`.
2. Investigate whether `supabase gen types typescript --db-url postgresql://postgres@localhost:55433/sb` works against the run.sh database. Recent CLIs may need Docker for postgres-meta.
   - If it works, add `db:types:local` and document it: types come from the local DB before the production apply.
   - If it does not, document that the order is "apply to a Supabase branch → gen types from the branch", or use the MCP `generate_typescript_types`.
3. Document the step in the README and in RECIPES (plan 6).

**Stop and report if** local generation needs Docker. Do not add Docker to the workflow without the lead's approval.

**Verify.** `pnpm db:types && git diff --stat src/lib/supabase/database.types.ts` shows no diff on the current schema, apart from formatting.

### Plan 13 (P2): Complete `.env.example` — Lane B

**Files.** `.env.example` only.

**Steps.** Add these entries, each commented and with no real values:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY=`, `VAPID_PRIVATE_KEY=` (server only), `VAPID_SUBJECT=mailto:…`, with a comment on how to generate them (`npx web-push generate-vapid-keys`) and that without them push is off (`lib/push/send.ts` header);
- `# SONDOQ_FIXTURES=1` (fictional data plus demo mode, never production; see `components/app/demo.ts`);
- `# NEXT_PUBLIC_SITE_URL=` (the origin printed on shared reports; default in `next.config.ts:27-32`).

**Verify.** `grep -c "=" .env.example` goes up by 5. `pnpm build` is unaffected.

---

## 5. How hard is it to extend today? (content for docs/RECIPES.md)

### A. New committee write (RPC + action + UI): about 13 touch points

| # | Where | Guard today | Guard after the plans |
|---|---|---|---|
| 1 | `supabase/migrations/<real ts>_mNN_<slug>.sql`: body in `app_private` (definer), wrapper in `public` (invoker), grants, `app_private.set_action('<name>')` for audit, `fail('<code>')` for errors | m13 test (definer not in public) | plus version guard (plan 3) |
| 2 | `supabase/rollback/*_down.sql`: drop both functions | run.sh rollback + re-apply | same, in CI (plan 2) |
| 3 | `supabase/tests/m1_test.sql`: allowed role, forbidden role, each `fail` code | manual | in CI (plan 2) |
| 4 | Apply remotely (MCP), rename the file to the remote version, md5 check | manual | plan 3 README |
| 5 | `src/lib/supabase/database.types.ts`: regenerate | manual | `pnpm db:types` (plan 12) |
| 6 | `src/lib/data/errors.ts`: an Arabic message per new code | none | drift test (plan 4) |
| 7 | `src/lib/data/schemas.ts`: zod input schema and type | typecheck | same |
| 8 | `src/lib/data/actions.ts`: `export async function x(input) { return run(schema, input, (sb,p)=>sb.rpc(...), { touchesPublic }) }` | typecheck (rpc args typed) | same |
| 9 | `src/lib/data/actions-rpc.test.ts`: one row in `cases` | manual | same |
| 10 | `src/components/app/act.tsx`: demo stub or `"real"` | **none (silent fall-through)** | type error (plan 7) |
| 11 | UI: call via `const { x } = useAct()`, show `res.message` when not ok, `router.refresh()` when ok | lint (plan 7) | same |
| 12 | `supabase/README.md`: a table row | manual | same |
| 13 | If a table is added: `src/lib/backup/export.ts` `BACKUP_TABLES` | `satisfies` (names only) | optional: a type test that every `Tables` key is listed or explicitly excluded |

### B. New read (view → page)

1. Create the view with `security_invoker = true`, or grant anon only if it is public, plus a test.
2. Regenerate the types.
3. `read.ts`: `export async function x(c: Client)` using `many()`/`must()` and a mapper in `map.ts`, with a test in `map.test.ts`.
4. Add the UI type to `types.ts`.
5. `public.ts`: `cached("<view>", read.x, [])` if it is public; otherwise `committee.ts`.
6. Export it from `index.ts`.
7. Add `fx.fxX()` to `fixtures.ts`.
8. `source.ts`: `export const x = () => pick(fx.fxX, () => data.getX())`.

Steps 7–8 are the cost of the UI-level fixture seam; see Direction in §3.

### C. New committee page

1. Create `src/app/(app)/(committee)/committee/<route>/page.tsx` with `metadata`, `await src.requireCommittee("/committee/<route>", { roles })` (plan 11), the data from `src.*`, and `<Tab><View … /></Tab>`.
2. Put the view in `src/components/app/views/<name>.tsx` (client when interactive) and its styles in a `bq-<name>-*` block in `globals.css`.
3. Add a nav entry in `components/app/shell.tsx` if needed. `loading.tsx` and `error.tsx` are inherited.
4. Add an e2e smoke assertion in `e2e/committee.spec.ts`.

### D. New sheet

1. Use `components/app/sheet.tsx` (`useSheet`) as the container.
2. Keep form rules in a pure `*.ts` next to it, with tests (pattern: `receipt-model.ts`, and plan 9's `payment-draft.ts`).
3. Writes go through `useAct()`, and nothing else.

---

## 6. Suggested order

`1 → 2 → 4 → 3 (with the m13 rename) → 5 → 7 → 6 → 11 → 8 → 13 → 12 → 10 → 9`

- 1–2 put the safety net in place before anything else changes.
- 4 and 7 turn silent drift into CI failures.
- 5–6 fix what agents read first.
- 8–10 are structural cleanups, safe once the net exists.

Merge `m2-backend` (m13) before plan 10 and after plan 3's guard is ready, so the rename happens exactly once.

## 7. Not audited

- Runtime performance and bundle size.
- The SW caching rules in depth.
- OCR accuracy.
- Accessibility and visual design.
- Security of RLS policies beyond spot checks. The SQL tests cover them; the Supabase advisor was not run.
- Live Supabase state versus the repo (no remote queries were made).
- The worktrees other than `app` and `m2-backend`.
