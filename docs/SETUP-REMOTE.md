# Supabase project setup (owner checklist)

Project: `vhcdgxgwdlflmxmqnxzf`. The schema is already applied (see `supabase/README.md`).
Do these once, in the Supabase Dashboard, in this order.

## 1. Auth settings

- **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up".
  Committee accounts are only created by invitation.
- **Authentication → URL Configuration**
  - Site URL: the production address (e.g. `https://sondoq-albaqie.vercel.app`).
  - Redirect URLs: add `https://<production>/auth/confirm**`, `https://*-<team>.vercel.app/auth/confirm**`
    (previews) and `http://localhost:3000/auth/confirm**`.

## 2. Email templates (Authentication → Emails)

The app verifies links on the server (`/auth/confirm`), so each link must carry the token hash.
Replace the button link in these templates:

| Template | Link |
|---|---|
| Invite user | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/committee/settings` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/committee/settings` |
| Change email address | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/committee` |

Arabic wording for the invite, for example: «دُعيت إلى لجنة صندوق البقيع. اضغط الرابط واختر كلمة سر.»

## 3. First admin (once)

1. **Authentication → Users → Add user → Create new user**: your email and a password,
   tick "Auto confirm user".
2. Copy the user's id, then in **SQL Editor** run:

   ```sql
   select public.set_committee_member('<user id>', 'AHMED', 'admin');
   ```

From then on the admin invites the other committee members from the app
(Committee → Settings), which emails them a link to choose a password.

## 4. Server keys (Vercel only)

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel + `.env.local` | `sb_publishable_…`, safe in the browser |
| `SUPABASE_SECRET_KEY` | **Vercel only** (Production + Preview) | `sb_secret_…`; needed only to send committee invites. Never commit it or paste it in chat. |
| `NEXT_PUBLIC_SITE_URL` | Vercel | optional; base of links in emails (defaults to the request origin) |

## 5. Settings in the app (admin)

- Fund wallet numbers (Committee → Settings → الحسابات): method, number, holder name as the wallet shows it.
- Committee WhatsApp number for transfer screenshots.
- Opening balance at the start of 2026, grace days (10), whether the public page shows amounts owed.

## 6. 2026 paper sheet import

Only after the committee confirms the transcription: see "Import the paper sheets" in
`supabase/README.md` (dry run first, then paste the generated SQL into the SQL Editor).

## 7. Weekly backup

`GET /api/backup` (Vercel cron, production only) writes every table to one JSON file in the
private `backups` bucket (`<year>/<date>.json`) and keeps the latest 12. It needs, in Vercel
(Production): `CRON_SECRET` (any long random string; Vercel sends it to crons) and
`SUPABASE_SECRET_KEY`. To restore or read one: Storage → backups → download. Auth accounts are
not in the file (recreate committee logins by invitation). Proof images stay in the `proofs`
bucket and are not copied.
