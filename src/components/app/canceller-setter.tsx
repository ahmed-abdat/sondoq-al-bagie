"use client";
import { useEffect } from "react";
import { setCanceller, type Canceller } from "./viewer";

/** Rendered by the committee layout: who may cancel payments on these pages. */
export function CancellerSetter({ v }: { v: Canceller | null }) {
  const by = v?.by;
  const role = v?.role;
  useEffect(() => setCanceller(by && role ? { by, role } : null), [by, role]);
  return null;
}
