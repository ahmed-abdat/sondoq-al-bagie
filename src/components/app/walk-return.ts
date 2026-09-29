"use client";
// The «بالترتيب» walks (links, reminders), UX-PATTERNS P9: after the jump to WhatsApp, move to
// the next name when the page is visible again, so it is ready on return. If the page never
// left (desktop popup blocked, a test), move after a short pause instead.
import { useCallback, useEffect, useRef } from "react";

type Wait = { fn: () => void; left: boolean; timer: number };

export function useAfterReturn() {
  const wait = useRef<Wait | null>(null);
  useEffect(() => {
    const on = () => {
      const w = wait.current;
      if (!w) return;
      if (document.visibilityState === "hidden") {
        w.left = true;
        window.clearTimeout(w.timer);
      } else if (w.left) {
        wait.current = null;
        w.fn();
      }
    };
    document.addEventListener("visibilitychange", on);
    return () => {
      document.removeEventListener("visibilitychange", on);
      if (wait.current) window.clearTimeout(wait.current.timer);
      wait.current = null;
    };
  }, []);
  return useCallback((fn: () => void, ms = 1500) => {
    if (wait.current) window.clearTimeout(wait.current.timer);
    const w: Wait = { fn, left: false, timer: 0 };
    w.timer = window.setTimeout(() => {
      if (wait.current !== w || w.left) return;
      wait.current = null;
      fn();
    }, ms);
    wait.current = w;
  }, []);
}
