# Going live: owner checklist

Supabase project `vhcdgxgwdlflmxmqnxzf` (schema already applied, see `supabase/README.md`),
hosted on a free `*.vercel.app` address. Do the steps in order; each one says where.
Never paste a secret key into a chat, a file in the repo, or a screenshot.

## 1. Supabase → Authentication

- **Sign In / Providers → Email**: turn **off** "Allow new users to sign up". Committee accounts
  are created only by the admin in the app. (Until this is off, anyone can create a login; they still see
  no member data, but turn it off before sharing the link.)
- No email templates or redirect URLs are needed: committee accounts are created by the admin in
  the app (email **or** phone number + a generated password), not by invitation emails.

## 2. Supabase → API keys

Settings → API Keys: copy the **Project URL**, the **publishable** key (`sb_publishable_…`) and a
**secret** key (`sb_secret_…`, create one if none). Only the owner handles the secret key.

## 3. Vercel → Project → Settings → Environment Variables (Production)

| Variable | Value | Why |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | every page |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | every page (safe in the browser) |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` | creating committee accounts, resetting their passwords, the weekly backup; server only |
| `CRON_SECRET` | any long random string (e.g. from a password manager) | protects the daily keep-alive and weekly backup |
| `NEXT_PUBLIC_SITE_URL` | `https://baqie.vercel.app` | links inside WhatsApp messages and on shared report images |

Do **not** set `SONDOQ_FIXTURES` in production (it switches the app to demo data).
Redeploy after changing variables. Crons (`vercel.json`, production only): keep-alive daily at
06:17 UTC (the free Supabase project pauses after 7 idle days), backup Sundays 03:00 UTC.

## 4. First admin (once)

1. Supabase → Authentication → Users → **Add user → Create new user**: your email and a strong
   password, tick "Auto confirm user".
2. Copy the new user's id, then Supabase → **SQL Editor**:

   ```sql
   select public.set_committee_member('<user id>', 'AHMED', 'admin');
   ```

3. Open `https://<site>/login` and sign in with that email. You should see the committee pages.

Then add the others in the app (committee settings, `/committee/settings` → accounts): name, email
**or** Mauritanian phone number, role (`treasurer` أمين الصندوق, `deputy` نائبه, `committee` عضو لجنة,
`admin`). The app shows a generated password **once**: send the login and password to the person
yourself (WhatsApp). They sign in on `/login` with the email or the phone number. If a password is
lost, the admin resets it there (a new one is shown once). Accounts are deactivated, never deleted.
This needs `SUPABASE_SECRET_KEY` on Vercel. Link a committee member to their own member row so
nobody confirms their own payment. The admin, the treasurer and the deputy confirm money.

## 5. Settings in the app (admin, `/committee/settings`)

- Fund accounts («الحسابات»): each wallet number members send money to (method, number, holder name exactly as
  the wallet app shows it — Latin letters for Sedad/Masrvi — so receipt reading can check it).
- WhatsApp number of the committee for transfer screenshots.
- Opening balance of the fund at the start of 2026; grace days (10); show amounts owed publicly (off).
- Prices: 2026 is set (A 1000, B 500). Add next year's prices before January.

## 6. Members and 2026 payments

Only after the committee confirms the transcription (see `supabase/README.md` → "Import the paper
sheets"): run the import script locally, then paste in **SQL Editor**, in order:

1. `1-members-2026.sql`: the 91 members (list A 1–21, list B 1–70). No money.
2. `2-payments-2026.sql`: paper payments of the confirmed pages only.

Each file is one transaction and safe to run again. The files contain names: delete them from your
computer after the import, never commit or share them.

## 7. Before sharing the public link

- [ ] Sign-ups off (step 1).
- [ ] Sign in as admin works; a committee account created in the app can sign in with its phone number.
- [ ] Public page shows 91 members and the right totals; «X من N» counts active members.
- [ ] Record a small test payment as treasurer, check the receipt link `/r/<code>`, then cancel it
      with a reason.
- [ ] `https://<site>/api/keepalive` returns `{"ok":true,…}` (with the cron header only; a plain
      visit answers 401, that is fine).

## 8. Weekly backup

`/api/backup` writes every table to one JSON file in the private `backups` bucket
(`<year>/<date>.json`) and keeps the latest 12. To read one: Supabase → Storage → backups →
download. Committee logins are not in the file (recreate them in the app); proof images stay in the
`proofs` bucket.

## 9. End of a committee term («تسليم الصندوق»)

The outgoing treasurer/admin starts the handover in the app, enters the money actually held
(cash and each wallet) and submits it. A **different admin** — the incoming one — accepts it:
create their account as `admin` first (needs `SUPABASE_SECRET_KEY` on Vercel). Acceptance closes the term,
opens the next one with the counted money, books any difference publicly as «فرق عند التسليم»,
and deactivates the committee accounts that were not kept.

