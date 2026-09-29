"use client";

import { useQueryClient } from "@tanstack/react-query";
import { HistoryIcon, WifiOffIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { PUBLIC_KEY } from "@/lib/offline/persister";
import { OFFLINE_WRITE_HINT, offlineMessage } from "@/lib/offline/relative-time";
import { savedCopyMessage, SERVED_QUERY } from "@/lib/offline/served-from-cache";
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

let firstAsk = true;

/**
 * Asks the service worker whether the page on screen came from its saved copy (offline, or the
 * network was too slow); returns that copy's date (ms), else null.
 */
function useSavedCopyDate(): number | null {
  const pathname = usePathname();
  const [answer, setAnswer] = useState<{ path: string; at: number | null }>({
    path: "",
    at: null,
  });
  useEffect(() => {
    const worker = navigator.serviceWorker?.controller;
    if (!worker) return;
    // the page load itself, or an in-app navigation (network timeout 6 s)
    const since = firstAsk ? performance.timeOrigin : Date.now() - 8_000;
    firstAsk = false;
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) =>
      setAnswer({ path: pathname, at: typeof e.data === "number" ? e.data : null });
    worker.postMessage({ type: SERVED_QUERY, path: pathname, since }, [channel.port2]);
    return () => channel.port1.close();
  }, [pathname]);
  return answer.path === pathname ? answer.at : null;
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

const BAR =
  "bg-warn-soft text-warn border-line sticky top-0 z-50 flex items-center justify-center gap-2 border-b px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm font-medium";

/**
 * Thin bar at the top when what is on screen may be old: offline («غير متصل. آخر تحديث قبل …»),
 * or online but the page came from the saved copy because the network was too slow
 * («هذه نسخة محفوظة قبل …» + «تحديث»).
 */
export function OfflineBanner() {
  const online = useOnline();
  const last = useLastUpdated();
  const saved = useSavedCopyDate();
  const now = useMinute(!online || saved !== null);
  if (online && saved !== null)
    return (
      <div role="status" aria-live="polite" className={BAR}>
        <HistoryIcon aria-hidden className="size-4 shrink-0" />
        <span>{savedCopyMessage(saved, now)}</span>
        <button
          type="button"
          className="min-h-11 px-2 font-bold underline underline-offset-4"
          onClick={() => window.location.reload()}
        >
          تحديث
        </button>
      </div>
    );
  if (online) return null;
  return (
    <div role="status" aria-live="polite" className={BAR}>
      <WifiOffIcon aria-hidden className="size-4 shrink-0" />
      <span>{offlineMessage(saved ?? last, now)}</span>
    </div>
  );
}

/** Short explanation under a disabled save button when offline. Renders nothing online. */
export function OfflineWriteHint({ className = "" }: { className?: string }) {
  const online = useOnline();
  if (online) return null;
  return <p className={`text-muted text-sm ${className}`}>{OFFLINE_WRITE_HINT}</p>;
}
