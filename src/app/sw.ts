/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope &
  SerwistGlobalConfig & { __SW_MANIFEST: (PrecacheEntry | string)[] | undefined };

// App shell + visited pages are cached so the app opens offline with the last data.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      { url: "/offline.html", matcher: ({ request }) => request.destination === "document" },
    ],
  },
});

serwist.addEventListeners();
