"use client";

import { onlineManager } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** true when the phone has a connection. Server render assumes online. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/** Keeps TanStack Query's idea of "online" in step with the browser (pauses fetches offline). */
export function OnlineSync() {
  const online = useOnline();
  useEffect(() => onlineManager.setOnline(online), [online]);
  return null;
}
