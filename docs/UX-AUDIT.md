# UX audit and critique: «صندوق الرابطة»

- **Worktree:** `.claude/worktrees/ux-audit` at 58e8d30 (r23).
- **Build:** fixtures (`SONDOQ_FIXTURES=1`, fictional data), served on :3900.
- **Screens:** 390×844 (primary) and 1280×800.
- **Screenshots:** everything is in `/private/tmp/claude-502/sondoq-shots/ux-audit/`. Paths below are relative to that folder. `a*/b*/c*/d*/e*.png` are side-by-side montages. Scripts are `pages.mjs`, `vp.mjs`, `visitor.mjs`, `member.mjs`, `send*.mjs`, `committee.mjs`, `targets.mjs` and `focus.mjs`.
- **Method:** two assessments.
  - A (this report) is the design review: every flow walked in Playwright.
  - B is the deterministic scan, run by a separate agent: the `impeccable detect` CLI plus greps.
- **Not done:**
  - Persisting to `.impeccable/critique/` (the run was read-only).
  - The browser overlay injection.
  - Push notifications, which are disabled in demo («لا تعمل الإشعارات في النسخة التجريبية»).
  - The real install prompt: headless Chromium reports as a desktop.
- **"In progress elsewhere"** marks the report grid (paper-like table) and the member «أنت» card, which another agent is changing right now.

---

## 1. Overall verdict

This is a genuinely good, product-specific app.
- Each public page answers one plain question.
- The receipt and stamp are real proof objects.
- Recording a normal payment takes **3 taps**: member, method, save.
- The detector found no generic "AI slop".

The weakest dimension is **consistency**. The same fact, "which months did X pay", is drawn in **four visual languages**:
- the report: ✓ / empty cell;
- the member sheet: filled green tiles and hatched "متأخر" tiles;
- the «أنت» card: ● / hatched / ○ dots;
- the record month picker: filled green means "selected", not "paid".

On top of that, ✓ is reused on «روابط الأعضاء» to mean "sent". Status words drift the same way, for example «منتظم» vs «دفع السنة كاملة» for the same member.

There are a handful of real copy bugs, and one false money warning that can mislead both members and the committee.

**Scores**
- Nielsen: **29/40**, rated Good.
- Technical audit: **15/20**, rated Good.
- Findings: **P0: 2 (M1; M2 = C1, same bug) · P1: 16 · P2: 32**.

### Nielsen heuristics

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | After a member sends proof, the card still says «عليك 3 أشهر» with the same primary button |
| 2 | Match with the real world | 3 | Paper numbers, wallets and months in words are excellent. «الدورة 2», «فرق التسليم» and «رصيد مُرحَّل» are committee jargon on public pages |
| 3 | User control and freedom | 3 | Inline undo and cancel-with-reason are good. A rejected payment on /me has no «أرسلها من جديد» |
| 4 | Consistency and standards | 2 | Four month languages, ✓ overloaded, «الوصل/الإيصال», «مجموعة أ/المجموعة أ», three search placeholders |
| 5 | Error prevention | 3 | The amount check and MRU (×10) hint are good. The false "recipient is not the fund" warning is not |
| 6 | Recognition over recall | 3 | Number avatars, recent searches and «دفعت لهم سابقًا» are good |
| 7 | Flexibility and efficiency | 3 | Keypad, voice and quick month chips. Late reminders are 47 one-by-one taps |
| 8 | Aesthetic and minimalist design | 3 | Calm, one green. /accounts is very long, and some pages carry two hints that say the same thing |
| 9 | Error recovery | 3 | The expense form's disabled button does not say what is missing (the record sheet does) |
| 10 | Help and documentation | 3 | The «كيف أدفع/أساهم» steps are clear |

### Technical audit

| Dimension | Score | Key finding |
|---|---|---|
| Accessibility | 3 | Targets are ≥44px almost everywhere; the only miss is the install banner «تثبيت» at 76×40. The group letter under avatars is 10px. Wallet names on committee slips are 9px. Focus ring is 3px #30A848 (3.08:1, passes barely). No skip link: five nav stops before content |
| Performance | 3 | Only transform, opacity and clip-path are animated; no `transition: all`; no ease-in. Not profiled on a device |
| Responsive | 3 | No horizontal overflow at 390 or 1280. /report stays a phone column on desktop. The committee members segmented control clips «الكل» |
| Theming | 3 | Tokens are used. Two undocumented greys: `globals.css:511` #5e6a63 and `globals.css:2079` #3f4b45. Off-scale radii at 22px (`.bq-gate-i`, l.1335) and 12px (the focus ring, l.211) |
| Implementation integrity | 3 | 34 detector hits, about 20 of them false positives or intentional: mask #000, the scrim, and 11–12px report-grid text. No dashes in Arabic UI strings |

**Assessment B (detector) detail:**
- 34 `design-system-*` findings: radius 12, colour 8, font-size 12, font 2.
- True positives:
  - radius 22px (l.1335) and 12px (l.211);
  - #5e6a63 and #3f4b45;
  - a 13px size at l.4087;
  - `.bq-sheet` sets `outline:none` with no visible replacement (l.1952).
- False positives:
  - `#000` in the receipt edge mask;
  - the green-tinted scrim rgba;
  - Noto in the OG image;
  - the 52px hero numeral.
- Agreement with Assessment A: the sub-14px text is concentrated in the report grid and the committee slip wallet labels.

---

## 2. Findings by flow

Severity:
- **P0** blocks or misleads about money.
- **P1** is confusing or adds steps.
- **P2** is polish.

Owner:
- **C** = Lane C (`src/components/app/**`, pages, `globals.css`).
- **B** = Lane B (providers, offline, share, `report-pages`/`share-report`, install).
- **A** = Lane A (data, error copy).

### 2.1 Visitor

| # | Sev | Finding | Screenshot | Fix and proposed copy | Owner |
|---|---|---|---|---|---|
| V1 | P1 | **Home search is covered by the keyboard.** On focus the results begin about 540px down, under a 380px hero. On a phone the keyboard hides every result, and nothing scrolls the field up (no `scrollIntoView` in home/search-field) | `390-v-search-focus.png`, `390-v-search-results.png`, `a1.png` | On focus, `scrollIntoView({block:"start"})` the «هل أنت منتظم في الدفع؟» heading (the compact bar takes over from the hero) | C `views/home.tsx`, `search-field.tsx` |
| V2 | P1 | **One member, two status words.** «محمد ولد الشيخ» is «منتظم» in home search but «دفع السنة كاملة» in /members, and the report shows a ✓ | `390-v-search-results.txt` vs `390-vp-members-0.png` | Feed the same `statusLabel()` input (incl. `monthsPaidThisYear`) to the search index | C `derive.ts`, home index |
| V3 | P1 | **Copy bug in the member sheet:** «متأخر عن رسوم **شهرًا**: سبتمبر». `monthsWord` is the object form, but it is used after «رسوم» | `390-v-msheet-partial.png` | «متأخر عن رسوم **شهر واحد**: سبتمبر». Use the count form (`شهر واحد / شهرين / 3 أشهر`) | C `member.tsx:111` |
| V4 | P1 | **Member sheet months use a different language from the report.** Paid is a filled green tile «مدفوع ✓», late is a hatched grey tile «متأخر», not-yet is grey «لم يحن». The report is ✓ badge / empty white cell | `a2.png`, `390-v-msheet-late.png` | Same cell as the report: white cell, month name, green ✓ badge when paid. Unpaid-due: empty cell plus small word «لم يُدفع». Not due: pale, «لم يحن». Keep the words: this is the one place a member reads their own months | C `member.tsx`, `globals.css` |
| V5 | P2 | «وجدنا 34 **أسماء**» is wrong grammar, and only 5 names are shown | `390-v-search-results.txt` | «وجدنا 34 **اسمًا**. اكتب اسمك كاملًا أو رقمك.» Add an Arabic count helper (3–10 أسماء, 11+ اسمًا) | C `views/home.tsx:96` |
| V6 | P2 | The member sheet header shows the number twice (avatar «24 ب» and «رقم ب 24»). «الرسوم الشهرية: 500 أوقية» wraps mid-phrase | `a2.png` | Subline: «المجموعة ب · الرسوم الشهرية 500 أوقية». Drop «رقم ب 24» | C `member.tsx` |
| V7 | P2 | «الدورة 2 · منذ 1 يناير 2026» on the public hero, /accounts and /report. "Cycle" is committee vocabulary | `390-home.png` | Public: «منذ 1 يناير 2026». Keep «الدورة» for committee pages | C `hero.tsx`, `views/accounts.tsx` |
| V8 | P2 | /accounts «الدورات السابقة» line is dense jargon: «رصيد سابق 12 000 · سُلّمت بـ 45 000 · فرق التسليم −500» | `m-accounts.png` | «جُمع 168 000 · صُرف 134 500 · سُلّم للجنة الجديدة 45 000 أوقية (نقص 500)» | C `views/accounts.tsx` |
| V9 | P2 | /accounts is about 3 000px long. «تثبيت التطبيق» is buried at the very bottom, and there are two report links side by side («مشاركة التقرير» + «التقرير كاملًا») | `m-accounts.png` | Keep one link «التقرير كاملًا». Move install into the hub or banner only | C |
| V10 | P2 | The report's month table shows 41 payers and 26 000 collected for October to December. That is prepaid money but looks like the future is already collected | `m-report.png` | Mark future rows: month name plus «(مدفوع مقدمًا)», or grey them | B `report` page / C |
| V11 | P2 *(in progress elsewhere)* | Report grid: in September an empty cell means both "late" (Jul–Sep) and "not due yet" (Oct–Dec). The 1–12 header is not sticky on a 68-row group | `390-v-report-grpA.png`, `a4.png` | Owner decided no current-month emphasis. Consider only a thin divider after the current month. Sticky header row per group on /report | B/C report |
| V12 | P2 | Share sheet: «صورة الملخص فقط» uses the ♥ icon, which means donations everywhere else. «صور التقرير (واتساب)» uses brackets | `390-v-report-share.png` | Image icon for the summary. «صور لواتساب» | C `report-share.tsx` |
| V13 | P2 | The install banner floats over content on /report and on the member's first open, where it covers «ادفع الآن». On desktop it says «على هاتفك». «تثبيت» is 40px tall | `m-report.png`, `b1.png`, `e1.png` | Hide it on the first view after `/m/…` until the card is seen. «ثبّت التطبيق على جهازك» on desktop. 44px button | B `providers/install.tsx` |
| V14 | P2 | Receipt: «أرسل **الإيصال** عبر واتساب» next to «وصل استلام» and «حفظ صورة **الوصل**». Also «عن رسوم» label with «عن:» value | `390-v-home-receipt.txt` | «أرسل الوصل عبر واتساب». Value without the second «عن:» | C `receipt.tsx`, B `share-receipt` |
| V15 | P2 | The offline fallback page button is off-system (square-ish radius, different weight) | `390-v-offline-uncached.png` | Pill, 48px, Forest, Alexandria 600 | B `public/offline.html` |
| V16 | P2 | Three search placeholders: «اكتب اسمك أو رقمك» / «اكتب رقمًا أو اسمًا» / «الاسم أو الرقم، مثل ب 12». Also «مجموعة أ» chip vs «المجموعة أ» rows | `a1.png`, `m-members.png` | One placeholder: «اكتب الاسم أو الرقم، مثل ب 12». Chips: «المجموعة أ» | C |
| V17 | P2 | The group letter under the avatar number is 10px, below the 14px floor, on /members and /committee/late | `targets.json` | 12px minimum inside the avatar, or put the letter beside the number («ب 24») | C `bits.tsx` Avatar |
| V18 | P2 | /donations always says «أرسل صورة التحويل عبر واتساب», even for a member with a personal link who can send in-app | `m-donations.png` | With a member cookie: «أرسل صورة التحويل» → member send sheet with the campaign preselected | C `views/donations.tsx` |

### 2.2 Member (/m/demo, /me, /m/switch)

| # | Sev | Finding | Screenshot | Fix and proposed copy | Owner |
|---|---|---|---|---|---|
| M1 | **P0** *(in progress elsewhere)* | **After sending proof, nothing on the card changes.** It still says «عليك 3 أشهر · 3 000 أوقية» with July–September hatched as late and the same big primary «أرسلت دفعة». Only a small «دفعة واحدة بانتظار التأكيد» line is added. A villager will think it did not count and transfer again | `b3.png` (3rd), `390-msend-card-after.txt` | Pending months get their own state («بانتظار التأكيد», clock). Status becomes «أرسلت رسوم 3 أشهر. تنتظر تأكيد اللجنة.» Primary becomes soft while anything is pending | C `member-card.tsx`, `member-model.ts` |
| M2 | **P0** | **False money warning.** When OCR cannot read the screenshot, the sheet says «لم نستطع قراءتها» *and* «تحقق: المستلم في الصورة ليس من أرقام الصندوق.» The condition is `checks && !checks.recipient`, which is also true when nothing was read. It tells a member (or the treasurer) the money went to the wrong wallet | `b2.png` (2nd), `390-member-send-after-file.txt` | Show it only when a recipient was read and did not match (`checks.recipientRead && !checks.recipient`). When unread: «لم نقرأ رقم المستلم. تأكد أنه أحد أرقام الصندوق.» | C `record.tsx:940-942` |
| M3 | P1 *(in progress elsewhere)* | Card months are ● / hatched / ○ dots plus a key, a fourth month language | `b1.png` | Same ✓ strip as the report (12 small cells, ✓ when paid). Key: «✓ مدفوع». Pending uses a clock | C `member-card.tsx` |
| M4 | P1 *(in progress elsewhere)* | CTA order and tense: «أرسلت دفعة» (primary, past tense) sits above «ادفع الآن». A member who has not paid yet presses "I sent" | `b1.png` | Late: primary «ادفع الآن», then «أرسل صورة التحويل». Paid up: only «أرسل صورة التحويل» (soft). Sheet title «أرسل صورة التحويل» | C |
| M5 | P1 | First open of a personal link (`/?welcome=1`) only triggers the install invite. There is no greeting, the card sits below the hero fold, and the install banner covers its buttons | `390-mem-welcome.png`, `b1.png` | On welcome, scroll to the card and show one line: «أهلًا سيدي. هذا رابطك الخاص: تجد هنا أشهرك وترسل صورة تحويلك.» Delay install until after that | C `member-card.tsx` + B `install.tsx` |
| M6 | P1 | The send sheet opens on a picker of all 88 members, with «أنت» on top but not selected. Paying for yourself (the 90% case) costs a tap and a long list | `390-member-send-1-open.png` | Open with «أنت» already added (late months preselected). Keep «عضو آخر في نفس التحويل» for others | C `record.tsx` member mode |
| M7 | P1 | /me «مرفوضة: السبب: الصورة غير واضحة» has no way to fix it | `b4.png` | Button «أرسلها من جديد» → send sheet prefilled with the same members and months | C `views/me.tsx` |
| M8 | P2 | «عن من هذه الدفعة؟». «عن من» is not standard | `b2.png` | «لمن هذه الدفعة؟» | C `record.tsx` |
| M9 | P2 | Member mode offers «نقداً» although a screenshot is required. «نقداً» is also spelled unlike «نقدًا/مسبقًا» elsewhere | `b2.png` | Hide cash in member mode. Spell it «نقدًا» everywhere | C `record.tsx`, `lib/methods` |
| M10 | P2 | /me: the bottom bar keeps «الرئيسية» active. «إزالة … من هذا الهاتف» uses an upload/share arrow icon. The intro «لا يراها غيرك. الصفحات العامة تبقى كما هي للجميع.» makes people wonder. A red «مرفوض» tag appears on a member surface (DESIGN keeps red committee-only) | `b4.png`, `b5.png` | No active tab, or a «أنت» state. Log-out/person-minus icon. «هذه الصفحة لك وحدك.» Grey «لم تُقبل» tag with the reason | C `views/me.tsx` |
| M11 | P2 | Switch chip label «تبديل:» is unclear. The remove confirmation is 3 sentences | `b4.png` (5th), `b5.png` | «على هذا الهاتف أيضًا:» · «سيُزال سيدي من هذا الهاتف فقط. يمكنه فتح رابطه من جديد.» | C `member-card.tsx`, `views/me.tsx` |
| M12 | P2 | The «أُرسلت إلى اللجنة…» snack was not captured 3s after sending: it is short-lived, and under the install banner position | `390-msend-result.png` | Keep the snack ≥5s. Better: show the result inline on the card (see M1) | C/B |

### 2.3 Committee

| # | Sev | Finding | Screenshot | Fix and proposed copy | Owner |
|---|---|---|---|---|---|
| C1 | **P0** | Same false «المستلم في الصورة ليس من أرقام الصندوق» after a failed OCR in «سجّل دفعة». It can lead a treasurer to reject a valid transfer | as M2 | as M2 | C `record.tsx:940` |
| C2 | P1 | **The stamp always prints «أمين الصندوق»** in its dater band, even when the admin or deputy confirmed («أكّدها مستخدم تجريبي، المسؤول»). The proof object misattributes the role | `d3.png` (1st) | Print the confirmer's role (أمين الصندوق / نائبه / المسؤول), or drop the role from the stamp and keep it in the line below | C `receipt.tsx` Stamp, `stamp-rim` (band text only) |
| C3 | P1 | **The FAB «سجّل دفعة» sits on top of the next slip's «تأكيد الاستلام»** at rest | `d3.png` (2nd), `c1.png` | Add bottom padding to the queue equal to FAB+16px, or collapse the FAB to its icon whenever a slip's action row is under it | C `shell.tsx`, `views/committee.tsx` |
| C4 | P1 | A newly recorded payment is not brought into view (the count goes to 4, the new slip is lower). The confirmation snack covers the first slip's buttons for about 4s | `d1.png` (4th) | Insert the new slip first and scroll to it. Snack above the FAB, not over the slip row | C |
| C5 | P1 | **Late reminders: 47 members, one WhatsApp tap each**, with no walk mode. «روابط الأعضاء» already has one. There are two hints saying the same thing | `c2.png`, `d4.png` | Reuse the walk card: «ذكّر الجميع بالترتيب» → «أرسل في واتساب / تخطَّ / إيقاف». One hint: «التذكير يصل للعضو وحده مع أشهره ومبلغه.» | C `reminders.tsx` |
| C6 | P1 | «روابط الأعضاء» uses ✓ = sent and ✓✓ = used. The same ✓ now means "paid" in the report and on home | `c3.png` (1st), `d6.png` | Word tags: «أُرسل» (Mist) / «فتحه» (Green Tint). Legend removed | C `member-links.tsx` |
| C7 | P1 | **Admin member sheet:** «نقله إلى رسوم المجموعة ب», «تراجع عن آخر تغيير» and «تصحيح شهر الانضمام» render as small run-together text («…المجموعة بتراجع عن…»). The sheet has no months view, and its count differs from the public one: «6 من 12 شهرًا هذا العام» vs «8 من 9 أشهر مستحقة» | `d5.png` (4th/5th), `390-c-mem-sheet.txt` | Group them as three 44px rows under «تعديلات أخرى». Reuse the public months grid (V4). Same count sentence as public | C `members-admin.tsx` |
| C8 | P1 | The expense sheet disables «سجّل المصروف» without saying what is missing. The record sheet names the step. The footer reads «المجموع 0 أوقية» for a single amount | `d4.png` (3rd/4th) | Same pattern as record: button text «اختر النشاط» → «اكتب المبلغ» → «سجّل المصروف». Footer «المبلغ: … أوقية» | C `expense.tsx` |
| C9 | P2 | Several members plus a short transfer shows «أقل من المجموع بـ 4 000 أوقية» with no fix. The single-member case offers «سجّل X فقط» | `d2.png` | Offer «قلّل الأشهر» → open the first row's month picker | C `record.tsx` |
| C10 | P2 | Month picker: selected months are filled green, which reads as "paid" in the member sheet | `d2.png` (1st) | Selected: Forest outline plus ✓. Paid (disabled): ✓ badge. Owed: plain | C `record.tsx`, css |
| C11 | P2 | The hub «أعمال أخرى» uses the WhatsApp icon for three different items (reminders, member links, report share) | `c1.png` (3rd) | Bell for reminders, link for member links, share for the report | C `views/committee.tsx` |
| C12 | P2 | The slip repeats the payer: «الحسن ولد أحمد … عن الحسن ولد أحمد (أ 9): رسوم…» | `c1.png` | When payer = member: «عن: رسوم من يوليو إلى سبتمبر 2026 (أ 9)» | C `slip.tsx` |
| C13 | P2 | Payments list «رسوم 12 شهرًا» vs home «رسوم السنة كاملة» | `c1.png` (4th) | «رسوم السنة كاملة» everywhere | C `entries.tsx`/`derive.ts` |
| C14 | P2 | Settings: the current «الرسوم الشهرية» are invisible except in December (`?prices=1`). Amounts are ungrouped («45000», «1000»). The backup check icon is orphaned on its own line | `c3.png`, `d7.png` (5th) | Always show «الرسوم الشهرية 2026: المجموعة أ 1 000 · ب 500» read-only. Group digits in inputs with a unit suffix «أوقية» | C `settings-cards.tsx`, `views/settings.tsx` |
| C15 | P2 | The committee members segmented control is «النشطون / المعفون / غادروا / الكل», with «الكل» last and clipped. Public order starts with «الكل» | `c2.png` (5th) | «الكل» first, or drop it (النشطون is the default) | C `members-admin.tsx` |
| C16 | P2 | «حسابي» shows an e-mail under «رقم الدخول». Form label sizes jump: 14px labels in account/setup vs 20px headings in sheets | `d7.png` | «البريد أو الهاتف للدخول». One label style (17/600) | C `views/account.tsx`, `views/setup.tsx` |
| C17 | P2 | Cancel payment: «…وتُحذف أشهرها من حساب العضو» contradicts "nothing is deleted" | `d6.png` (4th) | «تبقى في السجل مع السبب، ولا تُحسب أشهرها للعضو بعد الآن.» | C `cancel-payment.tsx` |
| C18 | P2 | Late rows with «لا يوجد رقم هاتف» show the same green WhatsApp button (it opens WhatsApp without a recipient) | `c2.png` | Tonal button «اختر في واتساب», or an «أضف رقمًا» link | C `reminders.tsx` |
| C19 | P2 | The collapsed confirmed slip ends with an unlabeled WhatsApp icon | `d3.png` (2nd) | Icon plus «الوصل» (44px) | C `slip.tsx` |
| C20 | P2 | Proof zoom shows «تعذّر تحميل الصورة الآن…» under a visible placeholder (demo). Check on real data that the error and the image never show together | `d6.png` (5th) | Error replaces the image area | C `receipt.tsx` Proof |
| C21 | P2 | Committee slip wallet labels are 9px and «300 MRU» is 12px (inside the proof thumbnail) | `targets.json` | Decorative: `aria-hidden`, fine. Otherwise enlarge | C `slip.tsx` |

### 2.4 Cross-screen month and "paid" display: every place that differs from the report

| Place | Now | Should be | Owner |
|---|---|---|---|
| /report grid, images, PDF | ✓ badge / empty bordered cell. Legend «✓ مدفوع · خانة فارغة: لم يُدفع» | reference *(in progress elsewhere)* | B/C |
| Public member sheet | filled green tile «مدفوع ✓» / hatched «متأخر» / grey «لم يحن» | ✓ badge plus month word. Unpaid: empty plus «لم يُدفع» | C `member.tsx` (V4) |
| «أنت» card | ● / hatched / ○ dots plus «مدفوع · متأخر · لم يحن» key | ✓ strip, pending = clock *(in progress elsewhere)* | C (M3) |
| Admin member sheet | no months at all | same as the public sheet | C (C7) |
| Record month picker | selected = filled green | outline plus ✓ for selected. Paid months show the ✓ badge | C (C10) |
| «روابط الأعضاء» | ✓ sent, ✓✓ used | words «أُرسل / فتحه» | C (C6) |
| Home paid bar legend | «✓ دفعوا» / clock «لم يدفعوا بعد» | consistent, keep | – |
| Status words | «منتظم» (search), «دفع السنة كاملة» (list), «رسوم 12 شهرًا» (payments) | one vocabulary per state | C (V2, C13) |
| DESIGN.md `month-cell-*` tokens | still describe filled paid / hatched owed cells | update to the ✓ model once the owner confirms | C DESIGN.md |

---

## 3. Simplify (remove, merge, rename)

| # | Change | Before → after |
|---|---|---|
| S1 | Member pays for self: open the send sheet with «أنت» and the late months already chosen, and the method filled from OCR | card → «أرسلت دفعة» → pick self → attach → method → send = **5 taps** → card → «أرسل صورة التحويل» → attach → send = **3 taps** |
| S2 | Merge «ادفع الآن» and «أرسلت دفعة» into one sheet: numbers at the top («حوّل إلى أحد هذه الأرقام»), then «أرفق صورة التحويل» | 2 sheets and a sheet-to-sheet jump → **1 sheet** |
| S3 | Rejected payment «أرسلها من جديد» (prefilled) | home → card → send → re-pick members and months → attach → method → send = **7** → /me → «أرسلها من جديد» → attach → send = **3** |
| S4 | Late reminders walk mode (reuse the member-links walk card) | 47 × (find row, tap, come back, scroll) ≈ **94 taps + scrolling** → «ذكّر الجميع بالترتيب» then **47 taps**, no scrolling or searching |
| S5 | Home search auto-scrolls on focus | tap, type, then close the keyboard or scroll to see results = **3 actions** → **2** |
| S6 | One month language (✓ + word) everywhere | 4 visual systems + ✓-as-"sent" → **1** |
| S7 | /accounts: remove the «التقرير كاملًا»/«مشاركة التقرير» pair (keep one link), move install out, shorten «الدورات السابقة» | page ≈ 3 000px → ≈ 2 200px |
| S8 | Member sheet header: drop «رقم ب 24» (the avatar already says it) | 2 lines → 1 |
| S9 | Admin member sheet: fold «نقله… / تراجع… / تصحيح…» into «تعديلات أخرى» | 3 tiny links → 1 row, 3 clear options inside |
| S10 | Late page: merge the two explanatory lines into one | 2 hints → 1 |
| S11 | Expense form: button names the next missing step (same as record) | dead disabled button → self-guiding button |

---

## 4. Copy table (old → new)

| Where | Old | New |
|---|---|---|
| `member.tsx:111` | متأخر عن رسوم شهرًا: سبتمبر | متأخر عن رسوم شهر واحد: سبتمبر |
| `views/home.tsx:96` | وجدنا 34 أسماء. اكتب الاسم كاملًا ليظهر اسمك. | وجدنا 34 اسمًا. اكتب اسمك كاملًا أو رقمك. |
| `record.tsx:942` (OCR unread) | تحقق: المستلم في الصورة ليس من أرقام الصندوق. | لم نقرأ رقم المستلم. تأكد أنه أحد أرقام الصندوق. |
| `record.tsx` | عن من هذه الدفعة؟ | لمن هذه الدفعة؟ |
| methods | نقداً | نقدًا |
| member card / sheet *(in progress)* | أرسلت دفعة | أرسل صورة التحويل |
| member card after sending | عليك 3 أشهر · 3 000 أوقية + دفعة واحدة بانتظار التأكيد | أرسلت رسوم 3 أشهر. تنتظر تأكيد اللجنة. |
| welcome (new) | – | أهلًا سيدي. هذا رابطك الخاص: تجد هنا أشهرك وترسل صورة تحويلك. |
| /me intro | لا يراها غيرك. الصفحات العامة تبقى كما هي للجميع. | هذه الصفحة لك وحدك. |
| /me rejected | (no action) | أرسلها من جديد |
| /me rejected tag | مرفوض (red) | لم تُقبل (grey) |
| card switcher | تبديل: | على هذا الهاتف أيضًا: |
| /me remove confirm | لن يظهر … بعد الآن. يبقى الآخرون كما هم. تبقى رسالة اللجنة… | سيُزال {الاسم} من هذا الهاتف فقط. يمكنه فتح رابطه من جديد. |
| receipt share button | أرسل الإيصال عبر واتساب | أرسل الوصل عبر واتساب |
| public hero / accounts / report | الدورة 2 · منذ 1 يناير 2026 | منذ 1 يناير 2026 |
| accounts past cycles | رصيد سابق … · سُلّمت بـ … · فرق التسليم −500 | سُلّم للجنة الجديدة 45 000 أوقية (نقص 500) |
| search placeholders (3 variants) | اكتب اسمك أو رقمك / اكتب رقمًا أو اسمًا / الاسم أو الرقم، مثل ب 12 | اكتب الاسم أو الرقم، مثل ب 12 |
| members chips | مجموعة أ / مجموعة ب | المجموعة أ / المجموعة ب |
| payments list | رسوم 12 شهرًا | رسوم السنة كاملة |
| admin member sheet | دفع رسوم 6 من 12 شهرًا هذا العام | دفع رسوم 6 من 9 أشهر مستحقة |
| member-links legend | ✓ أُرسل · ✓✓ يستخدمه | tags «أُرسل» / «فتحه» |
| late page (2 lines) | اضغط زر واتساب بجانب الاسم… + الأكثر تأخرًا أولًا. التذكير يصل للعضو وحده مع المبلغ. | الأكثر تأخرًا أولًا. التذكير يصل للعضو وحده مع أشهره ومبلغه. |
| late page (new) | – | ذكّر الجميع بالترتيب |
| late row, no phone | (green WhatsApp button) | اختر في واتساب |
| expense footer | المجموع 0 أوقية | المبلغ: … أوقية |
| expense button (missing) | سجّل المصروف (disabled) | اختر النشاط / اكتب المبلغ |
| cancel payment | …وتُحذف أشهرها من حساب العضو. | …ولا تُحسب أشهرها للعضو بعد الآن. |
| حسابي | رقم الدخول | البريد أو الهاتف للدخول |
| report share | صور التقرير (واتساب) | صور لواتساب |
| install banner (desktop) | ثبّت التطبيق على هاتفك | ثبّت التطبيق على جهازك |
| stamp band | أمين الصندوق (always) | the confirmer's role |
| report month table future rows | أكتوبر 41 · 26 000 | أكتوبر (مدفوع مقدمًا) |

---

## 5. What's working (keep)

- **Record payment**: the common case is 3 taps. Late months are preselected. The footer button names the missing step and jumps to it. The MRU ×10 detection works, and so does «سجّل X فقط».
- **Confirm/reject** is inline: the stamp lands, there is a 5s undo, the slip collapses, and reject reasons are chips. There is no success takeover.
- **Public privacy** is respected: amounts are hidden, the transaction ref is masked «•••• 0452», and /r says «لا نعرض أرقام الهواتف…».
- **/r verification** gives four clear verdicts, and its not-found state is calm.
- **Offline** shows the banner «غير متصل. آخر تحديث قبل لحظات» with cached pages. «آخر من بحثت عنهم» is a lovely touch.
- **«روابط الأعضاء» walk card** is the right pattern. Reuse it for reminders.

## 6. Persona red flags

- **Older villager, first time, cheap Android.** Taps the search, the keyboard covers the results (V1), and they conclude "I'm not in the list". On their personal link they see «أرسلت دفعة» before paying (M4). After sending, the card still says «عليك» (M1), so they send again.
- **Treasurer in a hurry.** The OCR fails, the app says the money went to the wrong number (C1), and they reject. Their thumb hits the FAB instead of «تأكيد الاستلام» (C3). Reminders mean 47 WhatsApp round-trips (C5).
- **Admin editing a member.** Can't see the member's months in the admin sheet (C7), and the tiny run-together links invite mis-taps.

## 7. Questions for the owner

- Should the public member sheet keep word labels («لم يحن / متأخر») inside the ✓ model, or match the report exactly (✓ or empty)?
- Is red «مرفوض» acceptable on a member's own /me, or should it be grey «لم تُقبل»?

Questions skipped: this was a subagent run, and the caller relays these to the owner.
