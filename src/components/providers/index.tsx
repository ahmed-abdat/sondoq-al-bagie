"use client";

import { QueryClient } from "@tanstack/react-query";
import {
  PersistQueryClientProvider,
  persistQueryClientSave,
} from "@tanstack/react-query-persist-client";
import { useState, type ReactNode } from "react";
import { createIdbPersister, isPersistable, PERSIST_MAX_AGE } from "@/lib/offline/persister";
import { OfflineBanner } from "./offline-banner";
import { OnlineSync } from "./online";
import { PullToRefresh } from "./pull-to-refresh";
import { AppToaster } from "./toaster";
import { InstallBanner, InstallCapture, InstallWatcher } from "./install";
import { SaveVisitedPages, ServiceWorkerUpdates, WarmOfflinePages } from "./sw-update";

export { useOnline } from "./online";
export { AppBadgeSync } from "./app-badge";
// The committee's push pieces (server actions) live in "./committee-push"; import them from there.
export { OfflineWriteHint } from "./offline-banner";
export { InstallEntry, markInstallEngaged } from "./install";
export { reportActionError } from "./sw-update";
export { MemberLinkPaste } from "./member-link-paste";
// Member push pieces (server actions) live in "./member-push"; import them from there.

// Bump when the shape of saved public data changes, so old copies are dropped.
// "2": money privacy, older saved copies may hold amounts.
const CACHE_VERSION = "2";

export function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // Never garbage-collect: the saved copy must survive until it is persisted/restored.
        // (30 days as a timer would overflow setTimeout's 2^31 ms limit and fire at once.)
        gcTime: Infinity,
        retry: 1,
        // Offline: show what we have, fetch again when the connection comes back.
        networkMode: "offlineFirst",
      },
      mutations: { networkMode: "online" },
    },
  });
}

/**
 * App-wide client state: TanStack Query (public data saved to IndexedDB), online status,
 * offline banner, update toast, and the toast container (do not mount another <Toaster>).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  const [persister] = useState(createIdbPersister);
  const persistOptions = {
    persister,
    maxAge: PERSIST_MAX_AGE,
    buster: CACHE_VERSION,
    dehydrateOptions: { shouldDehydrateQuery: isPersistable },
  };
  // Saving only starts once the saved copy is restored; data put in before that (the page's
  // PublicCacheSeed) would wait for the next change, so save once right after the restore.
  const saveNow = () => persistQueryClientSave({ ...persistOptions, queryClient: client });
  return (
    <>
      <InstallCapture />
      <PersistQueryClientProvider
        client={client}
        persistOptions={persistOptions}
        onSuccess={saveNow}
        onError={saveNow}
      >
        <OnlineSync />
        <OfflineBanner />
        <ServiceWorkerUpdates />
        <SaveVisitedPages />
        <WarmOfflinePages />
        <PullToRefresh />
        {children}
        <InstallWatcher />
        <InstallBanner />
        <AppToaster />
      </PersistQueryClientProvider>
    </>
  );
}
