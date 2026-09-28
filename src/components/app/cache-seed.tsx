"use client";
import { QueryObserver, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { publicQueries } from "@/lib/data/queries";
import type { FundSummary } from "@/lib/data/types";

/**
 * Pages are Server Components, so public data never passes through TanStack Query on its own.
 * Put the rendered fund summary into the (persisted) public cache with the time the server read
 * it, so the offline banner can say «آخر تحديث قبل …». Never overwrites newer data.
 * The disabled observer keeps the entry alive: the shared gcTime (30 days) is past setTimeout's
 * limit, so an entry without observers is collected at once (Lane B follow-up).
 */
export function PublicCacheSeed({ summary, fetchedAt }: { summary: FundSummary; fetchedAt: number }) {
  const qc = useQueryClient();
  useEffect(() => {
    const q = publicQueries.fundSummary();
    const prev = qc.getQueryState(q.queryKey)?.dataUpdatedAt ?? 0;
    if (fetchedAt > prev) qc.setQueryData(q.queryKey, summary, { updatedAt: fetchedAt });
    const keep = new QueryObserver(qc, { ...q, enabled: false });
    return keep.subscribe(() => {});
  }, [qc, summary, fetchedAt]);
  return null;
}
