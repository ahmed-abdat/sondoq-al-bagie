"use client";

import { useQueryClient } from "@tanstack/react-query";
import { WifiOffIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { PUBLIC_KEY } from "@/lib/offline/persister";
import { OFFLINE_WRITE_HINT, offlineMessage } from "@/lib/offline/relative-time";
import { useOnline } from "./online";

function useLastUpdated(): number | null {
  const cache = useQueryClient().getQueryCache();
  const read = () => {
    const times = cache
      .findAll({ queryKey: [PUBLIC_KEY] })
      .map((q) => q.state.dataUpdatedAt)
      .filter(Boolean);
    return times.length ? Math.max(...times) : null;
  };
  return useSyncExternalStore(
    (cb) => cache.subscribe(cb),
    read,
    () => null,
  );
}

/** Current time rounded to the minute, ticking while `active`, so "قبل 5 دقائق" stays true. */
function useMinute(active: boolean): number {
  return useSyncExternalStore(
    (cb) => {
      if (!active) return () => {};
      const id = setInterval(cb, 15_000);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => 0,
  );
}

/** Thin bar at the top while offline: «غير متصل. آخر تحديث قبل …». */
export function OfflineBanner() {
  const online = useOnline();
  const last = useLastUpdated();
  const now = useMinute(!online);
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-warn-soft text-warn border-line sticky top-0 z-50 flex items-center justify-center gap-2 border-b px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm font-medium"
    >
      <WifiOffIcon aria-hidden className="size-4 shrink-0" />
      <span>{offlineMessage(last, now)}</span>
    </div>
  );
}

/** Short explanation under a disabled save button when offline. Renders nothing online. */
export function OfflineWriteHint({ className = "" }: { className?: string }) {
  const online = useOnline();
  if (online) return null;
  return <p className={`text-muted text-sm ${className}`}>{OFFLINE_WRITE_HINT}</p>;
}
