// كل المبالغ تُخزَّن أعداداً صحيحة بالأوقية القديمة (MRO).
// الإيصالات تعرض غالباً الأوقية الجديدة (MRU)، و 1 MRU = 10 MRO.

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

export function toWesternDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_INDIC.indexOf(d);
    return String(i >= 0 ? i : PERSIAN.indexOf(d));
  });
}

/**
 * يقرأ مبلغاً مكتوباً بأي صيغة شائعة في الإيصالات:
 * "1.500,00" و "1,500.00" و "1 500" و "١٥٠٠" و "1500".
 * يرجع null إذا لم يجد رقماً صالحاً.
 */
export function parseAmount(input: string): number | null {
  let s = toWesternDigits(input)
    .replace(/[٫]/g, ".")
    .replace(/[٬\s  ]/g, "")
    .replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const decimalIdx = Math.max(lastDot, lastComma);
  // الفاصل الأخير عشري فقط إذا تلاه رقم أو رقمان
  const tail = decimalIdx >= 0 ? s.slice(decimalIdx + 1) : "";
  if (decimalIdx >= 0 && tail.length > 0 && tail.length <= 2) {
    const intPart = s.slice(0, decimalIdx).replace(/[.,]/g, "");
    s = `${intPart}.${tail}`;
  } else {
    s = s.replace(/[.,]/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** يحوّل من الأوقية الجديدة (MRU) إلى القديمة (MRO) ويقرّب لعدد صحيح. */
export function mruToMro(mru: number): number {
  return Math.round(mru * 10);
}

/** يحوّل من الأوقية القديمة (MRO) إلى الجديدة (MRU) كما تظهر في المحافظ. */
export function mroToMru(mro: number): number {
  return mro / 10;
}

// العرض في format.ts (أرقام لاتينية وفاصل آلاف ضيق)، ويُعاد تصديره هنا للتوافق.
export { formatMro } from "./format";
