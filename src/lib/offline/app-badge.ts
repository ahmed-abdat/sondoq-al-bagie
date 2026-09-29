// The number on the app icon (Badging API): payments «بانتظار التأكيد», for confirmers only.
// Works in the page and in the service worker. Feature-detected: a no-op where unsupported
// (iPhone needs the installed app + notification permission; Android launchers show a dot).

export interface BadgeNavigator {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

export const badgeSupported = (nav: BadgeNavigator | undefined): boolean =>
  typeof nav?.setAppBadge === "function";

/** Shows `count` on the app icon; 0 clears it. Never throws. */
export async function syncAppBadge(count: number, nav?: BadgeNavigator): Promise<void> {
  const n = Math.max(0, Math.floor(count)) || 0;
  const target = nav ?? (typeof navigator === "undefined" ? undefined : navigator);
  if (!badgeSupported(target)) return;
  try {
    if (n > 0) await target!.setAppBadge!(n);
    else if (target!.clearAppBadge) await target!.clearAppBadge();
    else await target!.setAppBadge!(0);
  } catch {
    /* not allowed right now (e.g. iPhone without notification permission) */
  }
}

/** Sign-out, or a member who cannot confirm payments. */
export const clearAppBadge = (nav?: BadgeNavigator) => syncAppBadge(0, nav);

/**
 * The count after a push: the server's `badgeCount` (pending payments, including the new one);
 * without it (the server could not read it), keep the current badge (null).
 */
export function nextBadgeCount(p: { badgeCount?: number | null }): number | null {
  return typeof p.badgeCount === "number" && p.badgeCount >= 0 ? p.badgeCount : null;
}
