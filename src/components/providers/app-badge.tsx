"use client";
// Keeps the number on the app icon equal to the payments «بانتظار التأكيد» (confirmers only).
// Mount once where the committee's pending count is known (the committee layout). It follows the
// live count (usePendingCount) and, when the app comes back to the foreground, refreshes it from
// the server at most every 30 s. Other members: the badge is cleared.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePendingCount } from "@/components/app/pending-count";
import { syncAppBadge } from "@/lib/offline/app-badge";

const REFRESH_EVERY_MS = 30_000;

export function AppBadgeSync({ canConfirm, fallback }: { canConfirm: boolean; fallback?: number }) {
  const count = usePendingCount(fallback);
  const router = useRouter();

  useEffect(() => {
    if (!canConfirm) void syncAppBadge(0);
    else if (count !== undefined) void syncAppBadge(count);
  }, [canConfirm, count]);

  useEffect(() => {
    if (!canConfirm) return;
    let last = Date.now();
    const back = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < REFRESH_EVERY_MS) return;
      last = Date.now();
      router.refresh(); // the server's pending count flows back into usePendingCount
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [canConfirm, router]);

  return null;
}
