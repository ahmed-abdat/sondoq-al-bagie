# Money privacy · spec v1 (owner decision 2026-09-29)

> **Retired (2026-09-30).** The app is now for the committee only ([COMMITTEE-ONLY-PLAN.md](COMMITTEE-ONLY-PLAN.md)):
> there are no public pages and no strangers to hide money from. m28 revoked every anonymous read
> except `keepalive`. Kept for history only; do not build on it.

Money figures are visible only to **the committee** (signed in) and **members with their personal link**
(`bq_member` cookie, verified). Strangers (no session) still see the app's layout, member names, numbers and
which months are paid, but every money figure is replaced by «•••». This is real protection: the server never
sends amounts to a stranger. An eye icon alone was rejected (cosmetic).

## What counts as money (hidden from strangers)
- Fund balance «في الصندوق الآن», «جُمع هذا العام», «صُرف هذا العام», opening balance, adjustments, term figures.
- «ما جُمع كل شهر» amounts, expense amounts and totals, campaign targets/raised/spent, contribution amounts.
- Activity feed amounts, report totals («المجموع: …»), report summary figures, «عليه حتى الآن …» lines.
- Link previews (Open Graph images, /report/opengraph-image): no money figures at all (they are public by nature).

## What stays public
- Member names, numbers, groups, statuses, which months are paid (✓ grid), counts («21 عضوًا»).
- The monthly fee per group («الرسوم الشهرية: 1 000 أوقية») so people know what to pay, and «كيف أدفع؟» numbers.
- Receipt verification `/r/<code>` (whoever holds a receipt code sees that receipt's amount; unchanged).

## Stranger view
- Same pages, amounts shown as «•••» (same width feel, not an error). One calm line where money appears first
  (hero / accounts / report): «الأرقام للأعضاء واللجنة. افتح رابطك الخاص لتراها.» with a small «لديك رابط؟»
  that opens the paste flow (installed app) or explains «اطلب رابطك من اللجنة».
- No flash of real numbers, no amounts in HTML, RSC payloads, JSON, the service-worker cache or the persisted
  query cache for strangers.

## Chosen design (owner, after prototype branch proto/money-hidden)
- **Home hero (variant A):** figures replaced by «••• •••» (same width for every figure, never hints at size),
  small lock next to «في الصندوق الآن», one line under the figures: lock icon + «الأرقام للأعضاء واللجنة. افتح
  رابطك الخاص لتراها.» + underlined «لديك رابط؟».
- **/accounts (variant C):** the «كيف حُسب الرصيد؟» breakdown is replaced by a soft green card: lock in a gold
  circle, «الحساب كاملًا يظهر للأعضاء», «ما كان في الصندوق، وما جُمع، وما صُرف. افتح رابطك الخاص لتراه.»,
  actions «لديك رابط؟ افتحه هنا ›» and WhatsApp «اطلب رابطك». The monthly section becomes «من دفع كل شهر»
  with counts («دفع 18 من 21») instead of amounts.
- Other money places (report totals, expenses, campaigns, activity) follow A: «••• •••» in place of the figure.

## Architecture
- **DB (Lane A):** anon loses SELECT on money views/columns (fund_summary, monthly_collection, expense_totals,
  recent_expenses, campaign_progress / contributions amounts, activity_feed amount, terms_public figures, report
  data). Provide amount-free public variants where pages need structure (e.g. activity without amount,
  campaigns without figures). Money reads: committee via RLS as today; members via server-only RPCs that take
  the member token hash (like member_session). Tests: anon gets no amounts anywhere (scan every public view).
- **Server/pages (Lane C, with A's reads):** public pages stay static for the layout; money comes from one
  private, `no-store` source (e.g. a route handler or server action `getMoney()` that checks the committee
  session or the member cookie) and fills a `<Money>` component; strangers get `null` → «•••». Members' and
  committee pages may be dynamic.
- **Offline/SW (Lane B):** money responses are private: never cached by the SW, and persisted query keys for
  money must not start with "public" (per-device cache for an authorised device is fine only if cleared on
  sign-out / «إزالة من هذا الهاتف»). OG images without amounts. e2e: stranger sees «•••» and no digits of the
  balance anywhere in the HTML/RSC/network; member (/m/demo) and committee (demo) see numbers.

Ship when all three are green, in one release. Order: A contract first → B/C build against it.
