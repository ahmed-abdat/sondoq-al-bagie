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
