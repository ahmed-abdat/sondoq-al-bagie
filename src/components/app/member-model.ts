// Member link, pure: the «أنت» card's words and the «دفعاتي» sections. Unit tested.
import { monthStates } from "@/lib/data/month-code";
import { fmt, monthsInWords, MONTHS, statusLabel } from "./derive";
import type { MemberHistoryItem, MemberSession } from "@/lib/data/member-types";

/** The member's own status phrase (P1), in the second person: «دفعت حتى يوليو». */
export function youPhrase(code: string) {
  return statusLabel({ status: "active", monthsBehind: 1, monthsPaidThisYear: 0, months: code })
    .replace(/^دفع /, "دفعت ")
    .replace(/^لم يدفع/, "لم تدفع");
}

/**
 * «لا رسوم عليك الآن» or «دفعت حتى يوليو · عليك 1 500 أوقية» (plus «معفى من الرسوم» for exempt
 * members). No month counts (UX-PATTERNS P1); the amount is the member's own.
 */
export function youStatus(
  s: Pick<MemberSession, "status" | "monthsBehind" | "amountOwed">,
  code = "",
) {
  if (s.status === "exempt") return { late: false, text: "إعفاء من الرسوم الشهرية" };
  if (s.monthsBehind <= 0) return { late: false, text: "لا رسوم عليك الآن" };
  const owed = s.amountOwed > 0 ? `عليك ${fmt(s.amountOwed)} أوقية` : "";
  const phrase = code ? youPhrase(code) : "";
  return { late: true, text: [phrase, owed].filter(Boolean).join(" · ") || "عليك رسوم" };
}

/**
 * What the «أنت» card says and offers (owner, r24): the whole year paid → thanks, no pay button;
 * paid up to a month → «دفعت حتى سبتمبر»; late → «عليك …» and one «ادفع الآن»; exempt.
 */
export type YouKind = "full" | "upto" | "late" | "pending" | "exempt";
export function youCard(
  s: Pick<MemberSession, "status" | "monthsBehind" | "amountOwed">,
  code: string,
  year: number,
  /** payments sent from this link, waiting for the committee */
  waiting = 0,
): { kind: YouKind; text: string } {
  if (s.status === "exempt") return { kind: "exempt", text: "إعفاء من الرسوم الشهرية" };
  // late but proof already sent (audit M1): say it arrived, no second big «ادفع الآن»
  if (s.monthsBehind > 0 && waiting > 0)
    return { kind: "pending", text: "وصلتنا الصورة. اللجنة تراجعها. لم تُسجّل الدفعة بعد." };
  if (s.monthsBehind > 0) return { kind: "late", text: youStatus(s, code).text };
  const dots = youDots(code);
  const owed = dots.filter((d) => d.state !== "off");
  if (owed.length && owed.every((d) => d.state === "paid"))
    return { kind: "full", text: `دفعت رسوم ${year} كاملة` };
  const last = [...dots].reverse().find((d) => d.state === "paid");
  return { kind: "upto", text: last ? `دفعت حتى ${last.name}` : "لا رسوم عليك الآن" };
}

export type Dot = { month: number; name: string; state: "paid" | "late" | "upcoming" | "off" };
/** This year's twelve months as dots, January first. */
export function youDots(code: string): Dot[] {
  return monthStates(code).map((st, i) => ({
    month: i + 1,
    name: MONTHS[i],
    state: st === "not_owed" ? "off" : st,
  }));
}
export const DOT_WORD: Record<Dot["state"], string> = {
  paid: "مدفوع",
  late: "متأخر",
  upcoming: "لم يحن",
  off: "غير مستحق",
};

/**
 * My submissions still waiting (audit B09): `sent` = everything sent through this link (the
 * «بانتظار التأكيد» line), `mine` = only those covering my own months. Only `mine` may turn the
 * late card into «تنتظر تأكيد اللجنة»; proof sent for someone else never hides my «ادفع الآن».
 */
export function pendingCounts(
  items: Pick<MemberHistoryItem, "status" | "sentByMe" | "allocations">[],
  meId: string,
) {
  const sent = items.filter((x) => x.status === "pending" && x.sentByMe);
  return {
    sent: sent.length,
    mine: sent.filter((x) => x.allocations.some((a) => a.kind === "months" && a.memberId === meId))
      .length,
  };
}

/** «دفعة بانتظار التأكيد» / «دفعتان …» / «3 دفعات …». */
export function waitingLine(n: number) {
  if (n <= 0) return "";
  if (n === 1) return "دفعة بانتظار التأكيد";
  if (n === 2) return "دفعتان بانتظار التأكيد";
  return n <= 10 ? `${n} دفعات بانتظار التأكيد` : `${n} دفعة بانتظار التأكيد`;
}

/** What a payment covered, one line per member (and per year), plus contributions and credit. */
export function coverLines(item: Pick<MemberHistoryItem, "allocations">, meId?: string) {
  const byKey = new Map<string, { name: string; me: boolean; year: number; months: number[] }>();
  const other: string[] = [];
  for (const a of item.allocations) {
    if (a.kind === "months" && a.month && a.year) {
      const k = `${a.memberId}:${a.year}`;
      const cur = byKey.get(k) ?? {
        name: a.fullName ?? "",
        me: !!meId && a.memberId === meId,
        year: a.year,
        months: [],
      };
      cur.months.push(a.month);
      byKey.set(k, cur);
    } else if (a.kind === "campaign")
      other.push(`مساهمة ${fmt(a.amount)} أوقية${a.campaignTitle ? ` في ${a.campaignTitle}` : ""}`);
    else if (a.kind === "credit")
      other.push(`رصيد ${fmt(a.amount)} أوقية${a.fullName ? ` لـ ${a.fullName}` : ""}`);
  }
  const multi = byKey.size > 1;
  return [
    ...[...byKey.values()].map((c) => {
      const what = `رسوم ${monthsInWords(
        [...c.months].sort((x, y) => x - y),
        c.year,
      )}`;
      if (!multi && c.me) return what;
      return `${c.me ? "عنك" : `عن ${c.name}`}: ${what}`;
    }),
    ...other,
  ];
}

/** «دفعاتي» sections, newest first inside each. Cancelled payments are left out. */
export function historySections(items: MemberHistoryItem[]) {
  return {
    waiting: items.filter((x) => x.status === "pending"),
    rejected: items.filter((x) => x.status === "rejected" && x.sentByMe),
    mine: items.filter((x) => x.status === "confirmed" && x.forMe),
    forOthers: items.filter((x) => x.status === "confirmed" && x.sentByMe && !x.forMe),
  };
}
