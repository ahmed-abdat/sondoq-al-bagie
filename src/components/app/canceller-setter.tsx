"use client";
import { useEffect } from "react";
import { setCanceller, type Canceller } from "./viewer";

export function CancellerSetter({ v }: { v: Canceller | null }) {
  const by = v?.by;
  const role = v?.role;
  useEffect(() => setCanceller(by && role ? { by, role } : null), [by, role]);
  return null;
}
