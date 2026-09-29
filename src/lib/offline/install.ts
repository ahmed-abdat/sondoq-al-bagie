// Pure helpers for the "install the app" flow. Unit tested.

export type InstallPlatform = "android" | "ios" | "other";

/** iOS (iPhone/iPad, incl. iPadOS that reports as Mac with touch) has no install prompt API. */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

/** Browsers built into other apps (Facebook, Instagram, WhatsApp, TikTok, Android WebView…). */
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|TikTok|musical_ly|; wv\)/i;

function isInAppBrowser(userAgent: string): boolean {
  return IN_APP.test(userAgent);
}

/** iOS can only "Add to Home Screen" from Safari itself (not from WhatsApp/Chrome in-app views). */
export function isIosSafari(userAgent: string): boolean {
  return (
    /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|WhatsApp/i.test(userAgent)
  );
}

/**
 * Chromium browsers (Chrome, Edge, Opera) give their own install dialog once the site passes
 * their checks (for Chrome: a tap and about 30 s on the site, maybe on an earlier visit). Until
 * then the invite waits for it rather than showing menu steps.
 */
export function offersInstallDialog(userAgent: string): boolean {
  return (
    /Chrome\/|Chromium\//.test(userAgent) &&
    !/SamsungBrowser|Firefox|FxiOS|CriOS|EdgiOS/.test(userAgent) &&
    !isInAppBrowser(userAgent)
  );
}

function isSamsungInternet(userAgent: string): boolean {
  return /SamsungBrowser/i.test(userAgent);
}

/**
 * How this phone can install the app:
 * - installed: already running as the app, or known to be installed;
 * - native: the browser gave us its install dialog (Chrome, Edge, Samsung on Android; desktop);
 * - android / samsung / desktop: no dialog yet (engagement rules, dismissed before): menu steps;
 * - in-app: inside Facebook/Instagram/WhatsApp's own browser: open the link in Chrome / Safari;
 * - ios: Safari's Share → «إضافة إلى الشاشة الرئيسية»; ios-other: open in Safari first.
 */
export type InstallMode =
  "installed" | "native" | "android" | "samsung" | "desktop" | "in-app" | "ios" | "ios-other";

export function installMode(o: {
  userAgent: string;
  maxTouchPoints?: number;
  standalone: boolean;
  installed?: boolean;
  hasPrompt: boolean;
}): InstallMode {
  if (o.standalone || o.installed) return "installed";
  const ua = o.userAgent;
  const platform = detectPlatform(ua, o.maxTouchPoints);
  if (isInAppBrowser(ua)) return "in-app";
  if (platform === "ios") return isIosSafari(ua) ? "ios" : "ios-other";
  if (o.hasPrompt) return "native";
  if (platform === "android") return isSamsungInternet(ua) ? "samsung" : "android";
  return "desktop";
}

/** Chrome's own "open this link in Chrome" URL, for Android in-app browsers. */
export function chromeIntentUrl(href: string): string {
  const u = new URL(href);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}

/* ───────────── when to invite ───────────── */

const DAY = 24 * 60 * 60 * 1000;

/** Old single «ليس الآن» timestamp (two weeks), still honoured. */
export const DISMISS_KEY = "sondoq:install-dismissed-at";
export const DISMISS_FOR_MS = 14 * DAY;

export function isDismissed(dismissedAt: string | null, now: number = Date.now()): boolean {
  const t = Number(dismissedAt);
  return Number.isFinite(t) && t > 0 && now - t < DISMISS_FOR_MS;
}

/** After each «✕»/«ليس الآن»: wait 1, then 3, 7, 14, then 30 days (capped). */
export const BACKOFF_KEY = "sondoq:install-backoff";
const BACKOFF_DAYS = [1, 3, 7, 14, 30] as const;

/** Stored as "count,nextAt" (ms). Anything unreadable counts as never dismissed. */
export function parseBackoff(stored: string | null): { count: number; nextAt: number } {
  const [c, n] = (stored ?? "").split(",").map(Number);
  return Number.isInteger(c) && c > 0 && Number.isFinite(n)
    ? { count: c, nextAt: n }
    : { count: 0, nextAt: 0 };
}

/** The stored value after one more dismissal at `now`. */
export function snooze(stored: string | null, now: number = Date.now()): string {
  const count = parseBackoff(stored).count + 1;
  const days = BACKOFF_DAYS[Math.min(count, BACKOFF_DAYS.length) - 1];
  return `${count},${now + days * DAY}`;
}

export function isSnoozed(stored: string | null, now: number = Date.now()): boolean {
  return now < parseBackoff(stored).nextAt;
}

export const VISITS_KEY = "sondoq:visit-days";
export const SESSIONS_KEY = "sondoq:sessions";
export const ENGAGED_KEY = "sondoq:engaged";

/** Adds today (YYYY-MM-DD) to the stored list of visit days; keeps the last 5. */
export function recordVisitDay(stored: string | null, today: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const days = (stored ?? "").split(",").filter((d) => day.test(d));
  if (day.test(today) && !days.includes(today)) days.push(today);
  return days.slice(-5).join(",");
}

/**
 * Invite to install only when it means something: from the second visit (another session or
 * another day), or right after a meaningful action; never on the very first page; not while
 * snoozed.
 */
export function shouldInvite(o: {
  visitDays: string | null;
  sessions?: number;
  engaged: boolean;
  backoff?: string | null;
  dismissedAt?: string | null;
  now?: number;
}): boolean {
  if (isSnoozed(o.backoff ?? null, o.now) || isDismissed(o.dismissedAt ?? null, o.now))
    return false;
  const days = (o.visitDays ?? "").split(",").filter(Boolean).length;
  return o.engaged || days >= 2 || (o.sessions ?? 0) >= 2;
}

/**
 * Paths where the banner never shows: someone checking a receipt, signing in, and the report
 * (a page to read, print and share, with its own tools at the bottom).
 */
export function bannerAllowedOn(pathname: string): boolean {
  return !/^\/(r|login|report)(\/|$)/.test(pathname);
}
