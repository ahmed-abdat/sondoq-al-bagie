// Web Push message → notification. Shared by the service worker (src/app/sw.ts) and tests.
// Server sends JSON: { title?, body?, url?, tag?, badgeCount? }. Everything is optional and checked here.

export interface PushPayload {
  title: string;
  body: string;
  /** Same-origin path opened on tap. */
  url: string;
  /** Same tag = replaces the earlier notification (with a new buzz: renotify). */
  tag: string;
  /** Payments now waiting, for the number on the app icon (optional). */
  badgeCount?: number;
}

export const PUSH_ICON = "/icons/icon-192.png";
/** Monochrome (white on transparent): Android draws it in the status bar. */
export const PUSH_BADGE = "/icons/badge-96.png";

const DEFAULT: PushPayload = {
  title: "صندوق الشباب",
  body: "",
  url: "/committee",
  tag: "sondoq",
};

/** Only a path on this site («/committee?x=1»), never another origin or «//evil». */
export function safePath(url: unknown, fallback = DEFAULT.url): string {
  return typeof url === "string" && /^\/(?!\/)/.test(url) && !/[\s\\]/.test(url) ? url : fallback;
}

const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export function parsePushPayload(raw: string | null | undefined): PushPayload {
  let d: Record<string, unknown> = {};
  try {
    const j = raw ? JSON.parse(raw) : {};
    if (j && typeof j === "object") d = j as Record<string, unknown>;
  } catch {
    // plain text push: use it as the body
    return { ...DEFAULT, body: text(raw, 200) ?? "" };
  }
  return {
    title: text(d.title, 80) ?? DEFAULT.title,
    body: text(d.body, 200) ?? DEFAULT.body,
    url: safePath(d.url),
    tag: text(d.tag, 64) ?? DEFAULT.tag,
    ...(Number.isInteger(d.badgeCount) && (d.badgeCount as number) >= 0
      ? { badgeCount: Math.min(d.badgeCount as number, 9999) }
      : {}),
  };
}

export function notificationOptions(p: PushPayload): NotificationOptions & { renotify: boolean } {
  return {
    body: p.body,
    icon: PUSH_ICON,
    badge: PUSH_BADGE,
    tag: p.tag,
    renotify: true,
    dir: "rtl",
    lang: "ar",
    data: { url: p.url },
  };
}
