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
  mayStore,
  PAGES_CACHE,
  RETIRED_CACHES,
  VIEWS_CACHE,
} from "@/lib/offline/cache-rules";
import { nextBadgeCount, syncAppBadge } from "@/lib/offline/app-badge";
import { WARM_META_CACHE } from "@/lib/offline/warm";
import { notificationOptions, parsePushPayload, safePath } from "@/lib/offline/push-payload";
import {
  lookupServed,
  recordServed,
  SERVED_QUERY,
  type Served,
} from "@/lib/offline/served-from-cache";

declare const self: ServiceWorkerGlobalScope &
  SerwistGlobalConfig & { __SW_MANIFEST: (PrecacheEntry | string)[] | undefined };

const DAY = 24 * 60 * 60;
const ok = new CacheableResponsePlugin({ statuses: [0, 200] });
// personal or no-store responses (committee, member «أنت», money reads) are never kept
const shareable = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    mayStore(response.headers.get("cache-control")) ? response : null,
};
const expire = (maxEntries: number, maxAgeSeconds: number) =>
  new ExpirationPlugin({ maxEntries, maxAgeSeconds, purgeOnQuotaError: true });

// Pages answered from the saved copy, so the page can tell the member how old it is.
const served = new Map<string, Served>();
const markServed = {
  cachedResponseWillBeUsed: async ({
    request,
    cachedResponse,
  }: {
    request: Request;
    cachedResponse?: Response;
  }) => {
    if (cachedResponse) recordServed(served, request.url, cachedResponse.headers.get("date"));
    return cachedResponse;
  },
};

// Order matters: the first match wins. Nothing private or written is ever stored.
const runtimeCaching: RuntimeCaching[] = [
  // Writes go straight to the network (committee actions, server actions, uploads).
  { matcher: ({ request }) => request.method !== "GET", handler: new NetworkOnly() },
  // Public Supabase views: show the last copy at once, refresh in the background.
  {
    matcher: ({ url, request }) => isPublicViewRead(url, request.method),
    handler: new StaleWhileRevalidate({
      cacheName: VIEWS_CACHE,
      plugins: [ok, shareable, expire(32, DAY)],
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
      cacheName: PAGES_CACHE,
      networkTimeoutSeconds: 6,
      plugins: [ok, shareable, expire(48, 14 * DAY), markServed],
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

// Old runtime caches may hold amounts (before money privacy): drop them when this worker takes over.
self.addEventListener("activate", (event) => {
  // and forget when the pages were last saved: this build's pages must be saved again (they point
  // at this build's script files), which the next open of the app does at once (WarmOfflinePages)
  event.waitUntil(
    Promise.all([...RETIRED_CACHES, WARM_META_CACHE].map((name) => caches.delete(name))),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
  // «was this page shown from the saved copy?» → its date, or null
  if (event.data?.type === SERVED_QUERY)
    event.ports[0]?.postMessage(lookupServed(served, event.data.path, event.data.since));
});

// Web Push (committee): show the notification; a tap opens its page in the app.
self.addEventListener("push", (event) => {
  let raw: string | null = null;
  try {
    raw = event.data?.text() ?? null;
  } catch {
    /* unreadable payload: show the default notification */
  }
  const p = parsePushPayload(raw);
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(p.title, notificationOptions(p)),
      // the number on the app icon (0 clears); no count sent → leave it as it is
      (() => {
        const next = nextBadgeCount(p);
        return next === null ? undefined : syncAppBadge(next, self.navigator);
      })(),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(safePath(event.notification.data?.url), self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const mine = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (mine) {
        await mine.focus();
        // navigate() needs a page this worker controls; otherwise open a new one
        const moved = await mine.navigate(url).catch(() => null);
        if (moved) return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

serwist.addEventListeners();
