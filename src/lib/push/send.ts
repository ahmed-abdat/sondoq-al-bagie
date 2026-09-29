import "server-only";
// Sends committee push notifications with web-push (VAPID). Never throws: a push is a courtesy,
// the payment is already saved. Needs NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT and the Supabase secret key (reads other members' subscriptions); without them
// it does nothing.
import webpush from "web-push";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import type { PushPayload } from "./payload";

type Admin = NonNullable<ReturnType<typeof tryCreateAdminClient>>;
type Sub = { id: string; endpoint: string; p256dh: string; auth: string; failures: number };

/** After this many failures in a row (not 404/410) a subscription is dropped. */
export const MAX_FAILURES = 5;

export type Outcome = "ok" | "gone" | "failed";

/** 404/410 = the browser unsubscribed: delete. Anything else counts as a failure. */
export function outcomeOf(err: unknown): Outcome {
  const status = (err as { statusCode?: number } | null)?.statusCode;
  return status === 404 || status === 410 ? "gone" : "failed";
}

function vapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

/** Active admin/treasurer/deputy accounts, except `exclude` (who recorded the payment). */
async function confirmerIds(admin: Admin, exclude: string | null): Promise<string[]> {
  const { data, error } = await admin
    .from("committee")
    .select("user_id")
    .eq("active", true)
    .in("role", ["admin", "treasurer", "deputy"]);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id).filter((id) => id !== exclude);
}

/** Send one payload to every subscription of `userIds`; cleans up dead ones. Returns counts. */
export async function sendPush(
  userIds: string[],
  payload: PushPayload,
  deps: { admin?: Admin | null; send?: typeof webpush.sendNotification } = {},
): Promise<Record<Outcome, number>> {
  const counts: Record<Outcome, number> = { ok: 0, gone: 0, failed: 0 };
  const keys = vapid();
  const admin = deps.admin === undefined ? tryCreateAdminClient() : deps.admin;
  if (!keys || !admin || !userIds.length) return counts;
  try {
    const { data, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, failures")
      .in("user_id", userIds);
    if (error) throw error;
    const send = deps.send ?? webpush.sendNotification;
    const body = JSON.stringify(payload);
    await Promise.all(
      ((data ?? []) as Sub[]).map(async (s) => {
        let outcome: Outcome = "ok";
        try {
          await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            vapidDetails: keys,
            TTL: 60 * 60 * 24,
            urgency: "high",
            topic: payload.tag.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, ""),
          });
        } catch (err) {
          outcome = outcomeOf(err);
        }
        counts[outcome]++;
        if (outcome === "ok") {
          await admin
            .from("push_subscriptions")
            .update({ last_ok_at: new Date().toISOString(), failures: 0 })
            .eq("id", s.id);
        } else if (outcome === "gone" || s.failures + 1 >= MAX_FAILURES) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          await admin
            .from("push_subscriptions")
            .update({ failures: s.failures + 1 })
            .eq("id", s.id);
        }
      }),
    );
  } catch (err) {
    console.error("[push]", err);
  }
  return counts;
}

/** How many payments are waiting for confirmation, or undefined if it cannot be read. */
async function pendingCount(admin: Admin): Promise<number | undefined> {
  const { count, error } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return error || count === null ? undefined : count;
}

/**
 * «دفعة بانتظار التأكيد» to every confirmer except the recorder, with the current number of
 * pending payments as `badgeCount`. Never throws.
 */
export async function notifyConfirmers(recorderId: string | null, payload: PushPayload) {
  const admin = tryCreateAdminClient();
  if (!admin || !vapid()) return;
  try {
    const [ids, badgeCount] = await Promise.all([
      confirmerIds(admin, recorderId),
      pendingCount(admin).catch(() => undefined),
    ]);
    await sendPush(ids, badgeCount === undefined ? payload : { ...payload, badgeCount }, { admin });
  } catch (err) {
    console.error("[push]", err);
  }
}
