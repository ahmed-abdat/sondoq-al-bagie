@AGENTS.md

# صندوق البقيع (Sondoq al-Baqie)

A PWA for a village youth association fund (subscriptions, arrears, proof of payment, expenses, donation campaigns). Arabic RTL UI.

- **Before doing anything, read `docs/HANDOFF.md`** (status, next milestone, conventions) and `docs/DECISIONS.md`.
- Owner: AHMED (`ahmed-abdat`). Reply to him in Arabic, simply.
- Money is integers in old ouguiya (MRO); receipts show MRU (×10). See `src/lib/money.ts`.
- Never commit secrets or members' personal data (phones, receipt images, paper sheets).
- Run `npm run lint && npm run typecheck && npm test && npm run build` before pushing.
