// Pull-to-refresh maths and gating. Pure, unit tested; used by components/providers/pull-to-refresh.

/** Pulled distance (px, after resistance) needed to trigger a refresh. */
export const PULL_THRESHOLD = 70;
/** The indicator never travels further than this. */
export const PULL_MAX = 140;

/**
 * Rubber-band resistance: follows the finger at first, then slows down and never passes PULL_MAX.
 * `raw` = finger travel in px (negative = pushing up → 0).
 */
export function pullDistance(raw: number, max = PULL_MAX): number {
  if (raw <= 0) return 0;
  // Slope 1 at the start (follows the finger), half-way to max at raw = max.
  return max * (1 - 1 / (raw / max + 1));
}

/** 0 → 1 as the pull approaches the threshold. */
export function pullProgress(distance: number, threshold = PULL_THRESHOLD): number {
  return Math.max(0, Math.min(1, distance / threshold));
}

/** Overlays that own their own gestures: never start a pull while one is open. */
const BLOCKING_OVERLAYS = '[role="dialog"], [aria-modal="true"]';

/** Elements where a downward drag means something else (typing, selecting). */
const BLOCKING_TARGETS = 'input, textarea, select, [contenteditable="true"], [data-no-pull]';

type Style = Pick<CSSStyleDeclaration, "overflowX">;

/** Inside a horizontally scrolling strip (filter chips, month tabs)? */
export function inHorizontalScroller(
  el: Element | null,
  getStyle: (el: Element) => Style = (e) => getComputedStyle(e),
): boolean {
  for (let n = el; n && n !== n.ownerDocument?.documentElement; n = n.parentElement) {
    const ox = getStyle(n).overflowX;
    if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth) return true;
  }
  return false;
}

export interface PullGate {
  standalone: boolean;
  scrollY: number;
  target: Element | null;
  /** Document to look for open overlays in. */
  doc: Pick<Document, "querySelector">;
  getStyle?: (el: Element) => Style;
}

/** May a pull gesture start from this touch? */
export function canStartPull(g: PullGate): boolean {
  if (!g.standalone || g.scrollY > 0) return false;
  if (g.doc.querySelector(BLOCKING_OVERLAYS)) return false;
  if (!g.target) return true;
  if (g.target.closest(BLOCKING_OVERLAYS) || g.target.closest(BLOCKING_TARGETS)) return false;
  return !inHorizontalScroller(g.target, g.getStyle);
}

/**
 * After the first few px of movement: is this a vertical pull (not a sideways swipe)?
 * Returns null while undecided.
 */
export function isVerticalPull(dx: number, dy: number, slop = 8): boolean | null {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return null;
  return dy > 0 && dy > Math.abs(dx);
}

export const OFFLINE_PULL_MESSAGE = "لا يوجد اتصال. لم تُحدَّث البيانات.";
/** Keep the spinner at least this long so a fast refresh does not flash. */
export const MIN_REFRESH_MS = 400;
