/**
 * Dates in Arabic with Latin digits (ar-MR-u-nu-latn), Gregorian calendar.
 * Nouakchott is UTC+0 all year (no DST), so formatting in UTC is local time.
 */
export const LOCALE = "ar-MR-u-nu-latn";
export const TIME_ZONE = "UTC";

/** "2026-10-05" is read as noon UTC so it never slips a day; full ISO timestamps are kept. */
function toDate(iso: string): Date {
  return new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
}

/**
 * Standard Arabic month names (يناير…ديسمبر). Written out because Intl "ar-MR" gives the
 * Maghreb forms («شتمبر، أغشت، دجمبر») that members do not use.
 */
export const MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;

export const WEEKDAYS_AR = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
] as const;

/** "5 أكتوبر", optionally with year / weekday ("الاثنين 5 أكتوبر 2026"). */
export function formatDay(iso: string, opts: { year?: boolean; weekday?: boolean } = {}): string {
  const d = toDate(iso);
  const day = `${d.getUTCDate()} ${MONTHS_AR[d.getUTCMonth()]}`;
  const withYear = opts.year ? `${day} ${d.getUTCFullYear()}` : day;
  return opts.weekday ? `${WEEKDAYS_AR[d.getUTCDay()]} ${withYear}` : withYear;
}

/** "أكتوبر 2026" from "2026-10" or any ISO date. */
export function formatMonth(isoOrYm: string, withYear = true): string {
  const [y, m] = isoOrYm.slice(0, 7).split("-").map(Number);
  return withYear ? `${monthName(m)} ${y}` : monthName(m);
}

/** Month name for 1–12 (January = 1), as on the paper sheets. */
export function monthName(month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError("month 1-12");
  return MONTHS_AR[month - 1];
}

export function formatWeekday(iso: string): string {
  return WEEKDAYS_AR[toDate(iso.slice(0, 10)).getUTCDay()];
}

/** "14:05" (24-hour). */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return `${formatDay(iso)} · ${formatTime(iso)}`;
}

/** Today's date in Nouakchott as "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
