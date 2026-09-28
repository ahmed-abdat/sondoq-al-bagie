import { LOCALE } from "@/lib/dates";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "قبل 5 دقائق", "قبل ساعتين", "أمس"… for how old the saved data is. Under a minute: "الآن". */
export function timeAgo(then: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - then);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    if (diff >= ms) return rtf.format(-Math.floor(diff / ms), unit);
  }
  return rtf.format(0, "second");
}

/** Text of the offline banner. `lastUpdated` = newest saved public data (ms), if any. */
export function offlineMessage(lastUpdated: number | null, now: number = Date.now()): string {
  if (!lastUpdated) return "غير متصل — تعرض آخر نسخة محفوظة";
  return `غير متصل — آخر تحديث ${timeAgo(lastUpdated, now)}`;
}

export const OFFLINE_WRITE_HINT = "يلزم اتصال بالإنترنت للحفظ. البيانات المعروضة من آخر تحديث.";
