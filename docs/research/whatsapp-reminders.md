# WhatsApp reminders and receipts

**v1 (free):** prefilled `https://wa.me/<phone>?text=...` links, opened by a committee member from the app.
- "ذكّر" on each member in the arrears list: name, months owed, amount.
- "رسالة المجموعة الشهرية": one message listing everyone behind, to paste into the WhatsApp group.
- "أرسل الإيصال" after a payment is confirmed.
- Every tap is logged in `reminders` (member, kind, who, when), so nobody can say they were not reminded.

**Later (optional): WhatsApp Cloud API.** Mauritania is in Meta's "Rest of Africa" pricing zone; a utility template costs about $0.004 per message, so under $1/month for ~71 members. It needs a dedicated phone number, a Meta Business account, approved templates and an international payment card (possible blocker). Do not use unofficial WhatsApp libraries: they get numbers banned.
