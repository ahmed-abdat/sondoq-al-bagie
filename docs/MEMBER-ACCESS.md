# Member access (personal link) · spec v1

Owner-approved direction (2026-09-29). Goal: each member gets a private link that personalises the app
and lets them send a payment with proof for the committee to confirm. Nothing public gets hidden.

## Principles
- **Personalise, don't restrict.** Public pages, the full member list and the report stay public for
  everyone. The link only adds «أنت» on top and a way to send payments.
- **A member may pay for anyone** (brothers, cousins, several members in one transfer), exactly like the
  committee's «سجّل دفعة». The committee always confirms or rejects.
- **No password, no SMS, no Supabase auth user.** The link is the key. The committee creates it and sends it
  on WhatsApp; a new link revokes the old one.
- Free plan only. No new paid services.

## The link
- Format: `https://baqie.vercel.app/m/<token>` (token: 32 random bytes, base64url). The database stores only a
  SHA-256 hash of the token, never the token.
- `/m/<token>` (server): verifies the hash, sets an httpOnly, Secure, SameSite=Lax cookie `bq_member` holding
  the token (1 year), then redirects to `/`. Invalid or revoked → a calm page «هذا الرابط لم يعد يعمل. اطلب
  رابطًا جديدًا من اللجنة.»
- «خروج من هذا الجهاز» clears the cookie. Revoking in the committee stops the link everywhere at the next request.
- Installed app (iOS keeps the home-screen app's cookies separate from Safari): the `/m/<token>` page offers
  «أضف التطبيق إلى الشاشة الرئيسية» *after* the cookie is set in that context; the installed app shows a
  «لديك رابط؟ الصقه هنا» field when no member cookie exists (paste → same verification).

## Several people on one phone (owner decision 2026-09-29)
- A phone remembers up to 5 member profiles (family phones). All data lives on the server, so nothing is lost by switching.
- Opening a different person's link while signed in asks: «هذا الهاتف مفتوح باسم أحمد. هذا رابط محمد.» → «أضف محمد وانتقل إليه» / «ابقَ باسم أحمد».
- Opening a link already saved on the phone just switches to it. The «أنت» card has a switcher when more than one is saved.
- «إزالة X من هذا الهاتف» removes only that person; the others stay.
- Notifications on that phone cover every saved person and say whose payment it is.
- Cookies: `bq_member` (active token), `bq_member_saved` (≤5 tokens), `bq_member_pending` (10 min), `bq_member_on` (readable marker).

## What the member sees (all public pages unchanged, plus)
- **Home «أنت» card:** name + number («ب 12»), status «أنت منتظم» / «عليك 3 أشهر · X أوقية», months as dots,
  credit if any, button «أرسلت دفعة».
- **«دفعاتي» page (`/me`):** own payments (date, amount, months, for whom, receipt link/share), payments I sent
  for others, and my submissions waiting «بانتظار التأكيد» or rejected with the reason.
- **«أرسلت دفعة» sheet:** the committee record flow in member mode: members (me first, then «دفعت لهم
  سابقًا» = members covered by earlier payments sent through this link, then the full list), months, wallet,
  screenshot (required) with OCR prefill, amount, date, optional note. Summary line, one button. Result:
  «أُرسلت إلى اللجنة. ستصلك رسالة عند التأكيد.»
- **«ادفع الآن»:** the fund's wallet numbers (existing «كيف أدفع؟») and the amount due.
- **Notifications (opt-in):** «تم تأكيد دفعتك» (with receipt), «رُفضت الدفعة: السبب». Later: monthly reminder.

## What the committee sees
- Member sheet: «رابط العضو»: create / send on WhatsApp («هذا رابطك الخاص في صندوق الرابطة: …») / new link
  (revokes old) / stop. Shows «آخر استخدام قبل …».
- Pending queue: member submissions look like any pending payment plus «أرسلها العضو X عبر رابطه».
  Confirm / reject as today (own-membership rule unchanged). Reject asks a reason (sent to the member).

## Guards
- Per link: at most 5 pending submissions at once and 10 per day (`member_rate_limited` «أرسلت دفعات كثيرة
  اليوم. انتظر تأكيد اللجنة.»).
- Screenshot required, size and type limits as today; duplicate proof hash and normalised txn ref checks as today.
- Allocations validated by the same triggers (owed months, prices, closed campaigns).
- Token verification is constant-time on the hash; failed verifications are rate limited per IP at the route.
- Member writes never create confirmed payments; only confirmers confirm.

## Data (Lane A)
- `member_links(id, member_id, token_hash unique, created_by, created_at, revoked_at, revoked_by, last_used_at)`,
  one active link per member.
- `payments.submitted_via_link uuid null` (FK member_links).
- RPCs (app_private definer + public invoker wrapper, per convention):
  - committee: `create_member_link(member)` → token (shown once), `revoke_member_link(member)`.
  - server-only (service role, called by our server after cookie check): `member_session(token_hash)` →
    member summary or null (updates last_used_at at most hourly); `member_history(token_hash)`;
    `member_submit_payment(token_hash, p_id, payer, method, amount, paid_on, allocations, txn_ref, proof_path,
    proof_hash, note)` → pending payment id (replay on same id); `member_recent_beneficiaries(token_hash)`.
  - Proof upload for members: server action verifies the cookie, then creates a signed upload URL with the
    secret key under `proofs/member/<link id>/…`.
- Member push: `member_push_subscriptions(link_id, endpoint, keys)`; server sends on confirm/reject.
- Tests for every RPC, the rate limits, revoke, replay, and that anon/authenticated cannot call the
  server-only RPCs.

## Ownership
- Lane A: schema, RPCs, `src/lib/data/member.ts` (server-only reads/actions taking the cookie), errors, tests.
- Lane B: `/m/[token]` route cookie handling in `src/proxy.ts` if needed, paste-link flow in the installed app,
  member push (subscribe, SW display, send on confirm/reject), offline rules (member data never cached publicly).
- Lane C: home «أنت» card, `/me`, «أرسلت دفعة» (member mode of the record flow), committee link management and
  queue label, demo mode (fixture member link `/m/demo`).

Ship when all three are green, in one release.
