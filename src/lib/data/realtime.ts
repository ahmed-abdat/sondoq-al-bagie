"use client";
// Live committee queue: when any payment row changes (recorded, confirmed, rejected, cancelled),
// refetch the committee payment lists and arrears, and the public numbers. Realtime applies the
// payments RLS policy, so only an active committee session receives events.
//
// Reliable on phones: a backgrounded PWA loses its socket, so on return to the foreground, on
// `online` and on a channel error/timeout/close it resubscribes (with backoff) and refreshes once
// to catch up. Bursts are coalesced into one refresh. The realtime token is refreshed before
// each (re)subscribe so RLS keeps delivering after the 1 h access token expires.
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { supabaseEnv } from "@/lib/supabase/env";
import { COMMITTEE_KEY, PUBLIC_KEY } from "./tags";

export type PaymentChangeKind = "pending" | "confirmed" | "rejected" | "cancelled" | "other";

export type PaymentChange = {
  event: "INSERT" | "UPDATE" | "DELETE";
  id: string | null;
  status: string | null;
  kind: PaymentChangeKind;
  /** «من» label for a toast: the payer name on the row */
  payerName: string | null;
  amount: number | null;
  /** who did it: created_by for a new row, decided_by / cancelled_by for a decision */
  actorId: string | null;
  /** done by the signed-in user of this device (the hook fills it) */
  own: boolean;
};

export type RealtimeStatus = "live" | "connecting" | "offline";

type Row = {
  id?: string;
  status?: string;
  payer_name?: string;
  amount?: number;
  created_by?: string | null;
  decided_by?: string | null;
  cancelled_by?: string | null;
};

/** One realtime payload → what happened and who did it. Pure; unit tested. */
export function toPaymentChange(
  event: PaymentChange["event"],
  next: Row | null | undefined,
  prev?: Row | null,
): PaymentChange {
  const row = next && "id" in next ? next : (prev ?? {});
  const status = row.status ?? null;
  const kind: PaymentChangeKind =
    status === "pending" && event === "INSERT"
      ? "pending"
      : status === "confirmed" || status === "rejected" || status === "cancelled"
        ? status
        : "other";
  const actorId =
    event === "INSERT"
      ? (row.created_by ?? null)
      : status === "cancelled"
        ? (row.cancelled_by ?? null)
        : (row.decided_by ?? null);
  return {
    event,
    id: row.id ?? null,
    status,
    kind,
    payerName: row.payer_name ?? null,
    amount: typeof row.amount === "number" ? row.amount : null,
    actorId,
    own: false,
  };
}

/** This device's own action (the page already refreshed after it): no toast. */
export function isOwnChange(change: PaymentChange, userId: string | null | undefined) {
  return !!userId && change.actorId === userId;
}

/** «دفعة جديدة من X بانتظار التأكيد» for another member's new pending payment, else null. */
export function toastFor(change: PaymentChange) {
  if (change.kind !== "pending" || change.own) return null;
  return change.payerName
    ? `دفعة جديدة من ${change.payerName} بانتظار التأكيد`
    : "دفعة جديدة بانتظار التأكيد";
}

/** Retry delay after the n-th failure in a row: 1 s, 2 s, 4 s … capped at 30 s. */
export function backoffMs(attempt: number) {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
}

/** Calls `fn` once, `ms` after the last of a burst of calls. */
export function coalesce(fn: () => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn();
    }, ms);
  };
  run.cancel = () => {
    if (t) clearTimeout(t);
    t = null;
  };
  return run;
}

/** What a payment change makes stale. Pure; unit tested. */
export function invalidateAfterPaymentChange(qc: Pick<QueryClient, "invalidateQueries">) {
  void qc.invalidateQueries({ queryKey: [COMMITTEE_KEY, "payments"] });
  void qc.invalidateQueries({ queryKey: [COMMITTEE_KEY, "arrears"] });
  void qc.invalidateQueries({ queryKey: [PUBLIC_KEY] });
}

export const REFRESH_COALESCE_MS = 400;

/**
 * Mount once in the committee area. `onRefresh` runs once per burst of changes and after every
 * reconnect (catch-up), e.g. router.refresh(). `onChange` gets each event with `own` set for
 * this device's user (toasts: toastFor). Returns the connection status.
 */
export function usePaymentsRealtime(
  opts: {
    onRefresh?: () => void;
    onChange?: (change: PaymentChange) => void;
  } = {},
): RealtimeStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>(() =>
    supabaseEnv() ? "connecting" : "offline",
  );
  const refresh = useEffectEvent(() => {
    invalidateAfterPaymentChange(qc);
    opts.onRefresh?.();
  });
  const change = useEffectEvent((c: PaymentChange) => opts.onChange?.(c));

  useEffect(() => {
    let sb: ReturnType<typeof createClient>;
    try {
      sb = createClient();
    } catch {
      return; // Supabase not configured: nothing to listen to (status starts "offline")
    }
    const soon = coalesce(() => refresh(), REFRESH_COALESCE_MS);
    let channel: ReturnType<typeof sb.channel> | null = null;
    let attempt = 0;
    let everLive = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let live = false;
    let userId: string | null = null;
    const set = (next: RealtimeStatus) => {
      live = next === "live";
      setStatus(next);
    };

    let busy = false;
    const connect = async () => {
      if (disposed || busy) return; // one (re)connect at a time (wake + online can race)
      busy = true;
      try {
        await open();
      } finally {
        busy = false;
      }
    };
    const open = async () => {
      if (retry) clearTimeout(retry);
      retry = null;
      if (channel) {
        const old = channel;
        channel = null;
        await sb.removeChannel(old);
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        set("offline");
        return;
      }
      set("connecting");
      // Fresh access token for RLS (refreshes the session first if it expired while asleep).
      const { data } = await sb.auth.getSession().catch(() => ({ data: { session: null } }));
      userId = data.session?.user.id ?? null;
      await sb.realtime.setAuth().catch(() => undefined);
      if (disposed) return;
      const ch = sb
        .channel("committee:payments")
        .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, (p) => {
          const c = toPaymentChange(p.eventType, p.new as Row, p.old as Row);
          change({ ...c, own: isOwnChange(c, userId) });
          soon();
        });
      channel = ch;
      ch.subscribe((state) => {
        if (disposed || channel !== ch) return;
        if (state === "SUBSCRIBED") {
          attempt = 0;
          set("live");
          if (everLive) soon(); // catch up on what was missed while disconnected
          everLive = true;
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          set("offline");
          retry = setTimeout(() => void connect(), backoffMs(attempt++));
        }
      });
    };

    const wake = () => {
      if (document.visibilityState !== "visible") return;
      soon(); // events may have been dropped while in the background, even if the socket survived
      if (!channel || !live) void connect();
    };
    const online = () => {
      attempt = 0;
      void connect();
    };
    const offline = () => set("offline");

    void connect();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      disposed = true;
      soon.cancel();
      if (retry) clearTimeout(retry);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      if (channel) void sb.removeChannel(channel);
    };
  }, []);

  return status;
}
