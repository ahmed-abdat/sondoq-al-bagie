// One id per open form. The server replays a write sent again with the same id (record_payment,
// record_expense, create_campaign, start_handover), so a retry after a lost answer must reuse it,
// and so must uploadProof (same file, same path). A new id only after the server said ok; closing
// the form (unmount) drops it with the component.
import { useState } from "react";
import type { ActionResult } from "@/lib/data/types";

export type OnceId = { readonly current: string; renew(): void };

export function onceId(make: () => string = () => crypto.randomUUID()): OnceId {
  let id = make();
  return {
    get current() {
      return id;
    },
    renew() {
      id = make();
    },
  };
}

/** The form's id, stable across renders and retries. */
export function useOnceId(): OnceId {
  const [once] = useState(() => onceId());
  return once;
}

/** Send with the form's id; it is renewed only when the send succeeded. */
export async function sendOnce<T>(
  once: OnceId,
  send: (id: string) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const r = await send(once.current);
  if (r.ok) once.renew();
  return r;
}
