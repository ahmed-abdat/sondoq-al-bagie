"use client";
// Is the viewer a committee member who may cancel payments? Seeded by the committee layout, or
// asked once from the server when a Supabase session cookie exists. Public visitors never ask.
import { useEffect, useSyncExternalStore } from "react";
import { whoCanCancel } from "./viewer-action";

export type Canceller = { by: string; role: string };

let who: Canceller | null | undefined;
let asking = false;
const subs = new Set<() => void>();

export function setCanceller(v: Canceller | null) {
  if (who !== undefined && JSON.stringify(who) === JSON.stringify(v)) return;
  who = v;
  subs.forEach((cb) => cb());
}

const signedIn = () => /(?:^|;\s*)sb-[^=]*-auth-token/.test(document.cookie);

export function useCanceller(): Canceller | null {
  const v = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => who,
    () => undefined,
  );
  useEffect(() => {
    if (who !== undefined || asking || !signedIn()) return;
    asking = true;
    whoCanCancel()
      .then(setCanceller, () => {})
      .finally(() => (asking = false));
  }, []);
  return v ?? null;
}
