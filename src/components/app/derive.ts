// Pure UI helpers: Arabic wording, member state, search, dates. No React, no data fetching.
import { MONTHS_AR, WEEKDAYS_AR } from "@/lib/dates";
import { CATEGORY_LABELS } from "@/lib/data/labels";
import { formatNumber } from "@/lib/format";
import { monthStates } from "@/lib/data/month-code";
import { memberNumber } from "@/lib/share-receipt";
import { nameRank, toLatinDigits } from "./search-text";
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

/**
 * Arabic count with the noun, in one place (QA pass 4). `c` = the grammatical case: "subj" for a
 * count standing as subject or alone («شهران»), "obl" after a noun, a preposition or a verb
 * («رسوم شهرين»، «عن شهرين»، «سجّل شهرين»). 3–10 plural, 11–99 singular with tanween, 100+
 * (x00–x02) plain singular. 0 → `zero` when given.
 */
type Forms = { one: string; two: string; twoObl: string; few: string; many: string; bare: string };
export function arCount(n: number, f: Forms, c: "subj" | "obl" = "subj") {
  if (n === 1) return f.one;
  if (n === 2) return c === "obl" ? f.twoObl : f.two;
  const r = n % 100;
  if (r >= 3 && r <= 10) return `${n} ${f.few}`;
  if (r >= 11 && r <= 99) return `${n} ${f.many}`;
  return `${n} ${f.bare}`;
}
const MONTH_F: Forms = {
  one: "شهر واحد",
  two: "شهران",
  twoObl: "شهرين",
  few: "أشهر",
  many: "شهرًا",
  bare: "شهر",
};
const MEMBER_F: Forms = {
  one: "عضو واحد",
  two: "عضوان",
  twoObl: "عضوين",
  few: "أعضاء",
  many: "عضوًا",
  bare: "عضو",
};

/** «شهر واحد / شهران / 3 أشهر / 12 شهرًا»; `obl` after «رسوم / عن / سجّل»: «شهرين». */
export const monthCount = (n: number, c: "subj" | "obl" = "subj") => arCount(n, MONTH_F, c);
/** The noun alone after a shown number («من 88 عضوًا», «من 100 عضو», «من 7 أعضاء»). */
export const memberNoun = (n: number) => memberCount(n, "obl").replace(/^\d+ /, "");
/** «عضو واحد / عضوان / 3 أعضاء / 11 عضوًا / 100 عضو»; `obl`: «عضوين». */
export const memberCount = (n: number, c: "subj" | "obl" = "subj") => arCount(n, MEMBER_F, c);

/** «3 أسماء» … «10 أسماء», «34 اسمًا» (audit V5). */
export function namesCount(n: number) {
  return n >= 3 && n <= 10 ? `${n} أسماء` : `${n} اسمًا`;
}

/** After «متأخر عن رسوم»: «شهر واحد / شهرين / 3 أشهر» (audit V3: not «شهرًا»). */
export const lateCount = (n: number) => (n === 2 ? "شهرين" : monthCount(n));

/** Why a picked image could not be opened: HEIC/HEIF photos need a screenshot instead. */
export function imageOpenError(f: { type: string; name: string }) {
  return /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name)
    ? "هذه الصورة بصيغة لا يقرؤها الهاتف. أرسل لقطة شاشة بدلًا منها."
    : "تعذّر فتح الصورة. جرّب صورة أخرى.";
}

/** «دفعة واحدة / دفعتان / 3 دفعات / 12 دفعة» (subject of «توجد …»). */
export function paymentCount(n: number) {
  if (n === 1) return "دفعة واحدة";
  if (n === 2) return "دفعتان";
  return n <= 10 ? `${n} دفعات` : `${n} دفعة`;
}

/** «مساهمة واحدة / مساهمتان / 3 مساهمات / 12 مساهمة». */
export function contributionCount(n: number) {
  if (n === 1) return "مساهمة واحدة";
  if (n === 2) return "مساهمتان";
  return n <= 10 ? `${n} مساهمات` : `${n} مساهمة`;
}

/** «لا مساهمين بعد / مساهم واحد / مساهمان / 3 مساهمين / 31 مساهمًا / 100 مساهم». */
export function contributorCount(n: number) {
  if (n <= 0) return "لا مساهمين بعد";
  if (n === 1) return "مساهم واحد";
  if (n === 2) return "مساهمان";
  if (n <= 10) return `${n} مساهمين`;
  return n % 100 >= 11 && n % 100 <= 99 ? `${n} مساهمًا` : `${n} مساهم`;
}

/** Pending payments that carry a contribution to this campaign. */
export function pendingForCampaign(
  pending: { id: string; allocations: { kind: string; campaignId?: string | null }[] }[],
  campaignId: string,
) {
  return new Set(
    pending
      .filter((p) =>
        p.allocations.some((a) => a.kind === "campaign" && a.campaignId === campaignId),
      )
      .map((p) => p.id),
  ).size;
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

// differs from STATUS_LABELS in @/lib/data/labels on purpose: a deceased member reads «غادر» here
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

/** A closed campaign that collected and spent nothing: not worth a row anywhere public. */
export const isEmptyClosedCampaign = (c: { status: string; collected: number; spent: number }) =>
  c.status !== "open" && !c.collected && !c.spent;

/** Hidden from public lists by default. */
export const isGone = (s: MembershipStatus) => s === "left" || s === "deceased";

/** memberRef «A-12» (internal key) → list letter «أ» and paper number 12. */
export function splitRef(ref: string) {
  const [l = "", n = ""] = ref.split("-");
  return { letter: groupLabel(l), n: Number(n) || 0 };
}

/**
 * How people read a member number. Inside one group's section: «12». Where groups mix:
 * «أ 12» (Arabic letter, thin space, number). Never show memberRef's Latin form.
 */
export function memberLabel(
  m: { memberRef: string },
  { scoped = false }: { scoped?: boolean } = {},
) {
  return scoped ? String(splitRef(m.memberRef).n) : memberNumber(m.memberRef);
}

/** «أ12» «أ 12» «ب12» «A12» «a-12» (any digits) → memberRef «A-12»; else null. */
export function parseMemberRef(q: string): string | null {
  const t = toLatinDigits(q.trim());
  const c = /^([abأإاب])\s*-?\s*(\d+)$/i.exec(t);
  if (!c) return null;
  const l = /^[aأإا]$/i.test(c[1]) ? "A" : "B";
  return `${l}-${Number(c[2])}`;
}

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

/**
 * One status phrase, like phone credit «صالح حتى» (UX-PATTERNS P1): «دفع حتى أغسطس», the last
 * month of the unbroken paid run from the first owed month. No counting («X من Y», «متأخر 3»);
 * lateness is implicit. Nothing paid yet: «لم يدفع هذا العام»; every owed month paid: «دفع السنة
 * كاملة»; a gap before a later payment or an older year: «لم يدفع رسوم <شهر> [<سنة>]»;
 * nothing due yet: «منتظم». `year` adds the year to month phrases (member sheet). Needs the
 * month code for exact words; without it, months are assumed paid from January.
 */
export type StatusInput = StateInput & { months?: string; pastLate?: string[] };
export function statusLabel(m: StatusInput, year?: number) {
  if (m.status !== "active") return OFF_LABEL[m.status as Exclude<MembershipStatus, "active">];
  const y = year ? ` ${year}` : "";
  if (m.pastLate?.length) {
    const [py, pm] = m.pastLate[0].split("-").map(Number);
    if (py && pm) return `لم يدفع رسوم ${MONTHS[pm - 1]} ${py}`;
  }
  if (!m.months) {
    if (m.monthsPaidThisYear >= 12) return "دفع السنة كاملة";
    if (m.monthsPaidThisYear > 0) return `دفع حتى ${MONTHS[m.monthsPaidThisYear - 1]}${y}`;
    return m.monthsBehind > 0 ? "لم يدفع هذا العام" : "منتظم";
  }
  const st = monthStates(m.months);
  const owed = st.flatMap((x, i) => (x === "not_owed" ? [] : [i]));
  const paid = owed.filter((i) => st[i] === "paid");
  if (owed.length && paid.length === owed.length) return "دفع السنة كاملة";
  let upTo = -1;
  for (const i of owed) {
    if (st[i] !== "paid") break;
    upTo = i;
  }
  if (upTo >= 0) return `دفع حتى ${MONTHS[upTo]}${y}`;
  const firstLate = owed.find((i) => st[i] === "late");
  if (firstLate === undefined) return "منتظم";
  return paid.length ? `لم يدفع رسوم ${MONTHS[firstLate]}${y}` : "لم يدفع هذا العام";
}

/** Committee late list: «لم يدفع منذ يوليو 2026» from the oldest late month ("YYYY-MM"). */
export function unpaidSince(months: string[]) {
  const [y, m] = (months[0] ?? "").split("-").map(Number);
  return y && m ? `لم يدفع منذ ${MONTHS[m - 1]} ${y}` : "";
}

export const byMostLate = (a: MemberStatus, b: MemberStatus) =>
  b.monthsBehind - a.monthsBehind || a.number - b.number;

export function groupLabel(code: string) {
  const c = code.trim().toUpperCase();
  return c === "A" ? "أ" : c === "B" ? "ب" : code;
}

export { normalizeAr } from "./search-text";

/**
 * Digits search the paper number in both groups (exact first); «أ12» / «أ 12» / «A12» / «a-12»
 * find one member; words search the name.
 */
export function searchMembers<T extends { fullName: string; number?: number; memberRef?: string }>(
  list: T[],
  q: string,
): T[] {
  const t = toLatinDigits(q.trim());
  if (!t) return [];
  const ref = parseMemberRef(t);
  if (ref) return list.filter((m) => (m.memberRef ?? "").toUpperCase() === ref);
  if (/^\d+$/.test(t)) {
    const no = (m: T) => m.number ?? splitRef(m.memberRef ?? "").n;
    return list
      .filter((m) => String(no(m)).startsWith(t))
      .sort((a, b) => Number(String(no(b)) === t) - Number(String(no(a)) === t) || no(a) - no(b));
  }
  return list
    .map((m, i) => ({ m, i, r: nameRank(m.fullName, t) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.m);
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

// one source for the expense categories (the report and the server use the same labels)
export { CATEGORY_LABELS as CATEGORY_LABEL } from "@/lib/data/labels";
export const categoryLabel = (c: ExpenseCategory) => CATEGORY_LABELS[c];

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
