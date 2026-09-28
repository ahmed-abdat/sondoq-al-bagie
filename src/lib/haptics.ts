/**
 * Tiny vibrations for the moments that matter. Android Chrome only; iOS ignores it.
 * Never on scroll or ordinary navigation.
 */
function buzz(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* blocked by the browser (no user gesture yet): ignore */
  }
}

export const haptic = {
  /** Key press, option pick. */
  tap: () => buzz(8),
  /** Payment saved or confirmed. */
  success: () => buzz([10, 60, 18]),
  /** Reject, cancel. */
  warn: () => buzz([24, 40, 24]),
  /** Invalid input. */
  error: () => buzz(120),
};
