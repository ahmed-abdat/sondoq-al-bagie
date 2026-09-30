import { LOCALE } from "@/lib/dates";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "قبل 5 دقائق", "قبل ساعتين", "أمس"… for how old the saved data is. Under a minute: "قبل لحظات". */
export function timeAgo(then: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - then);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    if (diff >= ms) return rtf.format(-Math.floor(diff / ms), unit);
  }
  return "قبل لحظات";
}

/**
 * Text of the offline banner. `lastUpdated` = when what is on screen was loaded (ms), if known;
 * without it nothing claims a saved copy (none is kept): the data may just be old.
 */
export function offlineMessage(lastUpdated: number | null, now: number = Date.now()): string {
  if (!lastUpdated) return OFFLINE_NO_DATE;
  return `لا يوجد اتصال. آخر تحديث ${timeAgo(lastUpdated, now)}`;
}

export const OFFLINE_NO_DATE = "لا يوجد اتصال. قد تكون البيانات قديمة.";

export const OFFLINE_WRITE_HINT = "يلزم اتصال بالإنترنت للحفظ. البيانات المعروضة من آخر تحديث.";
