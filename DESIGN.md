---
name: صندوق البقيع
description: The village fund, open to every member — one green, plain words, proof on paper.
colors:
  forest-deep: "#0E3A1B"
  forest: "#1A5F2E"
  association-green: "#237A3B"
  logo-green: "#30A848"
  green-mist: "#CFE7D4"
  green-tint: "#E7F3EA"
  green-wash: "#F3F9F4"
  stamp-green: "#1B6A33"
  logo-gold: "#D9AA2B"
  gold-tint: "#F6EFD9"
  gold-track: "#F1EAD6"
  gold-ink: "#6E5410"
  paper: "#FFFFFF"
  mist: "#F2F4F3"
  stone: "#E8ECEA"
  pebble: "#CDD5D0"
  slate: "#4F5C55"
  ink: "#14201A"
  on-green: "#EEF5EF"
  reject-tint: "#F6E9E6"
  reject-ink: "#8A3B2F"
typography:
  display:
    fontFamily: "Alexandria, Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "clamp(40px, 14vw, 56px)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\", \"lnum\""
  figure:
    fontFamily: "Alexandria, Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\", \"lnum\""
  headline:
    fontFamily: "Alexandria, Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Alexandria, Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.65
  body-strong:
    fontFamily: "Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.4
  button:
    fontFamily: "Alexandria, Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.2
  label:
    fontFamily: "Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label-strong:
    fontFamily: "Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  sm: "14px"
  md: "16px"
  soft: "18px"
  lg: "20px"
  card: "24px"
  sheet: "28px"
  hero: "36px"
  full: "999px"
spacing:
  hair: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  gutter: "20px"
  lg: "24px"
  xl: "32px"
  section: "48px"
  column: "64px"
components:
  hero:
    backgroundColor: "{colors.association-green}"
    textColor: "{colors.paper}"
    rounded: "{rounded.hero}"
    padding: "18px 20px 32px"
  hero-panel:
    backgroundColor: "{colors.association-green}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sheet}"
    padding: "28px"
  nav-bottom:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.slate}"
    height: "64px"
  nav-item-active:
    backgroundColor: "{colors.green-tint}"
    textColor: "{colors.forest-deep}"
    rounded: "{rounded.full}"
    size: "60px x 32px"
  nav-rail:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.slate}"
    width: "104px"
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: "0 22px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.forest-deep}"
    textColor: "{colors.paper}"
  button-primary-lg:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    height: "56px"
    width: "100%"
  button-soft:
    backgroundColor: "{colors.green-tint}"
    textColor: "{colors.forest}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    height: "48px"
  button-soft-hover:
    backgroundColor: "{colors.green-mist}"
  button-tonal:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    height: "48px"
  text-link:
    textColor: "{colors.forest}"
    typography: "{typography.body-strong}"
    height: "44px"
  icon-button:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: "44px"
  fab:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    padding: "0 15px 0 22px"
    height: "56px"
  search-field:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 18px 0 8px"
    height: "60px"
  search-field-focus:
    backgroundColor: "{colors.paper}"
  input:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "52px"
  chip:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "44px"
  chip-selected:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.paper}"
  segmented:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "4px"
  segmented-active:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    height: "44px"
  list-row:
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    padding: "12px 0"
    height: "72px"
  avatar:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: "40px"
  icon-disc:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: "40px"
  icon-disc-in:
    backgroundColor: "{colors.green-tint}"
    textColor: "{colors.association-green}"
  icon-disc-campaign:
    backgroundColor: "{colors.gold-tint}"
    textColor: "{colors.gold-ink}"
  tag-ok:
    backgroundColor: "{colors.green-tint}"
    textColor: "{colors.forest}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.full}"
    padding: "4px 10px 4px 12px"
  tag-late:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.slate}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.full}"
    padding: "4px 10px 4px 12px"
  kind-in:
    backgroundColor: "{colors.green-tint}"
    textColor: "{colors.forest}"
    rounded: "{rounded.full}"
    padding: "1px 10px"
  kind-out:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.slate}"
    rounded: "{rounded.full}"
    padding: "1px 10px"
  kind-rejected:
    backgroundColor: "{colors.reject-tint}"
    textColor: "{colors.reject-ink}"
    rounded: "{rounded.full}"
    padding: "1px 10px"
  progress-track:
    backgroundColor: "{colors.stone}"
    rounded: "{rounded.full}"
    height: "12px"
  progress-fill:
    backgroundColor: "{colors.association-green}"
    rounded: "{rounded.full}"
  campaign-track:
    backgroundColor: "{colors.gold-track}"
    rounded: "{rounded.full}"
    height: "6px"
  campaign-fill:
    backgroundColor: "{colors.logo-gold}"
  month-bar:
    backgroundColor: "{colors.mist}"
    rounded: "{rounded.full}"
    size: "30px x 140px"
  month-bar-fill:
    backgroundColor: "{colors.association-green}"
  month-bar-selected:
    backgroundColor: "{colors.forest-deep}"
  month-bar-future:
    backgroundColor: "{colors.pebble}"
  month-cell-paid:
    backgroundColor: "{colors.association-green}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "64px"
  month-cell-ahead:
    backgroundColor: "{colors.green-tint}"
    textColor: "{colors.forest-deep}"
    rounded: "{rounded.md}"
  month-cell-owed:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  month-cell-future:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.slate}"
    rounded: "{rounded.md}"
  sheet:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.sheet}"
    padding: "0 20px 32px"
    width: "600px"
  pending-slip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "18px 18px 12px"
  receipt-paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "34px 24px 32px"
    width: "400px"
  receipt-amount:
    backgroundColor: "{colors.green-wash}"
    textColor: "{colors.forest-deep}"
    rounded: "{rounded.soft}"
    padding: "14px 16px 16px"
  stamp-confirmed:
    textColor: "{colors.stamp-green}"
    size: "104px"
  confirmed-mark:
    textColor: "{colors.association-green}"
    typography: "{typography.label-strong}"
    size: "22px"
  method-badge:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.slate}"
    size: "28px"
  snack:
    backgroundColor: "{colors.forest-deep}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.soft}"
    height: "56px"
  switch-card:
    backgroundColor: "{colors.green-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px 18px"
    height: "64px"
  verify-card:
    backgroundColor: "{colors.green-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  verify-card-void:
    backgroundColor: "{colors.mist}"
  badge:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    size: "20px"
---

# Design System: صندوق البقيع

## Overview

**Creative North Star: "The Open Ledger on the Village Wall"**

The fund reads like a notice everyone in the village can walk up to: one green field at the top telling you what is in the box, then plain questions answered in plain words underneath. The palette is the association's logo and nothing else: one green in a tonal ramp, a hair of gold, and cool near-white neutrals. Hierarchy comes from type size, spacing and alignment, not from boxes. Most of each screen sits directly on white paper as open sections separated by generous space; only the hero, sheets and receipt slips are contained surfaces.

The system is built for cheap Android phones, mixed literacy and older eyes: body text is 17px, key figures 40px and the balance up to 56px; every number sits next to a two-to-four-word label; every status is an icon plus a word; months are always written as words. One primary action per screen, labelled with a verb. The single moment of theatre is the rubber stamp landing on a confirmed payment; everything else moves quietly, from one motion vocabulary.

Confirmed rejections from the owner: no cards-and-borders layouts, no 1px grey outlines, no extra hues (teal, blue, yellow pills, pink paper, multi-colour category codes), no red fills for lateness, no decorative gold dashes, no full-screen success takeovers.

**Key Characteristics:**
- Logo-only palette: one green ramp, gold as a hairline accent, neutrals.
- Soft structuralism: at most two to three contained surfaces per screen; lists are open rows.
- Two faces: Alexandria for headings and every figure, Noto Sans Arabic for reading.
- RTL-native with LTR-isolated Western-digit figures.
- Five destinations, always within thumb reach (bottom bar on phones, start-side rail on desktop).
- Proof as a visual object: receipts are paper, confirmation is a stamp.

## Colors

One green does all the work; gold only rings the logo and fills the campaign bar; greys carry everything that is not "paid".

### Primary
- **Association Green** (association-green): the hero field, progress fills, paid month cells, paid-count numeral, "in" amounts and icons. White text on it passes (5.4:1); use it as a field, not for small text on white below 17px bold.
- **Forest** (forest): every filled action (primary button, FAB, selected chip/segment, badge, active switch) and green text on tints (tags, links, "دخل"). Chosen over Association Green for filled buttons because white on it reaches 7.7:1.
- **Forest Deep** (forest-deep): primary hover, snack background, selected month bar, active nav label, text on Green Tint.
- **Logo Green** (logo-green): the logo's bright green, used for the 3px focus ring and as the third step of the expense stack. Never text, never a button.
- **Green Mist / Green Tint / Green Wash** (green-mist, green-tint, green-wash): the tonal ladder. Mist = selection highlight and soft-button hover; Tint = tags, icon discs, active nav pill, month "paid ahead", current-month bar track; Wash = quiet contained panels (switch card, verify card, receipt amount block, picked-member row).
- **Stamp Green** (stamp-green): the rubber-stamp ink, multiplied onto paper. Reserved for the stamp.

### Secondary
- **Logo Gold** (logo-gold): the 1.5–3.5px ring around the logo (hero, compact bar, rail, receipt) and the campaign progress fill. It fails as text (2.2:1 on white) and is never text, never a fill larger than a 6px bar.
- **Gold Tint / Gold Track / Gold Ink** (gold-tint, gold-track, gold-ink): the campaign row's icon disc (Tint + Ink) and its bar track. Campaign only.

### Neutral
- **Paper** (paper): page ground, sheets, slips, receipts, nav bar.
- **Mist** (mist): filled fields, chips, segmented track, avatars, neutral icon discs, "late" tag, row hover, future month cell.
- **Stone** (stone): progress track, tonal (secondary) button, owed-month hatching base, segmented hover.
- **Pebble** (pebble): future month bars, sheet drag handle, fourth expense-stack colour.
- **Slate** (slate): muted text (labels, hints, units, inactive nav). 7.0:1 on Paper, 6.4:1 on Mist.
- **Ink** (ink): all primary text.
- **On-Green** (on-green): secondary text on the green hero (labels, «أوقية», stats labels); 4.8:1 on Association Green.

### Reject
- **Reject Tint / Reject Ink** (reject-tint, reject-ink): the only red, and only for the word «مرفوض» / void state (kind tag, void verify icon). Committee-only surfaces.

### Named Rules
**The Logo-Only Rule.** Every colour on screen comes from the logo: the green ramp, the gold, and neutrals. Adding a hue for a category, a chart series or a state is forbidden; expense categories use green steps and Pebble.

**The Grey-Is-Late Rule.** Lateness is neutral: Mist fills, Slate text, a clock icon and hatched month cells. Red never marks a late member; it is reserved for the «مرفوض» word and the rejected stamp.

**The Hairline-Gold Rule.** Gold appears only as the logo ring and the campaign bar. If gold is carrying text, a button or a background larger than a 40px disc, it is wrong.

## Typography

**Display Font:** Alexandria (with Noto Sans Arabic, system-ui)
**Body Font:** Noto Sans Arabic (with system-ui, sans-serif)

**Character:** Alexandria is wide and confident, with lining digits that make balances read like a signboard; Noto Sans Arabic is Android's own Arabic, calm and legible at 17px on a cheap screen.

### Hierarchy
- **Display** (700, clamp(40px, 14vw, 56px), 1.1, -0.02em): the balance in the hero only; allowed to wrap before it clips. 52px in the desktop hero panel.
- **Figure** (700, 40px, 1.15): the one big number of a section (selected month's collection, pending slip amount, expense amount, campaign collected).
- **Headline** (700, 28px, 1.3): page titles (الأعضاء, الحسابات …), sum totals, home paid-count numerals, record-sheet total.
- **Title** (700, 22px, 1.35): section headings, member/receipt sheet titles, slip payer name, hero unit «أوقية».
- **Body** (400, 17px, 1.65): all reading text; 17px is the floor for anything a member must read.
- **Body Strong** (600, 17px, 1.4): list row titles, text links, sub-sums, stats values.
- **Button** (Alexandria 600, 17px): every button label.
- **Label** (400/600, 14px, 1.5): secondary lines, hints, tags, chips, nav labels, units. 14px is the floor for UI text.

The scale steps are 14 / 17 / 22 / 28 / 40 / 56 (ratio at least 1.25 between steps). Do not add in-between sizes.

### Named Rules
**The Figures-Are-Alexandria Rule.** Every number (amounts, counts, dates in digits, member numbers, transaction refs) is set in Alexandria with tabular lining numerals, no wrapping, inside an LTR-isolated span. Thousands are grouped with a non-breaking space (249 000), never a comma.

**The Label-Next-To-Number Rule.** No bare numbers. Each figure has a two-to-four-word label beside or above it («في الصندوق الآن», «جُمع هذا العام»), and counts are written as counts («32 من 71 عضوًا»), never percentages alone (the campaign % sits beside its amounts).

## Layout

Mobile first, single column, 20px gutter (hero padding uses `max(20px, safe-area inset)`). The hero bleeds edge to edge (negative 20px inline margin) from the top safe area. Sections are open: 48px between sections, 32px from hero to the first section, 24px from a page title to its first section, 16px below a section heading, 12px between a field and its controls. List rows are 72px minimum with 12px block padding and a 16px gap between leading disc and text. The frame reserves the nav height plus safe area plus 48px at the bottom (plus 56px more when the FAB is present). The root clips horizontal overflow; verified at 320 / 360 / 390 / 414 with a seven-digit balance.

Home carries only: hero, «هل أنت منتظم في الدفع؟» with one big search, the paid count with one bar, the three latest public operations, and at most one slim campaign row. Details live in their tabs.

Desktop (at least 1024px): the bottom bar becomes a 104px start-side rail; the content is a centred grid of a column up to 720px plus a 340px sticky aside holding the hero as a panel, 64px apart, 40px side padding. Month bars stop scrolling and spread across the column. Sheets become centred 28px-radius dialogs.

## Elevation & Depth

Flat paper by default. Depth comes from tonal fills (Mist, Green Wash) first; shadow is used only where something genuinely floats above the page (fixed nav, sticky bars, FAB, snack, pending slips, receipts) and is always ultra-soft, large-blur, negative-spread and green-tinted (rgba of 16,40,24 or 14,58,27). A surface gets either a tonal fill or a shadow, never both, and never a border. Exact values are in the sidecar.

### Shadow Vocabulary
- **Slip lift** (`0 1px 2px rgba(16,40,24,.05), 0 12px 32px -14px rgba(16,40,24,.16)`): pending slips and the receipt reject panel.
- **Nav edge** (`0 -10px 28px -16px rgba(16,40,24,.22)`): top edge of the bottom bar; the rail uses the same shadow turned sideways.
- **Sticky bar** (`0 10px 20px -18px rgba(16,40,24,.35)`): the committee header and record-sheet footer (mirrored).
- **FAB** (`0 1px 2px rgba(14,58,27,.2), 0 12px 28px -12px rgba(14,58,27,.55)`): the extended «سجّل دفعة» button.
- **Focus lift** (`0 0 0 2px #237A3B, 0 12px 32px -12px rgba(16,40,24,.12)`): the search field when focused.
- **Paper drop** (`drop-shadow(0 1px 1px rgba(16,40,24,.06)) drop-shadow(0 16px 28px rgba(16,40,24,.10))`): receipt paper, applied to the parent so it follows the torn-edge mask.

### Named Rules
**The No-Line Rule.** No 1px grey borders anywhere. Separation is whitespace; lists may carry a 6% ink hairline inset from the avatar (56px from the start edge), nothing more. The balance sum's total rule (1.5px, 22% ink) is the only drawn line, because it means "equals".

**The Three-Surface Rule.** At most two or three contained surfaces per screen: the hero, a sheet, and receipt slips. Everything else sits on the page.

## Shapes

Soft and consistent. Everything tappable that is not a row is a full pill (999px): buttons, chips, tags, segmented control, nav pill, badges, avatars, icon discs, progress tracks, month bars. Fields and tiles use 16–20px (inputs 16px, search 20px, method options 20px, month cells 16px, month pickers 14px). Contained surfaces step up with their importance: slips and verify cards 24px, sheets 28px (top corners only on mobile), the mobile hero 36px on its bottom corners only, flat to the top edge. Receipts are the one exception: square paper with a perforated top and bottom edge cut by a radial-gradient mask. The logo is always a circle with a white-then-gold double ring.

## Components

### Hero
The one green field. Brand row (48px logo with gold ring, «صندوق البقيع» at 17px/700 and the association name at 14px On-Green, 14px gap), then «في الصندوق الآن», the rolling balance at Display size with «أوقية» in On-Green 22px, then two stats side by side («جُمع هذا العام», «صُرف هذا العام»), then «آخر تحديث: …» (or the pending count for the committee). No toggles, no link, no decorative marks. On mobile home it collapses into a 56px fixed compact bar (small logo, label, balance) when the hero scrolls out, sliding down in 240ms; no blur. On desktop it is a 28px-radius panel in the sticky aside.

### Navigation
- **Bottom bar (below 1024px):** fixed, 64px plus safe-area inset, white, Nav-edge shadow, no line. Five equal items in this order: «الرئيسية», «الأعضاء», «الحسابات», «التبرعات», «اللجنة» (lock icon). Each is a 24px line icon over a 14px label; inactive Slate, active Forest Deep with a 700 label. A single 60×32 Green Tint pill slides between items (translateX, 320ms ease-out). Committee badge: 20px Forest circle with a 2px white ring.
- **Rail (1024px and up):** same five items, 96×76 each, 104px wide, logo at the top, the pill slides vertically.
- Tab change uses a View Transition: the old page fades out in 160ms, the new page fades in and slides 20px in reading direction over 260ms; the nav and the aside are excluded so the pill slides live. Fallback: 180ms fade and 6px rise.

### Buttons
- **Shape:** full pill, 48px tall (56px full-width for the one primary per screen, 52px in slips).
- **Primary:** Forest fill, white Alexandria 17/600 label, verb first («تأكيد الاستلام», «سجّل الدفعة»). Hover (fine pointers only) Forest Deep.
- **Soft:** Green Tint fill, Forest text; for secondary positive actions («عرض كل الأعضاء»). Hover Green Mist.
- **Tonal:** Stone fill, Ink text; for the negative or secondary choice beside a primary («رفض», «تراجع»). Never black ink.
- **Ghost:** transparent, Ink text; for «رجوع».
- **Text link:** Forest 17/600, 44px tall, trailing chevron pointing toward the reading end; the chevron nudges 3px on hover.
- **Press:** every tappable scales to 0.97 in 120ms and releases on the spring (420ms). Disabled is 45% opacity.

### Extended FAB
Committee only: «سجّل دفعة» with a plus icon, Forest, 56px tall, 20px radius, fixed 16px above the bar at the inline end. It collapses to its 56px icon square on scroll-down by animating clip-path (260ms), never width, and hides whenever a sheet is open.

### Search and Inputs
- **Search field:** Mist fill, 60px, 20px radius, 24px search icon, 17px text, placeholder in the reader's words («اكتب اسمك أو رقمك»). No outline at rest; on focus it turns Paper with a 2px Association Green ring and a soft lift, one ring only. Clear button is a 44px circle.
- **Input:** Mist fill, 52px, 16px radius, no border; focus is a 2px Association Green outline.
- Results appear inline below as ordinary list rows; no-match states say what to try in plain words.

### Chips and Segmented Control
- **Chips:** Mist pills, 44px tall, 14/600; selected is Forest with white text. Used for reject reasons and quick month picks.
- **Segmented:** a Mist pill track with 4px padding; one Forest indicator slides between options by animating clip-path (300ms ease-out). Options can carry a count (14/500, 85% opacity). The row scrolls horizontally on its own, never the page. Filters on الأعضاء: «الكل / المتأخرون / الفئة أ / الفئة ب» (+ «لم يدفع أي شهر» for the committee); operations: «الكل / دفعات / مصاريف».

### List Row
Open, no box. 40px leading element (member number avatar in Alexandria on Mist, or an icon disc: Mist neutral, Green Tint for money in, Gold Tint for the campaign), a title at Body Strong that wraps to two lines rather than truncating, a 14px Slate subline, and a trailing element (status tag, or amount over a kind tag). Hover (fine pointers) paints a Mist 18px wash extending 10px beyond the row. Member avatars show the member NUMBER, the identifier people already use.

### Status Tag, Kind Tag, Confirmed Mark
- **Status tag:** pill with a 16px icon and a word. OK = Green Tint/Forest with a check («منتظم», «مدفوع حتى ديسمبر»); late = Mist/Slate with a clock («متأخر شهرين», «لم يدفع هذا العام»). Counts only, never amounts, in public.
- **Kind tag:** small pill under an amount: «دخل» (Green Tint/Forest), «مصروف» (Mist/Slate), «مرفوض» (Reject Tint/Reject Ink, committee only). Amounts carry a sign (+ in Association Green, − in Ink).
- **Confirmed mark:** a 22–28px seal (double ring, check, rotated −10°) in Association Green followed by «مؤكَّد · 28 سبتمبر». It marks every confirmed payment or contribution in a list.

### Method Badge
The real wallet logo (Bankily, Masrvi, Sedad) on a white tile, radius 28% of its size, with a 6% ink hairline plus a small soft shadow, followed by the Arabic name in Alexandria 600. Logos are identifiers and are never recoloured; cash and "other" get a line icon in the same tile.

### Progress
- **Paid-count bar:** one 12px Stone track, the paid part filled with Association Green via scaleX from the start edge, labelled at both ends («✓ دفعوا» in Forest, clock + «لم يدفعوا بعد» in Slate).
- **Campaign bar:** 6px Gold Track with a Logo Gold fill (slim row) or the standard 12px track with the percentage beside it (التبرعات).
- **Month rail:** 58px-wide snapping buttons with a 30×140 pill track; fill scales on Y. Current month's track is Green Tint, the selected bar is Forest Deep with a white-then-Forest ring, future months Pebble. Selecting a month updates the figure above it («ما جُمع كل شهر»).
- **Expense stack:** one 18px bar split by category, largest first, in the green steps Forest, Association Green, Logo Green, then Pebble, with 4px gaps; rounded only at the outer ends; the category list below repeats each colour as a 14px swatch.
- Bars grow once when their section is revealed (700ms ease-out; month bars stagger 30ms).

### Member Sheet
Bottom sheet, Paper, 28px top corners, max 600px wide and 92dvh tall, 5px Pebble handle, 44px close button. Opens with the avatar morphing from the row (View Transition, 320ms drawer curve), sheet in 320ms / out 220ms, scrim `rgba(10,30,18,.42)`. Drag to dismiss with velocity and a rubber-band pull-up. Content: name as Title, number and group, «دفع رسوم 8 من 9 أشهر مستحقة», a status line (icon + words, e.g. «متأخر عن رسوم شهرين: يوليو–أغسطس»), then twelve month cells in a 3-column grid, month names in words: paid (Association Green, white, check «مدفوع»), paid ahead (Green Tint, «مدفوع مسبقًا»), owed (hatched Stone/Mist, clock «متأخر»), not yet (Mist, «لم يحن»). Amount owed appears only for the committee when the switch is on; otherwise «لا تُعرض المبالغ هنا».

### Pending Slip (committee queue)
A white 24px-radius slip with Slip-lift shadow. Header «دفعة بانتظار التأكيد» (14/600 Forest) with the № on the far side; payer at Title; amount at Figure with «أوقية»; «عن: رسوم يوليو – سبتمبر 2026»; method badge plus the full transaction ref in an LTR span; tappable proof thumbnail and «سجّلها …». Then the check hint «طابِق المبلغ ورقم العملية مع محفظة الصندوق قبل التأكيد» directly above a two-column button row: primary «تأكيد الاستلام», tonal «رفض». Reject opens inline reason chips. After a decision the stamp presses onto the slip, «أكّدها … الآن» and WhatsApp share appear inline with a single inline undo; after 5s the slip collapses to one line (confirmed mark or «مرفوض» tag, payer, amount, WhatsApp icon button).

### Receipt («وصل استلام»)
Square white paper, max 400px, perforated top and bottom, Paper-drop shadow. Logo with gold ring and association name; title «وصل استلام» in Forest with the number; payer; an amount block on Green Wash with the figure in Forest Deep, the amount in Arabic words, and the new-ouguiya equivalent; a label/value grid (months in words, method badge, transaction ref with middle-ellipsis and a 44px copy button, proof); a status band that carries the stamp; a footer with the verification code. Two audiences: **public** drops the proof image, «سجّلها» and the QR, and masks the ref to «•••• 2917»; **committee** shows everything. Void receipts keep the paper legible and grey the amount block.

### Stamp
The association rubber stamp: three concentric rings, the association name and «صندوق الرابطة» set on arcs in Alexandria 700, two stars, the word «مؤكَّد» (or «مرفوض»), the date in digits and «أمين الصندوق» in a dater band. Stamp Green (muted red for rejected) with multiply blending, a turbulence ink filter, rotated −10° (−8° rejected). It is the peak moment: scale 1.35 → 0.975 → 1 with blur clearing over 340ms, ink darkening 320ms after 380ms, the paper dipping 1px at impact, and a 12ms haptic tick. Never used decoratively; only on a confirmed or rejected payment.

### Snackbar
Forest Deep, 18px radius, 56px, 14px white text, action in Green Mist Alexandria 700 at 44px. Sits above the nav (and above the FAB when present), in 220ms, out 150ms. Used for confirmations like «نُسخ رقم Bankily»; never a second undo when an inline undo exists.

### Switch Card
Committee settings: a Green Wash 20px-radius row, 64px minimum, title plus one plain-words explanation, and a 52×32 switch whose knob slides toward the inline end (240ms). On is Forest.

### Verification Page
Reached from a receipt's code. Brand row, then one Green Wash (or Mist for void / not found / pending) 24px card with a 64px circular icon (Association Green check; Reject Tint ban for void; Stone search/clock otherwise), a 28px verdict («وصل صحيح», «أُلغي هذا الوصل», «لم يُؤكَّد هذا الوصل بعد», «لم نجد هذا الوصل»), a one-line explanation, then the facts grid and a privacy note. A single full-width soft button returns.

### Motion (all components)
One vocabulary: ease-out `cubic-bezier(0.23,1,0.32,1)`, drawer `cubic-bezier(0.32,0.72,0,1)`, and a spring (linear() curve) used only for press release. UI transitions 150–250ms (the nav pill 240ms); sheets 320ms in / 220ms out. Only transform, opacity, clip-path and filter animate; never width, never `transition: all`, never ease-in. Sections below the fold reveal once (opacity + 12px, 300ms) and are visible by default if JS or IntersectionObserver is missing. Numbers roll over 600ms. Reduced motion: animations become near-instant, transitions shorten to 160ms fades, the sheet and compact bar fade instead of sliding, view transitions are off, and the press scale is removed.

## Do's and Don'ts

### Do:
- **Do** build every screen from the logo palette: the green ramp, gold only as the logo ring and campaign bar, neutrals.
- **Do** use Forest for every filled button and white text; keep Association Green for fields, fills and large figures.
- **Do** group with whitespace (48px between sections, 16px under headings) and leave lists as open 72px rows.
- **Do** pair every status with an icon and a word, every number with a short label, and write months as words.
- **Do** set every figure in Alexandria, tabular, inside an LTR-isolated span, grouped with a non-breaking space.
- **Do** keep text at 17px for reading and never below 14px for UI labels; keep every target at least 44×44.
- **Do** use logical properties (inline-start/end, block-start/end) so layout follows RTL; fills and bars grow from the start (right) edge; forward chevrons point left.
- **Do** call the monthly obligation «الرسوم الشهرية» (group line «الرسوم الشهرية: 1000 أوقية», member «دفع رسوم 8 من 9 أشهر», «متأخر عن رسوم شهرين», receipts «عن: رسوم يوليو – سبتمبر 2026», payment kind «رسوم»).
- **Do** keep donations in their own words: «مساهمة / ساهِم / كيف أساهم؟ / آخر المساهمات».
- **Do** title the monthly chart «ما جُمع كل شهر» and the expenses section «المصاريف», led by «صُرف هذا العام … أوقية على:».
- **Do** keep the stamp as the single peak moment of a confirmation; confirmation stays inline on the slip.
- **Do** respect `prefers-reduced-motion` with fades only, and keep hover effects behind `(hover:hover) and (pointer:fine)`.

### Don't:
- **Don't** draw 1px grey outlines or boxed cards; a surface gets a tonal fill or a soft shadow, never both.
- **Don't** add hues: no teal, blue, yellow pills, pink paper, or multi-colour category codes.
- **Don't** mark lateness in red; red is only for «مرفوض».
- **Don't** put gold on text, buttons or backgrounds, and don't add decorative gold dashes.
- **Don't** use «اشتراك / اشتراكات» anywhere.
- **Don't** show rejected or cancelled operations, receipt images, phone numbers or amounts owed on public surfaces; public receipts mask the ref to its last four digits.
- **Don't** show a bare percentage without the count or amounts beside it.
- **Don't** use full-screen success screens after confirming; don't stack a snackbar undo on top of an inline undo.
- **Don't** animate width, height or left; don't use `transition: all`, ease-in, or linear (except progress); keep sticky and compact bars solid (97% white or green), not blurred.
- **Don't** truncate names with ellipsis in lists; let them wrap to two lines.
- **Don't** use initials in member avatars; the member number is the avatar.
