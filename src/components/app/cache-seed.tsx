"use client";
import { QueryObserver, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { publicQueries } from "@/lib/data/queries";
import type { FundStats } from "@/lib/data/types";

/**
 * Pages are Server Components, so public data never passes through TanStack Query on its own.
 * Put the rendered fund stats (amount-free: money privacy) into the (persisted) public cache with the time the server read
 * it, so the offline banner can say «آخر تحديث قبل …». Never overwrites newer data.
 * The disabled observer keeps the entry alive: the shared gcTime (30 days) is past setTimeout's
 * limit, so an entry without observers is collected at once (Lane B follow-up).
 */
export function PublicCacheSeed({ stats, fetchedAt }: { stats: FundStats; fetchedAt: number }) {
  const qc = useQueryClient();
  useEffect(() => {
    const q = publicQueries.fundStats();
    const prev = qc.getQueryState(q.queryKey)?.dataUpdatedAt ?? 0;
    if (fetchedAt > prev) qc.setQueryData(q.queryKey, stats, { updatedAt: fetchedAt });
    const keep = new QueryObserver(qc, { ...q, enabled: false });
    return keep.subscribe(() => {});
  }, [qc, stats, fetchedAt]);
  return null;
}
