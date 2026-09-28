# صندوق البقيع

تطبيق ويب (PWA) لإدارة صندوق رابطة شباب قرية البقيع: اشتراكات الأعضاء، المتأخرات، إثبات الدفع، المصاريف، وحملات التبرع، مع صفحة عامة شفافة يراها كل الأعضاء.

A PWA for the Al-Baqie youth association fund: member subscriptions, arrears, payment proof, expenses and donation campaigns, with a public transparency page. The UI is Arabic (RTL).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth, Storage) · Vitest · Vercel.

## Run locally

```bash
cp .env.example .env.local   # fill in your Supabase URL and publishable key
npm install
npm run dev
```

The public page works without Supabase settings; committee login needs them.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Notes

- Money is stored as whole numbers in old ouguiya (MRO). Receipts usually show new ouguiya (MRU): 1 MRU = 10 MRO. See `src/lib/money.ts`.
- `/committee/*` requires a signed-in committee member (`src/proxy.ts`). Members use the public page without an account.
