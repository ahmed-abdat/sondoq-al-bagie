"use client";

import { unstable_isUnrecognizedActionError, usePathname } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { isPublicPage, mayStore, PAGES_CACHE } from "@/lib/offline/cache-rules";
import { allowsBackgroundDownload, type NetworkInfo } from "@/lib/offline/data-saver";

/* ───────────── update requested by the member ───────────── */

let updateRequested = false;

/** «تحديث»: activate the waiting worker (the page reloads when it takes over), else reload. */
function requestUpdate(worker: ServiceWorker | null | undefined) {
  updateRequested = true;
  if (worker) worker.postMessage({ type: "SKIP_WAITING" });
  else window.location.reload();
}

/**
 * The app on this phone is older than the server (a deploy happened while it was open): its
 * server actions no longer exist there. Offer the update instead of a silent failure.
 */
async function offerStaleAppUpdate() {
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  await reg?.update().catch(() => {});
  toast("نسخة جديدة من التطبيق متاحة", {
    id: "stale-app",
    description: "اضغط «تحديث» ثم أعد المحاولة.",
    duration: Infinity,
    action: { label: "تحديث", onClick: () => requestUpdate(reg?.waiting ?? reg?.installing) },
  });
}

/**
 * Call from a failed server action (e.g. in a catch). Returns true when the failure is an app
 * version mismatch; the update toast is then shown and the caller can stay quiet.
 */
export function reportActionError(error: unknown): boolean {
  if (!unstable_isUnrecognizedActionError(error)) return false;
  void offerStaleAppUpdate();
  return true;
}

/**
 * When a new version of the service worker is installed and waiting, show «تحديث جديد متاح».
 * Tapping «تحديث» activates it and reloads once. Also checks for updates when the app returns
 * to the foreground (a PWA can stay open for days on a phone).
 */
export function ServiceWorkerUpdates() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let reg: ServiceWorkerRegistration | undefined;
    let shown = false;
    let reloading = false;

    const offer = (worker: ServiceWorker) => {
      if (shown || !navigator.serviceWorker.controller) return; // first install: nothing to update
      shown = true;
      toast("تحديث جديد متاح", {
        description: "نسخة أحدث من التطبيق جاهزة.",
        duration: Infinity,
        action: { label: "تحديث", onClick: () => requestUpdate(worker) },
      });
    };
    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      if (worker.state === "installed") return offer(worker);
      worker.addEventListener("statechange", () => worker.state === "installed" && offer(worker));
    };
    const onUpdateFound = () => track(reg?.installing ?? null);
    const onControllerChange = () => {
      if (!updateRequested || reloading) return; // only reload when the user asked for the update
      reloading = true;
      window.location.reload();
    };
    const onVisible = () => document.visibilityState === "visible" && void reg?.update();
    // safety net: a server action from an older app version that nobody caught
    const onRejection = (e: PromiseRejectionEvent) => {
      if (reportActionError(e.reason)) e.preventDefault();
    };
    window.addEventListener("unhandledrejection", onRejection);

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisible);
    void navigator.serviceWorker.getRegistration().then((r) => {
      reg = r;
      if (!r) return;
      track(r.waiting);
      r.addEventListener("updatefound", onUpdateFound);
    });
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("unhandledrejection", onRejection);
      reg?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);
  return null;
}

/**
 * In-app navigation only downloads RSC data, so the full page would be missing offline.
 * After each public page visit, save its HTML once, at once: on flaky 3G the connection can drop
 * a second later, and the page being read must open offline then (not after the phone is idle,
 * nor after the worker takes control: the saved copy is served as soon as it does). A page loaded
 * in full is copied from the browser's own HTTP cache (no second download). Skipped for committee
 * pages, when already saved, and in data-saver mode or on 2G (the page is 170 to 230 KB).
 * Replaces Serwist's cacheOnNavigation, which would also save logged-in pages.
 */
/** The path the document was loaded on (then null: later paths come by in-app navigation). */
let firstPath: string | null = typeof window === "undefined" ? null : window.location.pathname;

export function SaveVisitedPages() {
  const pathname = usePathname();
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("caches" in window)) return;
    const url = new URL(pathname, location.origin);
    if (!isPublicPage(url, true)) return;
    // the first page of this load came as a full document: the browser's HTTP cache has it
    const fullLoad = pathname === firstPath;
    firstPath = null;
    void (async () => {
      const conn = (navigator as Navigator & { connection?: NetworkInfo }).connection;
      if (!navigator.onLine || !allowsBackgroundDownload(conn)) return;
      try {
        const cache = await caches.open(PAGES_CACHE);
        if (await cache.match(url.href, { ignoreVary: true })) return;
        const res = await fetch(url.href, {
          credentials: "same-origin",
          cache: fullLoad ? "force-cache" : "default",
        });
        // as in the worker: nothing marked personal or not-to-keep (money privacy)
        if (res.ok && !res.redirected && mayStore(res.headers.get("cache-control")))
          await cache.put(url.href, res);
      } catch {
        /* offline or storage full: nothing to do */
      }
    })();
  }, [pathname]);
  return null;
}
