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

/** "5 أكتوبر", optionally with year / weekday. */
export function formatDay(iso: string, opts: { year?: boolean; weekday?: boolean } = {}): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "long",
    year: opts.year ? "numeric" : undefined,
    weekday: opts.weekday ? "long" : undefined,
    timeZone: TIME_ZONE,
  }).format(toDate(iso));
}

/** "أكتوبر 2026" from "2026-10" or any ISO date. */
export function formatMonth(isoOrYm: string, withYear = true): string {
  return new Intl.DateTimeFormat(LOCALE, {
    month: "long",
    year: withYear ? "numeric" : undefined,
    timeZone: TIME_ZONE,
  }).format(new Date(`${isoOrYm.slice(0, 7)}-15T12:00:00Z`));
}

/** Month name for 1–12 (January = 1), as on the paper sheets. */
export function monthName(month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError("month 1-12");
  return new Intl.DateTimeFormat(LOCALE, { month: "long", timeZone: TIME_ZONE }).format(
    new Date(Date.UTC(2026, month - 1, 15, 12)),
  );
}

export function formatWeekday(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "long", timeZone: TIME_ZONE }).format(
    toDate(iso.slice(0, 10)),
  );
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
