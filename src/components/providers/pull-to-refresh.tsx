"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";
import {
  canStartPull,
  isVerticalPull,
  MIN_REFRESH_MS,
  OFFLINE_PULL_MESSAGE,
  PULL_THRESHOLD,
  pullDistance,
  pullProgress,
} from "@/lib/offline/pull";

const SIZE = 40; // indicator diameter (px)
const SAFETY_MS = 15_000; // never spin forever

function subscribeStandalone(cb: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Pull down at the top of the page to refresh — only in the installed app, where the browser's
 * own pull-to-refresh is absent. Moves only transform/opacity, updated in rAF from passive
 * listeners, so it stays smooth on low-end phones.
 */
export function PullToRefresh() {
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
  const client = useQueryClient();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // A refresh run: `started` when released past the threshold; it ends when the queries have
  // settled (+ minimum time) and the server components have re-rendered, or after SAFETY_MS.
  const [run, setRun] = useState({ started: false, queriesDone: false, timedOut: false });
  const spinning = run.started && !run.timedOut && !(run.queriesDone && !isPending);
  const ind = useRef<HTMLDivElement>(null);
  const spinningRef = useRef(spinning);

  // No double gesture / bounce: the page itself must not overscroll in the installed app.
  useEffect(() => {
    if (!standalone) return;
    const html = document.documentElement;
    const prev = html.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = "contain";
    return () => {
      html.style.overscrollBehaviorY = prev;
    };
  }, [standalone]);

  // Hide the indicator when a run ends (DOM only).
  useEffect(() => {
    spinningRef.current = spinning;
    if (!spinning && run.started) place(0, false);
  }, [spinning, run.started]);

  useEffect(() => {
    if (!spinning) return;
    const t = setTimeout(() => setRun((r) => ({ ...r, timedOut: true })), SAFETY_MS);
    return () => clearTimeout(t);
  }, [spinning]);

  /** Position the indicator for a pulled distance (0 = hidden). */
  function place(d: number, dragging: boolean) {
    const el = ind.current;
    if (!el) return;
    const still = reducedMotion();
    const p = pullProgress(d);
    el.style.transition = dragging || still ? "none" : "transform 220ms ease-out, opacity 220ms";
    el.style.transform = `translate3d(-50%, ${d - SIZE}px, 0)`;
    el.style.opacity = d > 0 ? String(Math.min(1, 0.3 + p)) : "0";
    const arc = el.querySelector("svg");
    if (arc && !still) arc.style.transform = `rotate(${p * 270}deg)`;
    el.dataset.ready = p >= 1 ? "true" : "false";
  }

  function refresh() {
    if (!navigator.onLine) {
      toast(OFFLINE_PULL_MESSAGE, { duration: 2500 });
      place(0, false);
      return;
    }
    setRun({ started: true, queriesDone: false, timedOut: false });
    spinningRef.current = true;
    place(PULL_THRESHOLD, false);
    startTransition(() => router.refresh());
    void Promise.allSettled([
      client.invalidateQueries(),
      new Promise((r) => setTimeout(r, MIN_REFRESH_MS)),
    ]).then(() => setRun((r) => ({ ...r, queriesDone: true })));
  }

  useEffect(() => {
    if (!standalone) return;
    let startX = 0;
    let startY = 0;
    let active = false; // touch started where a pull is allowed
    let vertical: boolean | null = null;
    let dist = 0;
    let armed = false; // passed the threshold (haptic already given)
    let frame = 0;

    const onStart = (e: TouchEvent) => {
      if (spinningRef.current || e.touches.length !== 1) return;
      active = canStartPull({
        standalone: true,
        scrollY: window.scrollY,
        target: e.target instanceof Element ? e.target : null,
        doc: document,
      });
      if (!active) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      vertical = null;
      dist = 0;
      armed = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (vertical === null) vertical = isVerticalPull(dx, dy);
      if (vertical === false || window.scrollY > 0) {
        active = false;
        if (dist > 0) place(0, false);
        return;
      }
      if (!vertical) return;
      dist = pullDistance(dy);
      const ready = dist >= PULL_THRESHOLD;
      if (ready !== armed) {
        armed = ready;
        if (ready) haptic.tap();
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => place(dist, true));
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      cancelAnimationFrame(frame);
      if (dist >= PULL_THRESHOLD) refresh();
      else place(0, false);
      dist = 0;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
    // refresh/place only use refs, stable router/client and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standalone]);

  if (!standalone) return null;
  return (
    <div
      ref={ind}
      aria-hidden={!spinning}
      data-testid="pull-indicator"
      data-refreshing={spinning}
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top, 0px)",
        left: "50%",
        zIndex: 60,
        width: SIZE,
        height: SIZE,
        marginTop: 8,
        borderRadius: "50%",
        background: "var(--surface, #fff)",
        boxShadow: "0 2px 10px rgb(0 0 0 / 0.18)",
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        opacity: 0,
        transform: `translate3d(-50%, ${-SIZE}px, 0)`,
        willChange: "transform, opacity",
      }}
    >
      <style>{`@keyframes bq-ptr-spin{to{transform:rotate(360deg)}}`}</style>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--primary, #237a3b)"
        strokeWidth="2.6"
        strokeLinecap="round"
        style={spinning ? { animation: "bq-ptr-spin 0.8s linear infinite" } : undefined}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        {!spinning && <path d="M21 3v6h-6" />}
      </svg>
      {spinning && (
        <span
          role="status"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
          }}
        >
          جارٍ التحديث
        </span>
      )}
    </div>
  );
}
