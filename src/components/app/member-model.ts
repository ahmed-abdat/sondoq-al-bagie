// Member link, pure: the «أنت» card's words and the «دفعاتي» sections. Unit tested.
import { monthStates } from "@/lib/data/month-code";
import { fmt, monthCount, monthsInWords, MONTHS } from "./derive";
import type { MemberHistoryItem, MemberSession } from "@/lib/data/member-types";

/** «أنت منتظم» or «عليك 3 أشهر · 3 000 أوقية» (plus «معفى من الرسوم» for exempt members). */
export function youStatus(s: Pick<MemberSession, "status" | "monthsBehind" | "amountOwed">) {
  if (s.status === "exempt") return { late: false, text: "أنت معفى من الرسوم الشهرية" };
  if (s.monthsBehind <= 0) return { late: false, text: "أنت منتظم" };
  const owed = s.amountOwed > 0 ? ` · ${fmt(s.amountOwed)} أوقية` : "";
  return { late: true, text: `عليك ${monthCount(s.monthsBehind)}${owed}` };
}

/**
 * What the «أنت» card says and offers (owner, r24): the whole year paid → thanks, no pay button;
 * paid up to a month → «دفعت حتى سبتمبر»; late → «عليك …» and one «ادفع الآن»; exempt.
 */
export type YouKind = "full" | "upto" | "late" | "exempt";
export function youCard(
  s: Pick<MemberSession, "status" | "monthsBehind" | "amountOwed">,
  code: string,
  year: number,
): { kind: YouKind; text: string } {
  if (s.status === "exempt") return { kind: "exempt", text: "أنت معفى من الرسوم الشهرية" };
  if (s.monthsBehind > 0) return { kind: "late", text: youStatus(s).text };
  const dots = youDots(code);
  const owed = dots.filter((d) => d.state !== "off");
  if (owed.length && owed.every((d) => d.state === "paid"))
    return { kind: "full", text: `دفعت رسوم ${year} كاملة` };
  const last = [...dots].reverse().find((d) => d.state === "paid");
  return { kind: "upto", text: last ? `دفعت حتى ${last.name}` : "أنت منتظم" };
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
