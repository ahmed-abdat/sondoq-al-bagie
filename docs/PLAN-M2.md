# M2+ build plan — lanes and ownership (lead: session web-24)

Integration branch: `m2-app` (= m0-setup + m1-foundation + m1-schema). Each lane works in its own
worktree `.claude/worktrees/<lane>` on a branch cut from `m2-app`, commits small, never pushes, and
tells the lead when a slice is ready. The lead reviews and merges into `m2-app`.
Commits: no Co-Authored-By / AI attribution lines. Never commit real member data (see supabase/import/data/).

Approved design direction: prototype «M» on branch `prototype/design-direction`
(src/app/prototype/direction/variant-m.tsx + receipt.tsx; run it from worktree `.claude/worktrees/proto`,
`pnpm dev -p 3100`, open /prototype/direction?variant=M). It is the visual + UX reference; the lead
ports it into real components. Terminology: «الرسوم الشهرية» (monthly fee), «ما جُمع كل شهر»,
«المصاريف», «المساهمة/التبرعات». Arabic only, RTL, Western digits, logo palette (green ramp + tiny gold).

## Lane A — backend (session: sondoq-supabase)
Owns: `supabase/**`, `src/lib/supabase/**`, `src/lib/data/**` (new: typed queries + server actions), `src/app/api/**` except keepalive, `src/app/auth/**`.
1. Typed read layer for public views (fund_summary, member_status, member_months, monthly_collection, expense_totals, recent_expenses, campaign_progress, activity_feed) and committee views (arrears, pending payments) → `src/lib/data/*.ts`, server-side, cached/revalidated sensibly.
2. Server actions (zod-validated, typed results `{ok|error:code}` mapped from P0001 hints to Arabic messages): record_payment, confirm_payment, reject_payment, cancel_payment (+ undo = cancel within 5s window semantics — design it in SQL if needed), record_expense, log_reminder, admin actions.
3. Receipts: verification code per confirmed payment (random, unguessable, e.g. BQ-XXXX-NNNN), receipt number sequence, public `verify_receipt(code)` returning only public fields + status (valid/cancelled/not found). Public route data for `/r/[code]`.
4. Proof uploads: client compress → signed upload to private `proofs` bucket, magic-byte sniff, proof_hash dedupe; committee-only signed read URLs.
5. Committee auth: email+password login (exists), admin invites committee members (server action using admin client), first-admin bootstrap doc, logout, role in session for UI.
6. Realtime: payments changes → a small client hook `usePaymentsRealtime` (invalidate queries).
7. Local dev seed with fictional data mirroring reality (~45% paid full year, ~40% unpaid, rest partial; groups A 1000 / B 500; 70 members).
8. Tests for every action (unit + SQL).

## Lane B — PWA, offline, platform (session: sondoq-al-bagie-ce)
Owns: `src/app/sw.ts`, `next.config.ts`, `src/app/manifest.ts`, `public/**` (icons, offline.html, wallets), `scripts/**`, `src/lib/offline/**` (new), `src/components/providers/**` (new), `e2e/**`, `vercel.json`, `.github/**`.
1. Full installable PWA: manifest (name, short_name «صندوق البقيع», dir rtl, lang ar, theme/background from the logo green, display standalone, start_url, scope, shortcuts: «الأعضاء», «اللجنة»), maskable + any icons 192/512 + apple-touch + favicon from the logo, splash-friendly colours. Pass Lighthouse PWA installability.
2. Offline: Serwist precache app shell + runtime caching (pages NetworkFirst with offline fallback, static assets CacheFirst, Supabase REST GET for public views StaleWhileRevalidate with short max-age; never cache auth or committee writes). TanStack Query provider with IndexedDB persistence (idb-keyval) for public data; `useOnline` hook + offline banner «غير متصل — آخر تحديث قبل …»; write buttons disabled offline with explanation.
3. Install prompt UX (beforeinstallprompt on Android; iOS instructions sheet), update-available toast (SW waiting → «تحديث جديد متاح»).
4. Receipt image share utility: `src/lib/share-receipt.ts` — render a receipt to PNG (canvas, no heavy deps) + `navigator.share({files})` with wa.me fallback; unit-testable pieces.
5. e2e: offline reload shows cached home; install manifest valid; share fallback.
6. Vercel: link the project (`vercel link`), set env vars from .env.local (publishable only; never the secret), preview deploy of `m2-app` when the lead asks. Keep deploys to previews until the owner approves production.

## Lane C — design system + UI (lead + subagents)
Owns: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/**` (except providers), `src/app/(public)/**`, `src/app/(committee)/**`, `DESIGN.md`, `PRODUCT.md`.
Ports prototype M into real components wired to Lane A's data layer and Lane B's providers.

## Contracts between lanes
- Lane A exports typed functions from `src/lib/data/index.ts` and actions from `src/lib/data/actions.ts`; Lane C imports only from there.
- Lane B exports `<Providers>` from `src/components/providers/index.tsx` (QueryClient + persistence + online state) and `useOnline()`; the lead mounts it in layout.
- Shared types: `src/lib/supabase/database.types.ts` (Lane A regenerates).
