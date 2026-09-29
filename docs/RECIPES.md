# Recipes: extending the app

Checklists for the common changes. **[test]** = a test or the typechecker catches a miss;
**[manual]** = nothing catches it, so do not skip it. Lane owners are in [PLAN-M2.md](PLAN-M2.md).

## A. New committee write (RPC → action → UI)

Database (Lane A):

1. [ ] **Migration** `supabase/migrations/<YYYYMMDDHHMMSS>_mNN_<slug>.sql` (real UTC timestamp).
   Pattern: `supabase/migrations/20260929073339_m13_rpc_wrappers.sql`.
   - Body: `create function app_private.<name>(…) … security definer set search_path = ''`.
     Check the role inside; call `perform app_private.set_action('<name>')` for the audit log;
     raise errors with `perform app_private.fail('<code>')` (P0001 + HINT).
   - Wrapper: `create function public.<name>(…)` with the **same** params and defaults,
     `language sql security invoker set search_path = ''`, body `select app_private.<name>(p => p, …)`.
   - Grants on both: `revoke all … from public, anon` (+ `authenticated` on the wrapper), then
     `grant execute … to authenticated, service_role`.
   - Changing an existing RPC: `create or replace function app_private.<name>`. Touch the
     `public` wrapper only if the signature changes (then drop and recreate both).
   - [test] a SECURITY DEFINER function in `public` fails `supabase/tests/m1_test.sql`.
2. [ ] **Rollback**: drop both functions in `supabase/rollback/m2_down.sql` (newest first). [test] `run.sh` rolls back and re-applies.
3. [ ] **SQL tests** in `supabase/tests/m1_test.sql`: allowed role, forbidden role, each `fail`
   code (`tests.login`, `tests.ok`, `tests.throws`). [manual] Run `supabase/tests/local/run.sh`
   until it prints `OK` (not in CI yet).
4. [ ] **Apply** remotely through the Supabase MCP, rename the file to the version the remote
   recorded, check the md5. [manual]
5. [ ] **Types**: regenerate `src/lib/supabase/database.types.ts` (command in `supabase/README.md` §Types). [manual]
6. [ ] **README**: add a row to the table in `supabase/README.md`. [manual]
7. [ ] **New table?** Add it to `BACKUP_TABLES` in `src/lib/backup/export.ts`. [manual]

App (Lane A):

8. [ ] **Error messages**: an Arabic message per new code in `MESSAGES`, `src/lib/data/errors.ts`.
   [manual] A missing code shows «حدث خطأ غير متوقع».
9. [ ] **Schema**: zod input schema + type in `src/lib/data/schemas.ts`. [test] typecheck.
10. [ ] **Action** in `src/lib/data/actions.ts`, via `run()`:
    ```ts
    export async function cancelExpense(input: { id: string; reason: string }) {
      return run(s.cancelExpenseSchema, input,
        (sb, p) => sb.rpc("cancel_expense", { p_expense_id: p.id, p_reason: p.reason }),
        { touchesPublic: true }); // true when public numbers can change
    }
    ```
    [test] RPC args are typed from `database.types.ts`.
11. [ ] **Contract test**: one row in `cases` in `src/lib/data/actions-rpc.test.ts` (action → RPC
    name, snake_case args, cache expiry). [manual]

UI (Lane C):

12. [ ] **Demo stub** in the `demo` map of `src/components/app/act.tsx`. [manual] The map is
    `Partial`, so a missing stub **silently calls the real server action** in demo mode.
13. [ ] **Call it** only through `const { x } = useAct()` (never import `@/lib/data/actions`
    directly). Not ok → show `res.message`; ok → `router.refresh()`. Disable the button offline
    (`useOnline()` + `<OfflineWriteHint/>`).

## B. New read (view → page)

1. [ ] **View** in a migration: `with (security_invoker = true)` for committee data; grant `anon`
   only for public views with no phones or proofs. Add a test in `supabase/tests/m1_test.sql`.
2. [ ] Regenerate `src/lib/supabase/database.types.ts`.
3. [ ] **Reader** in `src/lib/data/read.ts` (`export async function x(c: Client)` using
   `many()`/`must()`), mapper in `src/lib/data/map.ts`, test in `src/lib/data/map.test.ts`.
4. [ ] **UI type** in `src/lib/data/types.ts` (non-null shapes).
5. [ ] **Entry point**: public → `cached("<view>", read.x, <empty>)` in `src/lib/data/public.ts`
   (60 s, `PUBLIC_TAG`); committee → `committee(read.x, <empty>)` in `src/lib/data/committee.ts`.
6. [ ] Export it from `src/lib/data/index.ts`.
7. [ ] **Fixture** `fxX()` in `src/components/app/fixtures.ts` (fictional data only). [manual]
8. [ ] **Door** in `src/components/app/source.ts`:
   `export const x = () => pick(fx.fxX, () => data.getX())`. Pages import only `source.ts`.

## C. New committee page

1. [ ] `src/app/(app)/(committee)/committee/<route>/page.tsx`: `metadata` title
   «… · صندوق الرابطة», a guard, data from `src.*`, then `<Tab><View … /></Tab>`.
   Pattern: `src/app/(app)/(committee)/committee/expenses/page.tsx`.
   - Guard: `if (!(await src.committeeSession())) redirect("/login?next=/committee/<route>")`,
     plus a role check if confirmers only (`admin`/`treasurer`/`deputy`). `committeeSession()`
     also sends a pending first sign-in to `/committee/setup`. [manual] RLS still protects data.
2. [ ] **View** in `src/components/app/views/<name>.tsx` (client when interactive), styles in a
   `bq-<name>-*` block in `src/app/globals.css` (tokens only, see `DESIGN.md`).
3. [ ] Nav entry in `src/components/app/shell.tsx` if needed. `loading.tsx` and `error.tsx` are
   inherited from `src/app/(app)/(committee)/committee/`.
4. [ ] **e2e** smoke assertion in `e2e/committee.spec.ts`, run on a fixtures build:
   `SONDOQ_FIXTURES=1 pnpm build && SONDOQ_FIXTURES=1 PORT=3410 pnpm test:e2e`.

## D. New sheet

1. [ ] Container: `Sheet` / `useSheet()` from `src/components/app/sheet.tsx`.
2. [ ] Form rules in a pure `*.ts` next to it, with a unit test (pattern:
   `src/components/app/receipt-model.ts` + `receipt-model.test.ts`).
3. [ ] Writes go through `useAct()` only (recipe A, step 13).

## Before handing over

`pnpm check` and `pnpm build`; `supabase/tests/local/run.sh` for SQL; e2e on a fixtures build for UI.
