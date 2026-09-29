"use client";
// The committee's push toggle wired to Lane A's server actions. Show it only to members who can
// confirm payments (session.canConfirm). Also: forget this phone before signing out, and close
// notifications of payments no longer pending when the committee page loads.
import { useEffect } from "react";
import { useAct } from "@/components/app/act";
import {
  closeStaleNotifications,
  forgetPushOnThisPhone,
  type PushSubscriptionData,
} from "@/lib/push";
import { clearAppBadge } from "@/lib/offline/app-badge";
import { PAGES_CACHE } from "@/lib/offline/cache-rules";
import { PushToggle } from "./push-toggle";

type Acts = ReturnType<typeof useAct>;
// server actions come through the demo seam (useAct), never imported directly
const saver = (a: Acts) => (s: PushSubscriptionData) =>
  a.savePushSubscription({ ...s, userAgent: navigator.userAgent.slice(0, 300) });
const remover = (a: Acts) => (endpoint: string) => a.deletePushSubscription({ endpoint });

export function CommitteePushToggle({ className }: { className?: string }) {
  const a = useAct();
  return <PushToggle save={saver(a)} remove={remover(a)} className={className} />;
}

/**
 * Call before signing out (await it): no more alerts, no number left on the app icon, and no
 * saved page copies that were shown while signed in (money privacy).
 */
export const forgetCommitteePush = (a: Acts) =>
  Promise.all([
    forgetPushOnThisPhone(remover(a)),
    clearAppBadge(),
    typeof caches === "undefined" ? false : caches.delete(PAGES_CACHE).catch(() => false),
  ]).then(() => undefined);

/** Mount on the committee page with the ids of payments still waiting for confirmation. */
export function CloseStalePushNotifications({ pendingIds }: { pendingIds: string[] }) {
  const key = pendingIds.join(",");
  useEffect(() => {
    void closeStaleNotifications(key ? key.split(",") : []);
  }, [key]);
  return null;
}
