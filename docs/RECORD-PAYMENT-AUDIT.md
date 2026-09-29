# «سجّل دفعة»: audit and plan (Lane C2)

Scope: `src/components/app/record.tsx` (FAB on /committee → `RecordBody` in a `Sheet`), the
member picker (`search-field.tsx`, keypad), month chips/strip, method grid, OCR (`@/lib/ocr`),
proof upload, several members, payer, transfer amount (short/over → credit), date, campaign.
Baseline read at m2-app `bf2313e`; screenshots of the old sheet in
`/private/tmp/claude-502/sondoq-shots/rec/before-*`.

## Common case today (one late member, WhatsApp screenshot)
FAB → member → scroll past «الدافع» and «مساهمة في حملة» → «اختر صورة التحويل» → gallery →
scroll → method (if the reading missed it) → «سجّل الدفعة». **6 taps + 2 scrolls**; the save
button sits disabled with a hint about a field that is off screen.

## Findings (by leverage)
| # | Finding | Impact | Effort |
|---|---|---|---|
| 1 | The screenshot, which fills most fields, comes after the payer and the campaign link; the order fights the real task (screenshot first). | High | S |
| 2 | Dead end: the primary button is disabled with a hint («بقي أن تختار كيف دفع») while the field is below the fold. Nothing takes you there. | High | S |
| 3 | No summary of what will be saved. The footer shows only «المجموع» and a figure; the method, months and date are spread over the sheet. | High | S |
| 4 | Everything is visible at once: payer section, campaign link, ref, transfer amount, date. Six labelled blocks for a case that needs two. | High | M |
| 5 | OCR fills fields silently: nothing says which values came from the picture; «تحقق» only appears on failure. A second picture can race the first reading (the older result may land last). | Med | S |
| 6 | The amount «تحقق» uses the OCR check against the total at the time of the read; changing months afterwards leaves a stale mark. The live difference is the real check. | Med | S |
| 7 | Row subline «رسوم من يناير إلى سبتمبر · 9 أشهر × 500» wraps the figure onto its own line at 390px; the row never shows its own amount. | Med | S |
| 8 | «إضافة عضو آخر لنفس التحويل» is a full-width soft button that competes with the primary action for the rare case. | Low | S |
| 9 | After a member is picked, focus is lost (the picker unmounts); keyboard users restart from the top. | Low | S |
| 10 | New sections pop in with no transition; the disclosure has no feedback. | Low | S |

## Plan (done in this lane, see UI-PORT-STATUS «Record payment, simplified»)
1. Reorder: who → screenshot card → method → date → «تفاصيل أخرى» (transfer amount, ref, payer,
   campaign) collapsed, opened automatically when a value there needs attention.
2. One primary button that is never a dead end: when something is missing it names the next
   step («اختر كيف دفع») and takes you there (scroll + focus + short highlight).
3. Footer summary sentence: «سيُسجَّل: 4 500 أوقية · رسوم 9 أشهر · بنكيلي · اليوم».
4. OCR: marked «من الصورة» per field, cleared when edited; stale readings ignored; amount mark
   from the live difference.
5. Row: figure on the trailing side, subline «9 أشهر: من يناير إلى سبتمبر».
6. «إضافة عضو آخر» as a quiet link; focus moves to the new row.
7. Motion: sections enter with 200ms opacity + 8px; reduced motion = no movement.

Kept as is (server contracts): `recordPayment` payload, `uploadProof` (kind "payments"),
`readReceipt`/`warmOcr`/`terminateOcr`, `useAct` demo seam.

## Needs from other lanes (not changed here)
- Lane B/OCR: `ReceiptReading` has no sender name; with it, the payer (and even the member) could
  be suggested from the screenshot.
