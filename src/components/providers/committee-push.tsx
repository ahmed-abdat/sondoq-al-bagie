"use client";
// The committee's push toggle wired to Lane A's server actions. Show it only to members who can
// confirm payments (session.canConfirm). Also: forget this phone before signing out, and close
// notifications of payments no longer pending when the committee page loads.
import { useEffect } from "react";
import { deletePushSubscription, savePushSubscription } from "@/lib/data/actions";
import {
  closeStaleNotifications,
  forgetPushOnThisPhone,
  type PushSubscriptionData,
} from "@/lib/push";
import { clearAppBadge } from "@/lib/offline/app-badge";
import { PushToggle } from "./push-toggle";

const save = (s: PushSubscriptionData) =>
  savePushSubscription({ ...s, userAgent: navigator.userAgent.slice(0, 300) });
const remove = (endpoint: string) => deletePushSubscription({ endpoint });

export function CommitteePushToggle({ className }: { className?: string }) {
  return <PushToggle save={save} remove={remove} className={className} />;
}

/** Call before signing out (await it): no more alerts, no number left on the app icon. */
export const forgetCommitteePush = () =>
  Promise.all([forgetPushOnThisPhone(remove), clearAppBadge()]).then(() => undefined);

/** Mount on the committee page with the ids of payments still waiting for confirmation. */
export function CloseStalePushNotifications({ pendingIds }: { pendingIds: string[] }) {
  const key = pendingIds.join(",");
  useEffect(() => {
    void closeStaleNotifications(key ? key.split(",") : []);
  }, [key]);
  return null;
}
