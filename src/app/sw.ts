/// <reference lib="webworker" />
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";
import {
  isOtherSupabase,
  isPrivatePath,
  isPublicPage,
  isPublicViewRead,
} from "@/lib/offline/cache-rules";

declare const self: ServiceWorkerGlobalScope &
  SerwistGlobalConfig & { __SW_MANIFEST: (PrecacheEntry | string)[] | undefined };

const DAY = 24 * 60 * 60;
const ok = new CacheableResponsePlugin({ statuses: [0, 200] });
const expire = (maxEntries: number, maxAgeSeconds: number) =>
  new ExpirationPlugin({ maxEntries, maxAgeSeconds, purgeOnQuotaError: true });

// Order matters: the first match wins. Nothing private or written is ever stored.
const runtimeCaching: RuntimeCaching[] = [
  // Writes go straight to the network (committee actions, server actions, uploads).
  { matcher: ({ request }) => request.method !== "GET", handler: new NetworkOnly() },
  // Public Supabase views: show the last copy at once, refresh in the background.
  {
    matcher: ({ url, request }) => isPublicViewRead(url, request.method),
    handler: new StaleWhileRevalidate({
      cacheName: "sb-public-views",
      plugins: [ok, expire(32, DAY)],
    }),
  },
  // Auth, storage (proof images), realtime, RPC, tables: never cached.
  { matcher: ({ url }) => isOtherSupabase(url), handler: new NetworkOnly() },
  // Logged-in pages and APIs: network only (offline → offline page).
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && isPrivatePath(url.pathname),
    handler: new NetworkOnly(),
  },
  // On-device OCR (worker, WASM core, Arabic/French models, ~8 MB): downloaded once on first use,
  // then kept. Not precached, so members who never read a receipt never download it.
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/ocr/"),
    handler: new CacheFirst({ cacheName: "ocr", plugins: [ok, expire(12, 90 * DAY)] }),
  },
  // Hashed build assets never change.
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
    handler: new CacheFirst({ cacheName: "next-static", plugins: [ok, expire(128, 30 * DAY)] }),
  },
  // Fonts (self-hosted by next/font) and images.
  {
    matcher: ({ request }) => request.destination === "font",
    handler: new CacheFirst({ cacheName: "fonts", plugins: [ok, expire(16, 365 * DAY)] }),
  },
  {
    matcher: ({ request, sameOrigin }) => sameOrigin && request.destination === "image",
    handler: new StaleWhileRevalidate({ cacheName: "images", plugins: [ok, expire(64, 30 * DAY)] }),
  },
  // Public pages and their RSC payloads: fresh when online, last copy when offline or very slow.
  {
    matcher: ({ url, sameOrigin }) => isPublicPage(url, sameOrigin),
    handler: new NetworkFirst({
      cacheName: "pages",
      networkTimeoutSeconds: 6,
      plugins: [ok, expire(48, 14 * DAY)],
    }),
  },
  { matcher: /.*/, handler: new NetworkOnly() },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // A new version waits until the user taps «تحديث» (see the update toast), then takes over.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      { url: "/offline.html", matcher: ({ request }) => request.destination === "document" },
    ],
  },
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

serwist.addEventListeners();
