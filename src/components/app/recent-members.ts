"use client";
// «آخر من بحثت عنهم»: the last 5 members opened on this phone (member refs only).
import { useMemo, useSyncExternalStore } from "react";
import { safeStorage } from "@/lib/safe-storage";

const KEY = "bq-recent-members";
const MAX = 5;
const subs = new Set<() => void>();
const NONE: string[] = [];
let cache: string[] | null = null;

function read(): string[] {
  try {
    const v = JSON.parse(safeStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberMember(ref: string) {
  const next = [ref, ...read().filter((r) => r !== ref)].slice(0, MAX);
  safeStorage.setItem(KEY, JSON.stringify(next));
  cache = next;
  subs.forEach((f) => f());
}

/** The remembered members that still exist in `list`, most recent first. */
export function useRecentMembers<T extends { memberRef: string }>(list: T[]): T[] {
  const refs = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    () => (cache ??= read()),
    () => NONE,
  );
  return useMemo(
    () => refs.map((r) => list.find((m) => m.memberRef === r)).filter((m): m is T => !!m),
    [refs, list],
  );
}
