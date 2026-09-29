// WhatsApp texts the committee sends from the app (free wa.me links, no API). Simple standard
// Arabic; «الرسوم الشهرية» for the monthly fee. Pure; unit tested. After opening a link, call
// the logReminder action so the arrears list shows «آخر تذكير». Receipt messages: see
// receiptShareText() in src/lib/share-receipt.ts.
import { formatMonth } from "@/lib/dates";
import { formatNumber, ltr } from "@/lib/format";
import { methodLabel, type Method } from "@/lib/methods";
import { mroToMru } from "@/lib/money";
import { waLink } from "@/lib/whatsapp";
import type { Arrear, FundAccount } from "./types";

const FUND = "صندوق الرابطة";

/** "يوليو، أغسطس 2026" — the year once when every month is in the same year. */
export function monthsList(yms: string[]): string {
  if (!yms.length) return "";
  const sameYear = yms.every((m) => m.slice(0, 4) === yms[0].slice(0, 4));
  const names = yms.map((m) => formatMonth(m, !sameYear));
  return sameYear ? `${names.join("، ")} ${yms[0].slice(0, 4)}` : names.join("، ");
}

function monthsCount(n: number): string {
  if (n === 1) return "شهر واحد";
  if (n === 2) return "شهران";
  if (n <= 10) return `${n} أشهر`;
  return `${n} شهراً`;
}

/** Same wording as the shared receipt: «2 000 أوقية (200 أوقية جديدة)». */
function amount(mro: number): string {
  return `${formatNumber(mro)} أوقية (${formatNumber(mroToMru(mro))} أوقية جديدة)`;
}

function accountsBlock(accounts: FundAccount[]): string[] {
  if (!accounts.length) return [];
  return [
    "يمكن التحويل إلى:",
    ...accounts.map(
      (a) => `• ${methodLabel(a.method as Method)}: ${ltr(a.accountNumber)} (${a.holderName})`,
    ),
  ];
}

export type ReminderContext = {
  accounts: FundAccount[];
  /** where members send the transfer screenshot; null → "this number" */
  whatsappContact: string | null;
  /** public page link, e.g. https://…/members */
  publicUrl?: string;
  /** personal reminder: home with «ادفع الآن» open on a phone that holds the member's link,
   *  e.g. https://…/?pay=1 (UX-PATTERNS P4); replaces the public link line */
  payUrl?: string;
};

/** Personal reminder for one late member (sent privately, so the amount is included). */
export function reminderText(
  a: Pick<Arrear, "fullName" | "months" | "monthsCount" | "amountOwed">,
  ctx: ReminderContext,
): string {
  return [
    `السلام عليكم ${a.fullName}،`,
    `نذكّركم بالرسوم الشهرية في ${FUND}.`,
    `الأشهر غير المدفوعة: ${monthsList(a.months)} (${monthsCount(a.monthsCount)}).`,
    `المبلغ: ${amount(a.amountOwed)}.`,
    ...accountsBlock(ctx.accounts),
    ctx.whatsappContact
      ? `بعد التحويل أرسلوا صورة الإيصال إلى ${ltr(ctx.whatsappContact)}.`
      : "بعد التحويل أرسلوا صورة الإيصال إلى هذا الرقم.",
    ...(ctx.payUrl
      ? [`ادفع وأرسل صورة التحويل من هنا: ${ltr(ctx.payUrl)}`]
      : ctx.publicUrl
        ? [`حالة الرسوم الشهرية: ${ltr(ctx.publicUrl)}`]
        : []),
    "جزاكم الله خيراً.",
  ].join("\n");
}

export function reminderLink(a: Arrear, ctx: ReminderContext): string {
  return waLink(a.phone, reminderText(a, ctx));
}

/** One message for the members' WhatsApp group: no names, no amounts. */
export function groupReminderText(ctx: ReminderContext & { lateCount: number }): string {
  return [
    "السلام عليكم،",
    `تذكير بالرسوم الشهرية في ${FUND}.`,
    ctx.lateCount > 0 ? `ما زال ${ctx.lateCount} من الأعضاء لم يسددوا كل الأشهر المستحقة.` : "",
    ...accountsBlock(ctx.accounts),
    ctx.whatsappContact ? `أرسلوا صورة الإيصال إلى ${ltr(ctx.whatsappContact)}.` : "",
    ...(ctx.publicUrl ? [`تفاصيل كل عضو: ${ltr(ctx.publicUrl)}`] : []),
    "جزاكم الله خيراً.",
  ]
    .filter(Boolean)
    .join("\n");
}
