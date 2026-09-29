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

/** To the member who sent the payment through their link: «تم تأكيد دفعتك» → the receipt. */
export function memberConfirmedPayload(p: {
  id: string;
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
    title: "تم تأكيد دفعتك",
    body: parts.join(" · "),
    url: p.receiptCode ? `/r/${p.receiptCode}` : "/me",
    tag: `member-${p.id}`,
  };
}

/** To the member: «رُفضت الدفعة» with the committee's reason. */
export function memberRejectedPayload(p: { id: string; reason: string | null }): PushPayload {
  return {
    title: "رُفضت الدفعة",
    body: p.reason?.trim() || "راجع اللجنة لمعرفة السبب.",
    url: "/me",
    tag: `member-${p.id}`,
  };
}
