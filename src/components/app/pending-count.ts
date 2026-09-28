"use client";
// One source for the «بانتظار التأكيد» count: the committee hub publishes what it shows, the nav
// badge reads it (falling back to the server's count before the hub has mounted).
import { useSyncExternalStore } from "react";

let count: number | null = null;
const subs = new Set<() => void>();

export function setPendingCount(n: number) {
  if (count === n) return;
  count = n;
  subs.forEach((cb) => cb());
}

export function usePendingCount(fallback: number | undefined): number | undefined {
  const live = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => count,
    () => null,
  );
  return live ?? fallback;
}
