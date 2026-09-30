"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { fmt } from "./derive";

export const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Figures: Alexandria, tabular, LTR-isolated. Parentheses go INSIDE so they never split. */
export function Num({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={`bq-num ${className}`}>
      {children}
    </bdi>
  );
}

const noSub = () => () => {};
/**
 * "Now" for relative times («منذ 12 دقيقة»): null during the server render and hydration (so the
 * HTML matches), then the phone's clock. Callers show a fixed date until it is known.
 */
export function useNow(): Date | null {
  return useSyncExternalStore(
    noSub,
    () => nowSnapshot(),
    () => null,
  );
}
let snap: Date | null = null;
let snapAt = 0;
function nowSnapshot() {
  const t = Date.now();
  // one stable object per minute so React does not loop
  if (!snap || t - snapAt > 60_000) {
    snap = new Date(t);
    snapAt = t;
  }
  return snap;
}

/** A money figure (committee pages always have it); «—» when missing. `sign` like «+» / «−». */
export function Amount({
  v,
  sign = "",
  className = "",
}: {
  v: number | null | undefined;
  sign?: string;
  className?: string;
  dots?: string;
}) {
  if (v === null || v === undefined) return <span className={className}>—</span>;
  return <Num className={className}>{`${sign}${fmt(v)}`}</Num>;
}
