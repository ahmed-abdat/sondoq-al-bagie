"use client";
// Who may cancel payments here: seeded by the committee layout (CancellerSetter) from the session.
import { useSyncExternalStore } from "react";

export type Canceller = { by: string; role: string };

let who: Canceller | null | undefined;
const subs = new Set<() => void>();

export function setCanceller(v: Canceller | null) {
  if (who !== undefined && JSON.stringify(who) === JSON.stringify(v)) return;
  who = v;
  subs.forEach((cb) => cb());
}

export function useCanceller(): Canceller | null {
  const v = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => who,
    () => undefined,
  );
  return v ?? null;
}
