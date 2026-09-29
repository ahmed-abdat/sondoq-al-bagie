"use client";
import { useEffect } from "react";
import { setPendingCount } from "./pending-count";

export function PendingCountSetter({ n }: { n: number }) {
  useEffect(() => setPendingCount(n), [n]);
  return null;
}
