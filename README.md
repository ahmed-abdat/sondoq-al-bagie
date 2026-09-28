# صندوق البقيع

تطبيق ويب (PWA) لإدارة صندوق رابطة شباب قرية البقيع: اشتراكات الأعضاء، المتأخرات، إثبات الدفع، المصاريف، وحملات التبرع، مع صفحة عامة شفافة يراها كل الأعضاء.

A PWA for the Al-Baqie youth association fund: member subscriptions, arrears, payment proof, expenses and donation campaigns, with a public transparency page. The UI is Arabic (RTL).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase (Postgres, Auth, Storage) · Serwist (PWA) · Vitest · Playwright · Vercel.

## Run locally

Needs Node 22+ and pnpm 10 (`corepack enable` installs the version pinned in `package.json`).

```bash
cp .env.example .env.local   # fill in your Supabase URL and publishable key
pnpm install
pnpm dev
```

The public page works without Supabase settings; committee login needs them.

## Checks

```bash
pnpm check        # typecheck + lint + unit tests
pnpm build        # production build (webpack, generates the service worker)
pnpm test:e2e     # Playwright smoke tests (after pnpm build; first run: pnpm exec playwright install chromium)
pnpm format       # Prettier
```

## Deploy

Vercel (`vercel.json`): region `cdg1`, only `main` deploys. A daily cron calls `/api/keepalive` so the free Supabase project does not pause. Set `CRON_SECRET` in Vercel. `SUPABASE_SECRET_KEY` is server-only and stays in Vercel settings.

## Notes

- Money is stored as whole numbers in old ouguiya (MRO). Receipts usually show new ouguiya (MRU): 1 MRU = 10 MRO. See `src/lib/money.ts`.
- Project docs, decisions and the handoff for new contributors are in [`docs/`](docs/README.md).
- `/committee/*` requires a signed-in committee member (`src/proxy.ts`). Members use the public page without an account.
