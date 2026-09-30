// What a committee push notification says. Pure (unit tested); the service worker (Lane B) shows
// { title, body } and opens `url` on click; the same `tag` replaces an older notification.
import { formatNumber } from "@/lib/format";
import { monthsList } from "@/lib/data/reminders";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  /** payments waiting for confirmation right now (for navigator.setAppBadge); absent if unknown */
  badgeCount?: number;
};

type Alloc =
  | { kind: "months"; year: number; month: number; memberId?: string }
  | { kind: "campaign"; memberId?: string | null }
  | { kind: "credit" };

/** «أحمد · 3 000 أوقية · يوليو، أغسطس، سبتمبر 2026» (+ «تبرع» / «رصيد» when present). */
export function pendingPaymentPayload(p: {
  id: string;
  payerName: string;
  amount: number;
  allocations: Alloc[];
}): PushPayload {
  const yms = [
    ...new Set(
      p.allocations.flatMap((a) =>
        a.kind === "months" ? [`${a.year}-${String(a.month).padStart(2, "0")}`] : [],
      ),
    ),
  ].sort();
  const parts = [p.payerName.trim(), `${formatNumber(p.amount)} أوقية`];
  if (yms.length) parts.push(monthsList(yms));
  if (p.allocations.some((a) => a.kind === "campaign")) parts.push("تبرع");
  if (p.allocations.some((a) => a.kind === "credit")) parts.push("رصيد");
  return {
    title: "دفعة بانتظار التأكيد",
    body: parts.join(" · "),
    url: "/committee",
    tag: `pending-${p.id}`,
  };
}

/* ───────────── to the other committee members (m29: one level, no confirmation step) ───────────── */

/** The one member a payment is for, or null (several people, or an outside donor). */
function paidFor(allocations: Alloc[]): string | null {
  const ids = new Set(
    allocations.flatMap((a) => ("memberId" in a && a.memberId ? [a.memberId] : [])),
  );
  return ids.size === 1 ? [...ids][0] : null;
}

/** «سجّل أحمد دفعة»: payer · amount · months (+ «تبرع» / «لوحة» / «رصيد»). */
export function recordedPaymentPayload(p: {
  id: string;
  actorName: string | null;
  payerName: string;
  amount: number;
  allocations: Alloc[];
}): PushPayload {
  const base = pendingPaymentPayload(p);
  const onlyCampaign =
    p.allocations.length > 0 && p.allocations.every((a) => a.kind === "campaign");
  const what = onlyCampaign ? "مساهمة" : "دفعة";
  return {
    ...base,
    title: p.actorName ? `سجّل ${firstName(p.actorName)} ${what}` : `${what} جديدة`,
    // owner: opens the member's «كشف حساب» (one member), else «سجل العمليات»
    url: paidFor(p.allocations)
      ? `/committee/members/${paidFor(p.allocations)}`
      : "/committee/activity",
    tag: `payment-${p.id}`,
  };
}

/** «سجّل أحمد مصروفًا»: note or category · amount. */
export function expensePayload(p: {
  id: string;
  actorName: string | null;
  label: string;
  amount: number;
}): PushPayload {
  return {
    title: p.actorName ? `سجّل ${firstName(p.actorName)} مصروفًا` : "مصروف جديد",
    body: `${p.label.trim()} · ${formatNumber(p.amount)} أوقية`,
    url: "/committee/expenses",
    tag: `expense-${p.id}`,
  };
}

/** «ألغى أحمد دفعة» with the reason. */
export function cancelPayload(p: {
  id: string;
  actorName: string | null;
  what: "دفعة" | "مصروفًا";
  reason: string;
}): PushPayload {
  return {
    title: p.actorName ? `ألغى ${firstName(p.actorName)} ${p.what}` : `إلغاء ${p.what}`,
    body: p.reason.trim(),
    url: "/committee/activity",
    tag: `cancel-${p.id}`,
  };
}

/** «لوحة جديدة: …» with how many members it is set on. */
export function levyPayload(p: {
  id: string;
  title: string;
  amount: number;
  members: number;
}): PushPayload {
  return {
    title: `لوحة جديدة: ${p.title.trim()}`,
    body: `${formatNumber(p.amount)} أوقية · ${formatNumber(p.members)} عضوًا`,
    url: "/committee/donations",
    tag: `levy-${p.id}`,
  };
}

/** «محمد» from «محمد ولد أحمد»: short enough for a notification title. */
/** The daily accuracy check found a number that does not add up («مسؤول» only). */
export function auditAlertPayload(day: string): PushPayload {
  return {
    title: "تنبيه: رقم في الصندوق لا يتطابق",
    body: "افتح التطبيق.",
    url: "/committee",
    tag: `audit-${day}`,
  };
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full.trim();
}
