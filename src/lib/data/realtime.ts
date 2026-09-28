"use client";
// Live committee queue: when any payment row changes (recorded, confirmed, rejected, cancelled),
// refetch the committee payment lists and arrears, and the public numbers. Realtime applies the
// payments RLS policy, so only an active committee session receives events.
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { COMMITTEE_KEY, PUBLIC_KEY } from "./tags";

export type PaymentChange = {
  event: "INSERT" | "UPDATE" | "DELETE";
  id: string | null;
  status: string | null;
};

/** What a payment change makes stale. Pure; unit tested. */
export function invalidateAfterPaymentChange(qc: Pick<QueryClient, "invalidateQueries">) {
  void qc.invalidateQueries({ queryKey: [COMMITTEE_KEY, "payments"] });
  void qc.invalidateQueries({ queryKey: [COMMITTEE_KEY, "arrears"] });
  void qc.invalidateQueries({ queryKey: [PUBLIC_KEY] });
}

/**
 * Mount once in the committee layout. `onChange` (optional) gets each event, e.g. to toast
 * «دفعة جديدة بانتظار التأكيد».
 */
export function usePaymentsRealtime(onChange?: (change: PaymentChange) => void) {
  const qc = useQueryClient();
  const handle = useEffectEvent((change: PaymentChange) => {
    invalidateAfterPaymentChange(qc);
    onChange?.(change);
  });

  useEffect(() => {
    let sb: ReturnType<typeof createClient>;
    try {
      sb = createClient();
    } catch {
      return; // Supabase not configured: nothing to listen to
    }
    const channel = sb
      .channel("committee:payments")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, (payload) => {
        const row = (payload.new && "id" in payload.new ? payload.new : payload.old) as {
          id?: string;
          status?: string;
        };
        handle({ event: payload.eventType, id: row?.id ?? null, status: row?.status ?? null });
      })
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, []);
}
