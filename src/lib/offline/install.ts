// Pure helpers for the "install the app" prompt. Unit tested.

export type InstallPlatform = "android" | "ios" | "other";

/** iOS (iPhone/iPad, incl. iPadOS that reports as Mac with touch) has no install prompt API. */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

/** iOS can only "Add to Home Screen" from Safari itself (not from WhatsApp/Chrome in-app views). */
export function isIosSafari(userAgent: string): boolean {
  return (
    /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|WhatsApp/i.test(userAgent)
  );
}

export const DISMISS_KEY = "sondoq:install-dismissed-at";
/** After «ليس الآن», ask again only after two weeks. */
export const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;

export function isDismissed(dismissedAt: string | null, now: number = Date.now()): boolean {
  const t = Number(dismissedAt);
  return Number.isFinite(t) && t > 0 && now - t < DISMISS_FOR_MS;
}
