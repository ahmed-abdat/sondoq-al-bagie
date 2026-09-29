"use client";
// The member's side of the personal link on this phone: notifications when a payment they sent
// is confirmed («تم تأكيد دفعتك», opens the receipt) or rejected («رُفضت الدفعة», opens /me), and
// forgetting this device at «خروج من هذا الجهاز».
import { useIsDemo } from "@/components/app/act";
import { memberDeletePush, memberSavePush } from "@/lib/data/member-actions";
import { unsubscribePush, type PushSubscriptionData } from "@/lib/push";
import { PushToggle } from "./push-toggle";

const save = (s: PushSubscriptionData) =>
  memberSavePush({ ...s, userAgent: navigator.userAgent.slice(0, 300) });
const remove = (endpoint: string) => memberDeletePush({ endpoint });

/** «إشعارات دفعاتي» on /me. In the demo: a plain note (nothing is sent there). */
export function MemberPushToggle({ className = "bq-small-top" }: { className?: string }) {
  const demo = useIsDemo();
  if (demo) return <p className="bq-hint">لا تعمل الإشعارات في النسخة التجريبية.</p>;
  return <PushToggle kind="member" save={save} remove={remove} className={className} />;
}

/**
 * When the LAST member profile leaves this phone (removeProfile(...).last), before memberSignOut:
 * this device stops the member notifications (the committee's, if any, stay) and drops saved
 * copies of personalised pages. Returns this device's push endpoint for memberSignOut({ endpoint }).
 * Removing one of several profiles: do not call it (the others keep their notifications).
 */
export async function forgetMemberOnThisDevice(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  let endpoint: string | undefined;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    endpoint = (await reg?.pushManager?.getSubscription())?.endpoint;
    // the server row is removed by memberSignOut({ endpoint }); here only the browser side
    await unsubscribePush(async () => ({ ok: true }), "member");
  } catch {
    /* no worker or no push: nothing to stop */
  }
  try {
    await caches.delete("pages"); // pages saved while «أنت» was shown
  } catch {
    /* no Cache Storage */
  }
  return endpoint;
}
