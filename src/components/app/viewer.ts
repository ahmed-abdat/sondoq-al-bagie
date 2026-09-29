"use client";
// Is the viewer a committee member who may cancel payments? Seeded by the committee layout, or
// asked once from the server when a Supabase session cookie exists. Public visitors never ask.
import { useEffect, useSyncExternalStore } from "react";
import { isCommitteeViewer, whoCanCancel } from "./viewer-action";

export type Canceller = { by: string; role: string };

let who: Canceller | null | undefined;
let asking = false;
const subs = new Set<() => void>();

export function setCanceller(v: Canceller | null) {
  if (who !== undefined && JSON.stringify(who) === JSON.stringify(v)) return;
  who = v;
  subs.forEach((cb) => cb());
}

// a Supabase session, or the demo committee (demo mode has no real session)
const signedIn = () =>
  /(?:^|;\s*)(?:sb-[^=]*-auth-token|bq_demo_committee=1)/.test(document.cookie);

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

/* Any signed-in committee member (every role): «مشاركة التقرير» is theirs only (owner rule). */
let committee: boolean | undefined;
let askingCommittee = false;
const csubs = new Set<() => void>();

export function setCommitteeViewer(v: boolean) {
  if (committee === v) return;
  committee = v;
  csubs.forEach((cb) => cb());
}

/** false until known (visitors never see a flash of committee-only controls). */
export function useCommitteeViewer(): boolean {
  const v = useSyncExternalStore(
    (cb) => {
      csubs.add(cb);
      return () => csubs.delete(cb);
    },
    () => committee,
    () => undefined,
  );
  useEffect(() => {
    if (committee !== undefined || askingCommittee || !signedIn()) return;
    askingCommittee = true;
    isCommitteeViewer()
      .then(setCommitteeViewer, () => {})
      .finally(() => (askingCommittee = false));
  }, []);
  return v === true;
}
