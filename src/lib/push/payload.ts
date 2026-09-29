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
  { kind: "months"; year: number; month: number } | { kind: "campaign" } | { kind: "credit" };

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

/**
 * To the devices of the link that sent the payment. A family phone holds several profiles, so the
 * title says whose: «تم تأكيد دفعة محمد» (→ the receipt).
 */
export function memberConfirmedPayload(p: {
  id: string;
  /** the link's member (first name is enough on a lock screen) */
  memberName?: string | null;
  amount: number;
  receiptCode: string | null;
  allocations: Alloc[];
}): PushPayload {
  const yms = [
    ...new Set(
      p.allocations.flatMap((a) =>
        a.kind === "months" ? [`${a.year}-${String(a.month).padStart(2, "0")}`] : [],
      ),
    ),
  ].sort();
  const parts = [`${formatNumber(p.amount)} أوقية`];
  if (yms.length) parts.push(monthsList(yms));
  return {
    title: p.memberName ? `تم تأكيد دفعة ${firstName(p.memberName)}` : "تم تأكيد دفعتك",
    body: parts.join(" · "),
    url: p.receiptCode ? `/r/${p.receiptCode}` : "/me",
    tag: `member-${p.id}`,
  };
}

/** To the member: «رُفضت دفعة محمد» with the committee's reason. */
export function memberRejectedPayload(p: {
  id: string;
  memberName?: string | null;
  reason: string | null;
}): PushPayload {
  return {
    title: p.memberName ? `رُفضت دفعة ${firstName(p.memberName)}` : "رُفضت الدفعة",
    body: p.reason?.trim() || "راجع اللجنة لمعرفة السبب.",
    url: "/me",
    tag: `member-${p.id}`,
  };
}

/** «محمد» from «محمد ولد أحمد»: short enough for a notification title. */
function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full.trim();
}
