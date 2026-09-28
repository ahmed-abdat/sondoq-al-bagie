"use client";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState, type ReactNode } from "react";
import { createIdbPersister, isPersistable, PERSIST_MAX_AGE } from "@/lib/offline/persister";
import { OfflineBanner } from "./offline-banner";
import { OnlineSync } from "./online";

export { useOnline } from "./online";
export { OfflineBanner, OfflineWriteHint } from "./offline-banner";

// Bump when the shape of saved public data changes, so old copies are dropped.
const CACHE_VERSION = "1";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: PERSIST_MAX_AGE, // keep data around long enough to be saved and restored
        retry: 1,
        // Offline: show what we have, fetch again when the connection comes back.
        networkMode: "offlineFirst",
      },
      mutations: { networkMode: "online" },
    },
  });
}

/** App-wide client state: TanStack Query (public data saved to IndexedDB) + online status. */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  const [persister] = useState(createIdbPersister);
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        buster: CACHE_VERSION,
        dehydrateOptions: { shouldDehydrateQuery: isPersistable },
      }}
    >
      <OnlineSync />
      <OfflineBanner />
      {children}
    </PersistQueryClientProvider>
  );
}
