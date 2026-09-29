// Web Push on this phone (committee notifications). Browser-only helpers; the subscription is
// stored by the caller (Lane A's savePushSubscription), so this file never talks to the server.
import { detectPlatform } from "./offline/install";

export type PushState =
  | "unsupported" // no service worker / PushManager / Notification (old browser, dev mode)
  | "install-first" // iPhone: web push only works in the installed app
  | "denied" // blocked in the browser settings
  | "off"
  | "on";

/** What the server stores. */
export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const vapidKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** base64url VAPID key → bytes, as pushManager.subscribe wants. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!vapidKey()
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** The registered worker, or null (dev mode, not registered yet within 3 s). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 3000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  const ios = detectPlatform(navigator.userAgent, navigator.maxTouchPoints) === "ios";
  if (ios && !isStandalone()) return "install-first";
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  if (!reg) return "unsupported";
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function toData(sub: PushSubscription): PushSubscriptionData {
  const j = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" },
  };
}

/**
 * Turn notifications on. Call ONLY from a tap: it asks the browser's permission first (before any
 * other await, so the tap still counts), then subscribes and hands the subscription to `save`.
 */
export async function subscribePush(
  save: (s: PushSubscriptionData) => Promise<{ ok: boolean }>,
): Promise<PushState | "error"> {
  if (!isPushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";
  try {
    const reg = await registration();
    if (!reg) return "unsupported";
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey()),
      }));
    const res = await save(toData(sub));
    if (!res.ok) {
      await sub.unsubscribe().catch(() => {});
      return "error";
    }
    return "on";
  } catch {
    return "error";
  }
}

/** Turn notifications off on this phone; `remove` drops it on the server. */
export async function unsubscribePush(
  remove: (endpoint: string) => Promise<{ ok: boolean }>,
): Promise<PushState | "error"> {
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await remove(sub.endpoint).catch(() => ({ ok: false }));
      await sub.unsubscribe();
    }
    return "off";
  } catch {
    return "error";
  }
}

/**
 * Before signing out: stop this phone's notifications (server first, then the browser), so a
 * shared phone does not keep receiving the committee's alerts.
 */
export async function forgetPushOnThisPhone(
  remove: (endpoint: string) => Promise<{ ok: boolean }>,
): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  await unsubscribePush(remove).catch(() => {});
}

/**
 * Close «pending-<paymentId>» notifications whose payment is no longer waiting (call when the
 * committee page loads, with the ids still pending). A push cannot close them silently.
 */
export async function closeStaleNotifications(stillPending: string[]): Promise<number> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return 0;
  const reg = await registration();
  if (!reg?.getNotifications) return 0;
  const keep = new Set(stillPending.map((id) => `pending-${id}`));
  let closed = 0;
  for (const n of await reg.getNotifications()) {
    if (n.tag.startsWith("pending-") && !keep.has(n.tag)) {
      n.close();
      closed++;
    }
  }
  return closed;
}
