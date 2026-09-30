"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { OfflineBanner } from "./offline-banner";
import { OnlineSync } from "./online";
import { PullToRefresh } from "./pull-to-refresh";
import { AppToaster } from "./toaster";
import { InstallBanner, InstallCapture, InstallWatcher } from "./install";
import { ServiceWorkerUpdates } from "./sw-update";

export { useOnline } from "./online";
export { AppBadgeSync } from "./app-badge";
// The committee's push pieces (server actions) live in "./committee-push"; import them from there.
export { OfflineWriteHint } from "./offline-banner";
export { InstallEntry, markInstallEngaged } from "./install";
export { reportActionError } from "./sw-update";

export function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // Never garbage-collect (a timer of days would overflow setTimeout's 2^31 ms limit).
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
 * App-wide client state: TanStack Query (in memory only: the app is committee-only, nothing is
 * saved on the phone), online status, offline banner, update toast, and the toast container (do
 * not mount another <Toaster>).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  return (
    <>
      <InstallCapture />
      <QueryClientProvider client={client}>
        <OnlineSync />
        <OfflineBanner />
        <ServiceWorkerUpdates />
        <PullToRefresh />
        {children}
        <InstallWatcher />
        <InstallBanner />
        <AppToaster />
      </QueryClientProvider>
    </>
  );
}
