// Pure UI helpers: Arabic wording, member state, search, dates. No React, no data fetching.
import { MONTHS_AR, WEEKDAYS_AR } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import type {
  ExpenseCategory,
  MemberMonth,
  MemberStatus,
  SettableStatus,
  MembershipStatus,
} from "@/lib/data/types";

export const MONTHS = MONTHS_AR;
export const ASSOC = "رابطة شباب قرية البقيع";
export const FUND = "صندوق الرابطة";

/** Western digits, narrow no-break space between thousands: 249 000. */
export const fmt = (n: number) => formatNumber(n);

/* ───────────── counts & months in words ───────────── */

/** «شهرًا / شهرين / 3 أشهر / 11 شهرًا» (object of «متأخر …»). */
export function monthsWord(n: number) {
  if (n === 1) return "شهرًا";
  if (n === 2) return "شهرين";
  return n <= 10 ? `${n} أشهر` : `${n} شهرًا`;
}

/** «شهر واحد / شهران / 3 أشهر / 12 شهرًا» (a count on its own). */
export function monthCount(n: number) {
  if (n === 1) return "شهر واحد";
  if (n === 2) return "شهران";
  return n <= 10 ? `${n} أشهر` : `${n} شهرًا`;
}

function runs(ms: number[]) {
  const out: number[][] = [];
  for (const m of [...new Set(ms)].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && m === last[last.length - 1] + 1) last.push(m);
    else out.push([m]);
  }
  return out;
}

/** Short list for rows: «يوليو–سبتمبر», «السنة كاملة», or «مارس، مايو». */
export function monthsLabel(ms: number[]) {
  const r = runs(ms);
  const n = r.reduce((s, x) => s + x.length, 0);
  if (n === 12) return "السنة كاملة";
  if (r.length === 1 && n > 1) return `من ${MONTHS[r[0][0] - 1]} إلى ${MONTHS[r[0][n - 1] - 1]}`;
  return r
    .flat()
    .map((m) => MONTHS[m - 1])
    .join("، ");
}

/** Receipt wording: «يوليو – سبتمبر 2026», «السنة كاملة 2026», runs joined by «، ». */
export function monthsInWords(ms: number[], year: number) {
  const r = runs(ms);
  if (r.reduce((s, x) => s + x.length, 0) === 12) return `السنة كاملة ${year}`;
  const txt = r
    .map((x) =>
      x.length === 1
        ? MONTHS[x[0] - 1]
        : `من ${MONTHS[x[0] - 1]} إلى ${MONTHS[x[x.length - 1] - 1]}`,
    )
    .join("، ");
  return `${txt} ${year}`;
}

const ONES = [
  "",
  "واحد",
  "اثنان",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = [
  "",
  "مائة",
  "مائتان",
  "ثلاثمائة",
  "أربعمائة",
  "خمسمائة",
  "ستمائة",
  "سبعمائة",
  "ثمانمائة",
  "تسعمائة",
];
function below1000(n: number) {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (r && r < 20) parts.push(ONES[r]);
  else if (r) parts.push(r % 10 ? `${ONES[r % 10]} و${TENS[Math.floor(r / 10)]}` : TENS[r / 10]);
  return parts.join(" و");
}

/** 3000 → «ثلاثة آلاف», 1500 → «ألف وخمسمائة» (0 … 999 999). */
export function amountInWords(n: number) {
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  const parts: string[] = [];
  if (th === 1) parts.push("ألف");
  else if (th === 2) parts.push("ألفان");
  else if (th >= 3 && th <= 10) parts.push(`${below1000(th)} آلاف`);
  else if (th > 10)
    parts.push(`${below1000(th)} ${th % 100 >= 11 && th % 100 <= 99 ? "ألفًا" : "ألف"}`);
  if (r) parts.push(below1000(r));
  return parts.join(" و") || "صفر";
}

/* ───────────── members ───────────── */

export type MState = "ahead" | "ok" | "late" | "off";

const OFF_LABEL: Record<Exclude<MembershipStatus, "active">, string> = {
  exempt: "معفى",
  away: "مسافر",
  left: "غادر",
  deceased: "غادر",
};

/** States the committee can set (no "away"/paused, no «متوفى»; owner 2026-09-28). */
export const STATE_LABEL: Record<SettableStatus, string> = {
  active: "نشط",
  exempt: "معفى",
  left: "غادر",
};
/** The states the committee can choose: نشط / معفى / غادر. */
export const STATE_CHOICES = ["active", "exempt", "left"] as const;

/** Hidden from public lists by default. */
export const isGone = (s: MembershipStatus) => s === "left" || s === "deceased";

/** Two lists, each numbered from 1: «A-12» / «B-12» (the data layer's memberRef). */
export const memberCode = (m: { memberRef: string }) => m.memberRef;

/** Next free number in a list: the first gap, else max + 1 (local guess; the server confirms). */
export function nextFreeNumber(list: { listCode: string; number: number }[], listCode: string) {
  const used = new Set(list.filter((m) => m.listCode === listCode).map((m) => m.number));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

/** ahead = paid the whole year · late = at least one due month unpaid · off = not active. */
type StateInput = Pick<MemberStatus, "status" | "monthsBehind" | "monthsPaidThisYear">;
export function memberState(m: StateInput): MState {
  if (m.status !== "active") return "off";
  if (m.monthsBehind > 0) return "late";
  return m.monthsPaidThisYear >= 12 ? "ahead" : "ok";
}

/** Calm, count-only wording for the status tag. Never amounts in public. */
export function statusLabel(m: StateInput, dueMonth?: number) {
  const st = memberState(m);
  if (st === "off") return OFF_LABEL[m.status as Exclude<MembershipStatus, "active">];
  if (st === "ahead") return "دفع السنة كاملة";
  if (st === "ok") {
    // up to date and paid past the due month (months are paid from January on)
    const due = dueMonth ?? currentDueMonth(new Date(), 10);
    if (m.monthsPaidThisYear > due && m.monthsPaidThisYear < 12)
      return `مدفوع مقدَّمًا حتى ${MONTHS[m.monthsPaidThisYear - 1]}`;
    return "منتظم";
  }
  if (m.monthsPaidThisYear === 0) return "لم يدفع هذا العام";
  return `متأخر ${monthsWord(m.monthsBehind)}`;
}

export const byMostLate = (a: MemberStatus, b: MemberStatus) =>
  b.monthsBehind - a.monthsBehind || a.number - b.number;

export function groupLabel(code: string) {
  const c = code.trim().toUpperCase();
  return c === "A" ? "أ" : c === "B" ? "ب" : code;
}

/** Arabic search normalisation: alef forms, taa marbuta, alef maqsura, harakat. */
export function normalizeAr(s: string) {
  return s
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ً-ْـ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Digits search the member number (exact first); «A-12» / «a12» / «أ12» search one list;
 * words search the name.
 */
export function searchMembers<
  T extends { fullName: string; number?: number; memberRef?: string },
>(list: T[], q: string): T[] {
  const t = q.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (!t) return [];
  const coded = /^([abأب])\s*-?\s*(\d+)$/i.exec(t);
  if (coded) {
    const l = { a: "A", b: "B", أ: "A", ب: "B" }[coded[1].toLowerCase() as "a"] ?? "";
    const ref = `${l}-${Number(coded[2])}`;
    return list.filter((m) => (m.memberRef ?? "").toUpperCase() === ref);
  }
  if (/^\d+$/.test(t))
    return list
      .filter((m) => String(m.number ?? Number(m.memberRef?.split("-")[1] ?? 0)).startsWith(t))
      .sort(
        (a, b) =>
          Number(String(b.number) === t) - Number(String(a.number) === t) || (a.number ?? 0) - (b.number ?? 0),
      );
  const n = normalizeAr(t);
  return list.filter((m) => normalizeAr(m.fullName).includes(n));
}

/** The month (1–12) whose fee is due today: after the grace days, else the previous one. */
export function currentDueMonth(today: Date, graceDays: number) {
  const m = today.getUTCMonth() + 1;
  return today.getUTCDate() > graceDays ? m : m - 1;
}

export type MonthCell = { month: number; state: "paid" | "ahead" | "owed" | "future" | "off" };

/** Twelve cells for the member sheet from the member's months of one year. */
export function monthCells(months: MemberMonth[], dueMonth: number): MonthCell[] {
  const by = new Map(months.map((m) => [m.month, m.state]));
  return MONTHS.map((_, i) => {
    const k = i + 1;
    const s = by.get(k);
    if (s === "paid") return { month: k, state: k > dueMonth ? "ahead" : "paid" };
    if (s === "late") return { month: k, state: "owed" };
    if (s === "not_owed") return { month: k, state: "off" };
    return { month: k, state: k <= dueMonth && s === undefined ? "owed" : "future" };
  });
}

/* ───────────── dates (UTC = Nouakchott) ───────────── */

const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (iso: string | Date) =>
  iso instanceof Date ? iso : new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);

/** «28 سبتمبر» */
export const dayWords = (iso: string | Date) => {
  const d = toDate(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
/** «الاثنين 28 سبتمبر 2026» */
export const dayDate = (iso: string | Date) => {
  const d = toDate(iso);
  return `${WEEKDAYS_AR[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
/** «09:48» */
export const clock = (iso: string | Date) => {
  const d = toDate(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
/** «28.09.2026» (stamp dater band) */
export const dotDate = (iso: string | Date) => {
  const d = toDate(iso);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
};

/** «الآن / منذ 12 دقيقة / منذ ساعة / منذ 3 أيام / 28 سبتمبر». */
export function relativeAgo(iso: string, now: Date = new Date()) {
  const s = Math.max(0, (now.getTime() - toDate(iso).getTime()) / 1000);
  const min = Math.floor(s / 60);
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);
  if (min < 1) return "الآن";
  if (min < 60)
    return min === 1
      ? "منذ دقيقة"
      : min === 2
        ? "منذ دقيقتين"
        : `منذ ${min} ${min <= 10 ? "دقائق" : "دقيقة"}`;
  if (h < 24)
    return h === 1 ? "منذ ساعة" : h === 2 ? "منذ ساعتين" : `منذ ${h} ${h <= 10 ? "ساعات" : "ساعة"}`;
  if (d < 7) return d === 1 ? "أمس" : d === 2 ? "منذ يومين" : `منذ ${d} أيام`;
  return dayWords(iso);
}

/** «اليوم، الساعة 10:42» / «أمس، الساعة …» / «28 سبتمبر، الساعة …». */
export function updatedLabel(iso: string, now: Date = new Date()) {
  const d = toDate(iso);
  const same = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  const y = new Date(now.getTime() - 86_400_000);
  const day = same(d, now) ? "اليوم" : same(d, y) ? "أمس" : dayWords(d);
  return `${day}، الساعة ${clock(d)}`;
}

/* ───────────── money & misc ───────────── */

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  teaching: "التدريس",
  honoring: "التكريم",
  sports: "الرياضة",
  other: "أخرى",
};
export const categoryLabel = (c: ExpenseCategory) => CATEGORY_LABEL[c];

/** Public receipts show only the last four characters: «•••• 2917». */
export function maskTxn(ref: string | null | undefined) {
  if (!ref) return "";
  const t = ref.replace(/\s+/g, "");
  return `•••• ${t.slice(-4)}`;
}

export const ROLE_LABEL = {
  admin: "المسؤول",
  treasurer: "أمين الصندوق",
  deputy: "نائب أمين الصندوق",
  committee: "مشرف",
} as const;

/** «ذُكّر قبل 3 أيام» / «ذُكّر أمس» / «لم يُذكَّر بعد». */
export function remindedLabel(iso: string | null, now: Date = new Date()) {
  if (!iso) return "لم يُذكَّر بعد";
  return `ذُكّر ${relativeAgo(iso, now).replace(/^منذ /, "قبل ")}`;
}
