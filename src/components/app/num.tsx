"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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

/** Number roll: writes textContent inside rAF (no re-render per frame), 600ms ease-out. */
export function Roll({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [first] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const el = ref.current;
    const from = prev.current;
    prev.current = value;
    if (!el || from === value) return;
    if (prefersReduced()) {
      el.textContent = fmt(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      el.textContent = fmt(Math.round(from + (value - from) * (1 - Math.pow(1 - k, 4))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = fmt(value);
    };
  }, [value]);
  return (
    <Num className={className}>
      <span ref={ref}>{fmt(first)}</span>
    </Num>
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
