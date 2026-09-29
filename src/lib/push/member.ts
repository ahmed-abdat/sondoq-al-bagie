import "server-only";
// Member push (personal link): after the committee confirms or rejects a payment that a member
// sent through their link, tell every device of that link. Never throws: a push is a courtesy.
import webpush from "web-push";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { memberConfirmedPayload, memberRejectedPayload, type PushPayload } from "./payload";
import { MAX_FAILURES, outcomeOf, type Outcome } from "./send";

type Admin = NonNullable<ReturnType<typeof tryCreateAdminClient>>;
type Sub = { id: string; endpoint: string; p256dh: string; auth: string; failures: number };

function vapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

/** Full name of the member a link belongs to (null when unknown). */
async function linkMemberName(admin: Admin, linkId: string): Promise<string | null> {
  const { data: link } = await admin
    .from("member_links")
    .select("member_id")
    .eq("id", linkId)
    .maybeSingle();
  if (!link?.member_id) return null;
  const { data: m } = await admin
    .from("members")
    .select("full_name")
    .eq("id", link.member_id)
    .maybeSingle();
  return m?.full_name ?? null;
}

/** The member payload for a decided payment, or null when no member link sent it. */
export async function memberPayloadFor(
  admin: Admin,
  paymentId: string,
): Promise<{ linkId: string; payload: PushPayload } | null> {
  const { data: p, error } = await admin
    .from("payments")
    .select("id, status, amount, receipt_code, reject_reason, submitted_via_link")
    .eq("id", paymentId)
    .maybeSingle();
  if (error || !p?.submitted_via_link) return null;
  if (p.status !== "rejected" && p.status !== "confirmed") return null;
  const memberName = await linkMemberName(admin, p.submitted_via_link);
  if (p.status === "rejected") {
    return {
      linkId: p.submitted_via_link,
      payload: memberRejectedPayload({ id: p.id, memberName, reason: p.reject_reason }),
    };
  }
  const { data: allocs } = await admin
    .from("payment_allocations")
    .select("kind, year, month")
    .eq("payment_id", p.id);
  const allocations = (allocs ?? []).map((a) =>
    a.kind === "months"
      ? { kind: "months" as const, year: a.year ?? 0, month: a.month ?? 0 }
      : { kind: a.kind === "campaign" ? ("campaign" as const) : ("credit" as const) },
  );
  return {
    linkId: p.submitted_via_link,
    payload: memberConfirmedPayload({
      id: p.id,
      memberName,
      amount: p.amount,
      receiptCode: p.receipt_code,
      allocations,
    }),
  };
}

/** Push the decision to the devices of the member link that sent `paymentId` (if any). */
export async function notifyMember(
  paymentId: string,
  deps: { admin?: Admin | null; send?: typeof webpush.sendNotification } = {},
): Promise<Record<Outcome, number>> {
  const counts: Record<Outcome, number> = { ok: 0, gone: 0, failed: 0 };
  const keys = vapid();
  const admin = deps.admin === undefined ? tryCreateAdminClient() : deps.admin;
  if (!keys || !admin) return counts;
  try {
    const target = await memberPayloadFor(admin, paymentId);
    if (!target) return counts;
    const { data: link } = await admin
      .from("member_links")
      .select("revoked_at")
      .eq("id", target.linkId)
      .maybeSingle();
    if (!link || link.revoked_at) return counts; // a revoked link gets nothing
    const { data } = await admin
      .from("member_push_subscriptions")
      .select("id, endpoint, p256dh, auth, failures")
      .eq("link_id", target.linkId);
    const send = deps.send ?? webpush.sendNotification;
    const body = JSON.stringify(target.payload);
    await Promise.all(
      ((data ?? []) as Sub[]).map(async (s) => {
        let outcome: Outcome = "ok";
        try {
          await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            vapidDetails: keys,
            TTL: 60 * 60 * 24 * 3,
            urgency: "normal",
            topic: target.payload.tag.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, ""),
          });
        } catch (err) {
          outcome = outcomeOf(err);
        }
        counts[outcome]++;
        if (outcome === "ok") {
          if (s.failures)
            await admin.from("member_push_subscriptions").update({ failures: 0 }).eq("id", s.id);
        } else if (outcome === "gone" || s.failures + 1 >= MAX_FAILURES) {
          await admin.from("member_push_subscriptions").delete().eq("id", s.id);
        } else {
          await admin
            .from("member_push_subscriptions")
            .update({ failures: s.failures + 1 })
            .eq("id", s.id);
        }
      }),
    );
  } catch (err) {
    console.error("[push member]", err);
  }
  return counts;
}
