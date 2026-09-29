@AGENTS.md

# صندوق الرابطة (Sondoq al-Baqie, «رابطة شباب قرية البقيع»)

A PWA for a village youth association fund (subscriptions, arrears, proof of payment, expenses, donation campaigns). Arabic RTL UI.

- **Before doing anything, read `docs/HANDOFF.md`** (status, next milestone, conventions) and `docs/DECISIONS.md`.
- Owner: AHMED (`ahmed-abdat`). Reply to him in Arabic, simply.
- Money is integers in old ouguiya (MRO); receipts show MRU (×10). See `src/lib/money.ts`.
- Never commit secrets or members' personal data (phones, receipt images, paper sheets).
- Package manager is **pnpm** (Node ≥ 22). Never use npm or commit a `package-lock.json`.

## Commands

- `pnpm dev`: dev server (Turbopack, service worker disabled).
- `pnpm build`: production build (`next build --webpack`, needed by Serwist); `pnpm start` serves it.
- `pnpm check`: typecheck + lint + unit tests. Run it and `pnpm build` before pushing; CI runs the same.
- `pnpm test` / `pnpm test:watch`: Vitest (happy-dom, `src/**/*.test.ts(x)`).
- `pnpm test:e2e`: Playwright on a 390px Pixel 7, locale `ar`, Africa/Nouakchott. Needs `pnpm build` first and `pnpm exec playwright install chromium` once.
- `pnpm format`: Prettier (+ Tailwind class sorting).
- `pnpm icons`: regenerate PWA icons from `public/logo.jpg`.

## Where things live

- Helpers (Arabic-only, unit tested): `src/lib/` (`money`, `format`, `dates`, `whatsapp`, `methods`, `receipt`, `compress-image`, `haptics`, `safe-storage`, `cn`/`utils`).
- Supabase: `src/lib/supabase/` (`client`, `server`, `proxy`, `admin` = server-only secret-key client). Auth email links land on `/auth/confirm`.
- shadcn primitives: `src/components/ui/` (`components.json`, style radix-maia, RTL). Visual tokens in `globals.css` are decided separately; do not restyle them here.
- PWA: `src/app/sw.ts` (Serwist), `public/offline.html`, `src/app/manifest.ts`.
- Deploy: `vercel.json` (region cdg1, deploys `main` only, daily `/api/keepalive` cron).
