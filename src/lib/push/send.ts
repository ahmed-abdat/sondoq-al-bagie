import "server-only";
// Sends committee push notifications with web-push (VAPID). Never throws: a push is a courtesy,
// the payment is already saved. Needs NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT and the Supabase secret key (reads other members' subscriptions); without them
// it does nothing.
import webpush from "web-push";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import type { PushKind } from "@/lib/data/schemas";
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

/** Send one payload to every subscription of `userIds`; cleans up dead ones. Returns counts. */
export async function sendPush(
  userIds: string[],
  payload: PushPayload,
  deps: {
    admin?: Admin | null;
    send?: typeof webpush.sendNotification;
    /** only devices that chose this kind (m29 push_subscriptions.kinds) */
    kind?: PushKind;
  } = {},
): Promise<Record<Outcome, number>> {
  const counts: Record<Outcome, number> = { ok: 0, gone: 0, failed: 0 };
  const keys = vapid();
  const admin = deps.admin === undefined ? tryCreateAdminClient() : deps.admin;
  if (!keys || !admin || !userIds.length) return counts;
  try {
    const base = admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, failures")
      .in("user_id", userIds);
    const { data, error } = await (deps.kind ? base.contains("kinds", [deps.kind]) : base);
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

/** Every active committee account except `exclude` (whoever did it). */
async function committeeIds(admin: Admin, exclude: string | null): Promise<string[]> {
  const { data, error } = await admin.from("committee").select("user_id").eq("active", true);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id).filter((id) => id !== exclude);
}

/**
 * «سجّل X دفعة لـ Y» etc. to the other committee members whose device chose `kind` (owner
 * 2026-09-30: one committee level, no confirmation step). Needs m29 (push_subscriptions.kinds);
 * switch the callers from notifyConfirmers to this when m29 is applied. Never throws.
 */
export async function notifyCommittee(
  kind: PushKind,
  actorId: string | null,
  payload: PushPayload,
) {
  const admin = tryCreateAdminClient();
  if (!admin || !vapid()) return;
  try {
    await sendPush(await committeeIds(admin, actorId), payload, { admin, kind });
  } catch (err) {
    console.error("[push]", err);
  }
}
