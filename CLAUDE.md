@AGENTS.md

# صندوق الرابطة (Sondoq al-Baqie, «رابطة شباب قرية البقيع»)

A PWA for a village youth association fund (subscriptions, arrears, proof of payment, expenses, donation campaigns). Arabic RTL UI.

- **Before doing anything, read `docs/HANDOFF.md`** (status, branches, conventions, how to ship) and `docs/DECISIONS.md`.
- Adding an RPC, read, page or sheet: follow `docs/RECIPES.md`.
- Owner: AHMED (`ahmed-abdat`). Reply in English, concisely (Arabic only if he writes Arabic).
- Money is integers in old ouguiya (MRO); receipts show MRU (×10). See `src/lib/money.ts`.
- Never commit secrets or members' personal data (phones, receipt images, paper sheets).
- Package manager is **pnpm** (Node ≥ 22). Never use npm or commit a `package-lock.json`.

## Commands

- `pnpm dev`: dev server (Turbopack, service worker disabled).
- `pnpm build`: production build (`next build --webpack`, needed by Serwist); `pnpm start` serves it.
- `pnpm check`: typecheck + lint + unit tests. Run it and `pnpm build` before pushing; CI runs the same.
- `pnpm test` / `pnpm test:watch`: Vitest (happy-dom, `src/**/*.test.ts(x)`).
- `pnpm test:e2e`: Playwright on a 390px Pixel 7, locale `ar`, Africa/Nouakchott, against a fixtures build only: `SONDOQ_FIXTURES=1 pnpm build && SONDOQ_FIXTURES=1 PORT=3410 pnpm test:e2e` (`pnpm exec playwright install chromium` once).
- `pnpm format`: Prettier (+ Tailwind class sorting).
- `pnpm icons`: regenerate PWA icons from `public/logo.jpg`.

## Where things live

- Helpers (Arabic-only, unit tested): `src/lib/` (`money`, `format`, `dates`, `whatsapp`, `methods`, `receipt`, `compress-image`, `haptics`, `safe-storage`, `cn`/`utils`).
- Supabase: `src/lib/supabase/` (`client`, `server`, `proxy`, `admin` = server-only secret-key client). No email flows: the admin creates accounts and resets passwords; first sign-in goes to `/committee/setup`.
- shadcn primitives: `src/components/ui/` (`components.json`, style radix-maia, RTL). Visual tokens in `globals.css` are decided separately; do not restyle them here.
- PWA: `src/app/sw.ts` (Serwist), `public/offline.html`, `src/app/manifest.ts`.
- SQL: `supabase/migrations/` (m1–m13; RPC bodies in `app_private` as SECURITY DEFINER, `public` SECURITY INVOKER wrappers), tests via `supabase/tests/local/run.sh`. See `supabase/README.md`.
- Demo mode: `SONDOQ_FIXTURES=1` on a non-production build (fictional data, writes simulated; `src/components/app/demo.ts`).
- Deploy: live at https://baqie.vercel.app. `vercel.json` (region cdg1): only `main` deploys (production). `m2-app` is the lead's LOCAL integration branch (never pushed); the lead merges lane branches there, runs checks, then pushes `m2-app:main`. Crons: `/api/keepalive` daily, `/api/backup` weekly.
