"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { publicQueries } from "@/lib/data/queries";
import type { FundSummary } from "@/lib/data/types";

/**
 * Pages are Server Components, so public data never passes through TanStack Query on its own.
 * Put the rendered fund summary into the (persisted) public cache with the time the server read
 * it, so the offline banner can say «آخر تحديث قبل …». Never overwrites newer data.
 */
export function PublicCacheSeed({ summary, fetchedAt }: { summary: FundSummary; fetchedAt: number }) {
  const qc = useQueryClient();
  useEffect(() => {
    const key = publicQueries.fundSummary().queryKey;
    const prev = qc.getQueryState(key)?.dataUpdatedAt ?? 0;
    if (fetchedAt > prev) qc.setQueryData(key, summary, { updatedAt: fetchedAt });
  }, [qc, summary, fetchedAt]);
  return null;
}
