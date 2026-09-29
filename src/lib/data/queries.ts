"use client";
// TanStack Query option factory for Client Components (the cached fund summary). It reads through
// the browser client, so the public view GET goes through the service worker cache. Keys start
// with "public" (saved on the phone for offline). Pages read on the server (./index).
import { queryOptions } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import * as read from "./read";
import { PUBLIC_KEY } from "./tags";

let browser: read.Client | null = null;
const client = () => (browser ??= createClient());

export const publicQueries = {
  all: () => [PUBLIC_KEY] as const,
  fundSummary: () =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "fund_summary"],
      queryFn: () => read.fundSummary(client()),
    }),
};
