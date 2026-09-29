"use client";
import { useEffect } from "react";
import { useIsDemo } from "./act";
import { DEMO_COMMITTEE_COOKIE } from "./demo";
import { setCanceller, setCommitteeViewer, type Canceller } from "./viewer";

export function CancellerSetter({ v }: { v: Canceller | null }) {
  const by = v?.by;
  const role = v?.role;
  useEffect(() => setCanceller(by && role ? { by, role } : null), [by, role]);
  // rendered only for a committee session (committee layout): any role may share the report
  useEffect(() => setCommitteeViewer(true), []);
  // demo: the committee has no real session; this cookie lets public pages show it the money
  const demo = useIsDemo();
  useEffect(() => {
    if (demo) document.cookie = `${DEMO_COMMITTEE_COOKIE}=1; path=/; SameSite=Lax`;
  }, [demo]);
  return null;
}
