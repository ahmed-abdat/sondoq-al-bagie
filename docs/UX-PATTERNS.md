# UX patterns: reuse what villagers already know

Research note (2026-09-29). Goal from the owner: the app should be easy for everyone **without anyone
learning anything new**. So every proposal below copies a pattern people already use every day in
WhatsApp, their mobile-money wallet (Bankily, Masrvi, Sedad, Click, BIM, Amanty), phone credit, or the
paper sheet.

Read this with [UX-AUDIT.md](UX-AUDIT.md) (the r26 audit; many of its fixes have shipped since),
[MONEY-PRIVACY.md](MONEY-PRIVACY.md) and [MEMBER-ACCESS.md](MEMBER-ACCESS.md).

**Owner decisions this note respects (and does not reopen):**
- Strangers see money as «••• •••».
- The personal link needs no password.
- The month grid shows a plain ✓ or an empty cell: no circles, dots or tints, and no current-month emphasis.
- No «X من 12» or «متأخر 9» wording.
- Western digits, and no em dashes in Arabic copy.
- The committee confirms every payment.

The bias throughout is **fewer things, not more features**.

---

## 1. Principles for these users

1. **Show the answer first, in one sentence, at the top.** Lower-literacy readers read word by word and
   do not scan, so the main point goes at the very top.
   [NN/g, lower-literacy users](https://www.nngroup.com/articles/writing-for-lower-literacy-users/)
2. **Use one column, one job per screen, and little scrolling.** Scrolling "breaks lower-literacy users'
   visual concentration". [NN/g](https://www.nngroup.com/articles/writing-for-lower-literacy-users/)
3. **No hierarchies you can only understand by reading. Keep it shallow and linear.** Menus and forms
   that depend on text failed for novice and low-literacy users. [Medhi et al., TOCHI 2011](https://www.microsoft.com/en-us/research/publication/designing-mobile-interfaces-for-novice-and-low-literacy-users/);
   [Medhi et al., CHI 2009 (mobile money UIs)](https://dl.acm.org/doi/10.1145/1518701.1518970)
4. **Put an icon, a number and a word together, never an icon alone.** Semi-abstract pictures plus
   voice or text beat text-only interfaces, and a consistent help cue matters.
   [Medhi, Sagar, Toyama, ITID 2007](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/medhi_ictd2006.pdf)
5. **Voice is a first-class input.** People in West Africa already live on WhatsApp voice notes; speaking
   is faster than typing and does not depend on literacy.
   [Rest of World, Senegal](https://restofworld.org/2023/whatsapp-voice-notes-farming-senegal/);
   [Google Design, NBU](https://design.google/library/connectivity-culture-and-credit)
6. **Borrow the vocabulary of the wallet and of WhatsApp** (transfer, screenshot, share, copy the
   number) instead of inventing ours. [Google Design, NBU](https://design.google/library/connectivity-culture-and-credit)
7. **Say out loud why it is safe.** Explicit trust lines («your number is safe with us») work for users
   who fear misuse. [Google Design, NBU](https://design.google/library/connectivity-culture-and-credit)
8. **Prefer undo over "are you sure?".** Keep confirmations for rare, costly actions only.
   [NN/g, confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog/);
   [NN/g, user control](https://www.nngroup.com/articles/user-control-and-freedom/)
9. **Put the primary action in thumb reach.** About half of people hold the phone in one hand and
   use their thumb. [Hoober, UXmatters](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php)
10. **Design offline-first and data-light, for weak 3G on cheap phones.**
    [Google Design, NBU](https://design.google/library/connectivity-culture-and-credit)
11. **Mirror layout and direction for RTL, but not numbers or progress.**
    [Material, bidirectionality](https://m2.material.io/design/usability/bidirectionality.html)
12. **Do not rely on the camera or QR codes.** Cheap phones have poor cameras, which is why Tez used
    sound. [Increment, Tez case study](https://increment.com/frontend/case-study-mobile-payments-in-india/)

---

## 2. Pattern catalog, by impact on low-literacy users

Effort key:
- **S** is under half a day.
- **M** is one to two days.
- **L** is more than that.

Lane owners are in brackets.

### P1. «دفع حتى أغسطس»: one status phrase, like phone credit «صالح حتى»

- **Where they know it from:** prepaid credit and data bundles («صالح حتى 30 سبتمبر»), and the paper
  sheet, where you look for the last mark. It is one date, with no counting or arithmetic.
- **What it looks like:** everywhere a member's status appears, show one sentence, «دفع حتى <آخر شهر
  مدفوع متصل>», with the plain ✓ grid under it where there is room. Being late is then implicit: in
  September, «دفع حتى يونيو» speaks for itself. There is no «متأخر 3 أشهر» and no «X من Y».
- **Maps to:**
  - `src/components/app/derive.ts` `statusLabel()`, used by the members list and home search;
  - `src/components/app/member.tsx` (the member sheet summary line);
  - `src/components/app/member-model.ts` `youStatus` / `youCard` (the «أنت» card already says
    «دفعت حتى سبتمبر» for the up-to-date case).
- **Before → after:**
  - list or search: «متأخر شهرين» / «مدفوع مقدَّمًا حتى نوفمبر» / «منتظم» → «دفع حتى يوليو» /
    «دفع حتى نوفمبر» / «دفع حتى سبتمبر»;
  - member sheet: «دفع 8 من 9 أشهر مستحقة ومقدَّمًا حتى…» → «دفع حتى أغسطس 2026»;
  - nothing paid yet: «لم يدفع هذا العام» (keep);
  - whole year paid: «دفع السنة كاملة» (keep);
  - exempt: «معفى من الرسوم» (keep).
- **Why it matters most:** it is the one question strangers and members ask («هل دفع فلان؟»), and it
  removes the last "count" wording the owner dislikes.
- **Effort:** S (copy plus one helper, with tests) [C].

### P2. Share the screenshot straight from the wallet, like sharing to WhatsApp

- **Where they know it from:** after a transfer, people already take a screenshot and press
  **Share → WhatsApp**. Our app should simply be one more icon in that same share sheet.
- **What it looks like:**
  1. The installed app (Android) appears in the phone's share sheet as «صندوق الرابطة».
  2. Sharing an image opens the member's «أرسل صورة التحويل» sheet with the image already attached,
     «أنت» and the owed months preselected, and the fields filled by OCR.
  3. One button remains: «أرسل إلى اللجنة».
  4. For the committee (signed in), the same share opens «سجّل دفعة».
- **Maps to:**
  - `src/app/manifest.ts` (`share_target` with POST and `files`), `src/app/sw.ts` (catch the POST and
    hand the file to the page) [B];
  - `member-card.tsx` / `record.tsx` (accept a pre-attached file) [C].
- **Before → after:** «ارجع إلى التطبيق، اضغط أرسلت دفعة، أرفق الصورة، اختر من المعرض…» → Share
  → «صندوق الرابطة» → «أرسل إلى اللجنة».
- **Limits:** only for the installed PWA on Android Chrome
  ([Chrome docs](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)). iPhone and
  browser users keep today's flow plus P3.
- **Effort:** M [B+C].

### P3. "Back from the wallet": the next step waits for you

- **Where they know it from:** payment apps (GPay, UPI, Wave) return to a screen that asks "did it go
  through?" after you leave for another app.
- **What it looks like:** in the «ادفع الآن» sheet, after the member taps «نسخ» and the page comes back
  into view (`visibilitychange`), the sheet swaps its content for a single big button «أرفق صورة
  التحويل». Tapping it opens the gallery picker directly and then goes to the send sheet with the file
  attached. No second sheet appears and no «دفعت؟» question is asked.
- **Maps to:** `src/components/app/member-card.tsx` (the `pay` sheet), `record.tsx` (accept the file).
- **Before → after:** «ادفع الآن» sheet → back → «دفعت؟ أرسل صورة التحويل» → new sheet → «أرفق صورة
  التحويل» → picker. After: back → «أرفق صورة التحويل» (picker opens) → «أرسل إلى اللجنة».
- **Effort:** S [C].

### P4. The reminder message opens the pay sheet, like a bill SMS with a pay link

- **Where they know it from:** operator and utility SMS ("your bill… pay here"), and M-Pesa style
  messages where the first line is the answer ([format](https://thekenyatimes.com/national/access-m-pesa-messages/)).
- **What it looks like:**
  - The WhatsApp reminder's link becomes `https://baqie.vercel.app/?pay=1`.
  - On a phone that already holds the member's link (cookie), `?pay=1` opens the «ادفع الآن» sheet at
    once.
  - Otherwise the phone sees the public home and the calm «لديك رابط؟» line.
  - The sentence «أرسلوا صورة الإيصال إلى …» stays as the fallback for members without a link.
  - The token cannot be put in the message (only its hash is stored), so this is the safe way to land
    them on the right screen.
- **Maps to:**
  - `src/lib/data/reminders.ts` (message lines 58–66) [A];
  - `src/components/app/views/home.tsx` / `member-card.tsx` (read `?pay=1`) [C].
- **Copy, before → after:**
  - «حالة الرسوم الشهرية: <رابط>» → «ادفع وأرسل صورة التحويل من هنا: <رابط>»;
  - the first line stays «السلام عليكم <الاسم>،». Money only goes to the member himself (the private
    reminder), as today.
- **Effort:** S [A+C].

### P5. A trust line where people hesitate

- **Where they know it from:** «رقمك في أمان معنا» / "PIN yako siri yako" footers in wallet messages;
  NBU's explicit safety messaging.
- **What it looks like:** one grey line with a lock icon, only in the two places where a villager worries:
  - under «أرفق صورة التحويل»: «لا يرى صورتك إلا اللجنة.»;
  - on first open of the personal link (the `welcome` line in `member-card.tsx`): «هذا الرابط لك وحدك.
    لا تشاركه.»
- **Maps to:** `record.tsx` (member mode, the shot hint), `member-card.tsx` (welcome line).
- **Effort:** S [C].

### P6. Payment status like a WhatsApp message: clock, then stamp

- **Where they know it from:** WhatsApp shows a **clock** while a message is waiting, then ticks when it
  is delivered or read ([ticks explained](https://www.androidauthority.com/whatsapp-checkmarks-3077273/)).
  The clock-while-waiting is the part to borrow. **Do not** borrow the ✓✓ ticks (see §4).
- **What it looks like:** every payment the member sent has one of three states, always as an icon plus
  words, same order, same words, on the card, on /me, in push notifications and on the receipt:
  - clock «بانتظار تأكيد اللجنة»;
  - stamp «مؤكَّدة» (the receipt stamp we already have);
  - grey «لم تُقبل: <السبب>» with «أرسلها من جديد».
- **Maps to:** `member-card.tsx` (already shows the clock line «أرسلت صورة التحويل. تنتظر تأكيد اللجنة.»
  and hides «ادفع الآن» while waiting), `views/me.tsx`, `src/lib/push*` notification titles [B].
- **Remaining work:** make the push titles use the same words: «تأكدت دفعتك» / «لم تُقبل دفعتك: السبب».
- **Effort:** S [B/C].

### P7. The receipt reads like the wallet's own receipt or SMS

- **Where they know it from:** Bankily or Masrvi success screens and SMS: the answer first («تم»), then
  the amount, the counterpart, the date, and the transaction number.
- **What it looks like:** the WhatsApp text fallback of the receipt (`src/lib/share-receipt.ts`) puts
  the verdict and the amount in the first line, so it reads fully in the WhatsApp notification preview:

  «صندوق الرابطة: تم استلام 3 000 أوقية من محمد ولد الشيخ (ب 12).
  عن: رسوم من يوليو إلى سبتمبر 2026.
  رقم الوصل 0452 · تحقق: baqie.vercel.app/r/…»

  The image receipt (`receipt.tsx`) already has this order. Keep it.
- **Effort:** S [B].

### P8. The proof opens like a WhatsApp photo: tap for full screen, back to return

- **Where they know it from:** every WhatsApp image bubble.
- **What it looks like:**
  - On the committee slip, the screenshot thumbnail is large enough to read the amount (full width,
    about 160px high, cropped to the top).
  - Tapping it opens full screen; the phone's Back gesture closes it (history entry).
  - «تأكيد الاستلام» stays under the thumb.
  - The 9px wallet labels inside the thumbnail go (audit C21).
- **Maps to:** `src/components/app/slip.tsx`, `receipt.tsx` (Proof).
- **Before → after:** «عرض الوصل كاملًا» → zoom → close → confirm. After: glance at the thumbnail →
  confirm (zoom only when unsure).
- **Effort:** S–M [C].

### P9. The walk: WhatsApp and back, then the next name is ready

- **Where they know it from:** forwarding a message to several chats one after another.
- **What it looks like:** in «ذكّر الجميع بالترتيب» and «أرسل للجميع بالترتيب», when the page becomes
  visible again after the WhatsApp jump, the card moves to the next name by itself. A small «أُرسل إلى
  محمد · التالي: أحمد» line appears with «تراجع» (undo) instead of asking "did you send?". «تخطَّ» stays
  for the people you skipped.
- **Maps to:** `src/components/app/reminders.tsx`, `src/components/app/member-links.tsx`.
- **Before → after, per member:** «أرسل في واتساب» → send → back → (find the next) → «أرسل في واتساب»
  becomes «أرسل في واتساب» → send → back (the next is already on screen). Use the **group reminder**
  (one message, no names or amounts) first, and personal reminders only after that.
- **Effort:** S [C].

### P10. Voice where people type names

- **Where they know it from:** WhatsApp voice notes and Google voice typing on Android.
- **What it looks like:** the mic button that already exists in the home search (`search-field.tsx`,
  `use-speech.ts`) also appears in the record sheet's member picker and the members page search, in
  the same place (the start of the field, 44px, «تكلّم»). There is no new feature, just the same button
  everywhere.
- **Off-app (zero code):** the treasurer records one 30-second WhatsApp voice note for the village group
  explaining «افتح رابطك، اضغط ادفع الآن، ثم أرسل صورة التحويل». People trust a known voice more than a
  tutorial.
- **Effort:** S [C].

### P11. The button says the next step (keep, and extend)

- **Where they know it from:** wallet flows whose single button changes from «التالي» to «تأكيد».
- **Already in «سجّل دفعة»:** the footer button names what is missing («أرفق صورة التحويل», «اختر
  كيف دفعت»).
- **Extend it** to the expense sheet (audit C8): «اختر النشاط» → «اكتب المبلغ» → «سجّل المصروف».
- **Maps to:** `src/components/app/expense.tsx`.
- **Effort:** S [C].

### P12. Keep these; they already match known patterns

- **WhatsApp chat-list rows:** avatar with the paper number («ب 12»), name, one grey line, and the
  green count badge «بانتظار التأكيد 3».
- **Inline undo** after confirm (a 5s «تراجع عن التأكيد»), not a dialog.
- **«نسخ»** next to each wallet number, with the wallet badge and «نُسخ رقم بنكيلي» feedback.
- **The rubber stamp** as the proof object.
- **Offline banner** «غير متصل. آخر تحديث قبل…».

---

## 3. Flows, with taps before and after

Only taps are counted. Typing, and switching to the wallet or WhatsApp, are noted separately.

### 3.1 Member pays and sends proof (personal link, paying for himself)

**Now (Android, installed or browser): 6 taps, plus 1 when OCR cannot read the wallet.**
1. «أنت» card → «ادفع الآن».
2. «نسخ» next to the fund's Bankily number.
3. *(switch to the wallet, transfer, take a screenshot, come back)*
4. «دفعت؟ أرسل صورة التحويل» (a new sheet opens, with «أنت» and the late months preselected).
5. «أرفق صورة التحويل».
6. Pick the image in the gallery.
7. «أرسل إلى اللجنة».

**After, installed Android (P2): 2 taps in our app, 4 in total.**
1. «ادفع الآن».
2. «نسخ».
3. *(wallet: transfer, then screenshot → Share)*
4. «صندوق الرابطة» in the share sheet.
5. «أرسل إلى اللجنة» (the image is attached, months are preselected, fields are read).

**After, iPhone or browser (P3): 5 taps.**
1. «ادفع الآن».
2. «نسخ».
3. *(wallet, come back)*
4. «أرفق صورة التحويل» (the picker opens at once).
5. Pick the image.
6. «أرسل إلى اللجنة».

**Result:** the card shows the clock line «أرسلت صورة التحويل. تنتظر تأكيد اللجنة.» (P6); a push arrives
on confirm.

**Coming from a reminder (P4):** the WhatsApp link opens the «ادفع الآن» sheet directly, which saves
step 1.

### 3.2 Stranger checks "did X pay?"

**Now: 2 taps, plus typing, then reading a sheet with counts.**
1. Tap the search field (the page scrolls it up).
2. *(type or speak the name)*
3. Tap the result, then read «دفع 8 من 9 أشهر مستحقة…» and the month tiles.

**After (P1): 1 tap, plus typing. The answer is in the result row.**
1. Tap the search field.
2. *(type or speak)* The row reads «محمد ولد الشيخ · ب 12 · دفع حتى أغسطس».

Tapping the row still opens the ✓ grid for anyone who wants the details. No money is shown, as today.

### 3.3 Committee confirms a payment (a member's submission)

**Now: 4 taps.**
1. Push notification.
2. «عرض الوصل كاملًا» or zoom on the proof.
3. Close.
4. «تأكيد الاستلام». The stamp lands, with a 5s undo. The member is notified by push, so the WhatsApp
   receipt is optional.

**After (P8): 2 taps, 3 when unsure.**
1. Push notification (it opens on the slip).
2. Read the amount on the large thumbnail and match it against the wallet.
3. «تأكيد الاستلام».

Unchanged:
- The own-membership rule.
- Reject asks for a reason, using the chips.
- «الوصل» on WhatsApp only when the payer has no personal link.

### 3.4 Committee reminds the late members, or sends personal links

**Now: 1 tap, plus about 3 per member.**
1. «ذكّر الجميع بالترتيب».
2. For each member:
   - «أرسل في واتساب»;
   - Send in WhatsApp;
   - Back, then check that the card moved on.

**After (P9 + P4): 1 group message (3 taps), then about 2 per member, without looking for the next name.**
1. «تذكير في مجموعة الواتساب» → pick the group → Send (no names or amounts).
2. A few days later, «ذكّر الجميع بالترتيب». For each member:
   - «أرسل في واتساب»;
   - Send;
   - Back. The next name is already there, and «تراجع» is available if WhatsApp was cancelled.

Each personal message ends with the `?pay=1` link, so the member lands on «ادفع الآن».

«أرسل للجميع بالترتيب» for personal links uses the same walk.

---

## 4. What not to do (patterns that confuse these users)

- **No WhatsApp ✓✓ ticks for payment status.** In our app ✓ means only "month paid" (report, card,
  sheet); audit C6 already removed ✓ = "sent". Use the clock, the stamp and words (P6).
- **No "confirm" button inside the notification.** Confirming without seeing the proof breaks "the
  committee confirms everything" after checking the wallet. A notification only opens the slip.
- **No hidden gestures** (swipe to confirm or reject, long-press menus). Low-literacy users do not
  discover hidden actions ([Medhi 2011](https://www.microsoft.com/en-us/research/publication/designing-mobile-interfaces-for-novice-and-low-literacy-users/)).
- **No hamburger menus or deep settings trees.** Keep the flat bottom bar and the hub list.
- **No icon-only buttons.** Every action is an icon plus a verb (DESIGN.md), including WhatsApp icons (audit C19).
- **No "are you sure?" for routine actions.** Use undo. Keep dialogs for rare, destructive actions such
  as removing a person from a phone or a new link that revokes the old one.
  ([NN/g](https://www.nngroup.com/articles/confirmation-dialog/))
- **No PIN, OTP or password for members.** The link is the key (owner decision).
- **No QR codes to pay or to share links.** Cameras are poor and it adds a step; share the link on WhatsApp.
- **No moving or auto-changing text:** no carousels, no ticker, no toast shorter than 5s that carries
  the only confirmation ([NN/g](https://www.nngroup.com/articles/writing-for-lower-literacy-users/)).
  Put the result on the card instead.
- **No onboarding carousel or video tour.** A single greeting line on first open (it exists) plus the
  treasurer's voice note is enough.
- **No counting wording:** no «X من 12», «متأخر 9», or «دفع 8 من 9 أشهر مستحقة». Say «دفع حتى <شهر>» (P1).
- **No colour-only meaning:** no red fills for lateness, no circles, dots or tints in the month grid, no
  current-month highlight.
- **No eye toggle for money.** Strangers get «••• •••» from the server (owner decision).
- **No committee jargon on public screens:** «الدورة», «رصيد مُرحَّل», «فرق التسليم».
- **No Arabic-Indic digits in output and no em dashes in Arabic copy.** Accept ٠١٢ in input (already done).
- **No new features to "help"** (chatbots, tutorials, badges, gamification). Every item above removes a
  step or a word.

---

## 5. Sources

**Low-literacy UX research**
- Nielsen, *Lower-Literacy Users: Writing for a Broad Consumer Audience*, NN/g:
  https://www.nngroup.com/articles/writing-for-lower-literacy-users/
- Medhi, Patnaik, Brunskill, Gautama, Thies, Toyama, *Designing Mobile Interfaces for Novice and
  Low-Literacy Users*, ACM TOCHI 18(1), 2011:
  https://www.microsoft.com/en-us/research/publication/designing-mobile-interfaces-for-novice-and-low-literacy-users/
  (PDF: https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ToCHI2711_Medhi.pdf)
- Medhi, Gautama, Toyama, *A Comparison of Mobile Money-Transfer UIs for Non-Literate and Semi-Literate
  Users*, CHI 2009: https://dl.acm.org/doi/10.1145/1518701.1518970
- Medhi, Sagar, Toyama, *Text-Free User Interfaces for Illiterate and Semi-Literate Users*, ITID 2007:
  https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/medhi_ictd2006.pdf
- Google Design, *UX Design for the Next Billion Users*:
  https://design.google/library/connectivity-culture-and-credit
- GSMA, mobile money activity rates and low-literacy barriers:
  https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-for-development/blog/mobile-money-activity-rates-exploring-barriers-to-regular-use/
- GSMA, Digital Literacy Training Guide:
  https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-for-development/gsma_resources/digital-literacy-training-guide/

**Everyday apps (payments, wallets, WhatsApp)**
- Increment, *Case study: Mobile payments in India* (Tez / Google Pay):
  https://increment.com/frontend/case-study-mobile-payments-in-india/
- Wave, About: https://www.wave.com/en/about/
- Bankily (BPM), app and FAQ: https://www.bankily.mr/bankily-l-application/ ·
  https://www.bankily.mr/faq/
- M-Pesa confirmation messages: https://thekenyatimes.com/national/access-m-pesa-messages/
- WhatsApp check marks and clock:
  https://www.androidauthority.com/whatsapp-checkmarks-3077273/ (official help:
  https://faq.whatsapp.com/665923838265756)
- Rest of World, *WhatsApp voice notes in Senegal*:
  https://restofworld.org/2023/whatsapp-voice-notes-farming-senegal/

**Interaction guidance**
- NN/g, *Confirmation Dialogs Can Prevent User Errors*: https://www.nngroup.com/articles/confirmation-dialog/
- NN/g, *User Control and Freedom*: https://www.nngroup.com/articles/user-control-and-freedom/
- Hoober, *How Do Users Really Hold Mobile Devices?*, UXmatters:
  https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
- Material Design, *Bidirectionality*: https://m2.material.io/design/usability/bidirectionality.html
- Chrome, *Web Share Target API*: https://developer.chrome.com/docs/capabilities/web-apis/web-share-target
