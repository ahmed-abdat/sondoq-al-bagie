"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { isPublicPage } from "@/lib/offline/cache-rules";

const PAGES_CACHE = "pages"; // same name as the NetworkFirst page cache in src/app/sw.ts

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
        action: { label: "تحديث", onClick: () => worker.postMessage({ type: "SKIP_WAITING" }) },
      });
    };
    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      if (worker.state === "installed") return offer(worker);
      worker.addEventListener("statechange", () => worker.state === "installed" && offer(worker));
    };
    const onUpdateFound = () => track(reg?.installing ?? null);
    const onControllerChange = () => {
      if (!shown || reloading) return; // only reload when the user asked for the update
      reloading = true;
      window.location.reload();
    };
    const onVisible = () => document.visibilityState === "visible" && void reg?.update();

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
      reg?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);
  return null;
}

/**
 * In-app navigation only downloads RSC data, so the full page would be missing offline.
 * After each public page visit, save its HTML once (skipped for committee pages and when
 * already saved, to spare small data plans). Replaces Serwist's cacheOnNavigation,
 * which would also save logged-in pages.
 */
export function SaveVisitedPages() {
  const pathname = usePathname();
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw || !("caches" in window)) return;
    const url = new URL(pathname, location.origin);
    if (!isPublicPage(url, true)) return;
    let cancelled = false;
    const save = async () => {
      if (cancelled || !navigator.onLine) return;
      try {
        const cache = await caches.open(PAGES_CACHE);
        if (await cache.match(url.href, { ignoreVary: true })) return;
        const res = await fetch(url.href, { credentials: "same-origin" });
        if (res.ok && !res.redirected) await cache.put(url.href, res);
      } catch {
        /* offline or storage full: nothing to do */
      }
    };
    // First visit: the worker takes control a moment after load (clientsClaim); save then.
    if (sw.controller) void save();
    else sw.addEventListener("controllerchange", save, { once: true });
    return () => {
      cancelled = true;
      sw.removeEventListener("controllerchange", save);
    };
  }, [pathname]);
  return null;
}
