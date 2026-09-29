"use client";
import { useEffect } from "react";
import { setCanceller, setCommitteeViewer, type Canceller } from "./viewer";

export function CancellerSetter({ v }: { v: Canceller | null }) {
  const by = v?.by;
  const role = v?.role;
  useEffect(() => setCanceller(by && role ? { by, role } : null), [by, role]);
  // rendered only for a committee session (committee layout): any role may share the report
  useEffect(() => setCommitteeViewer(true), []);
  return null;
}
