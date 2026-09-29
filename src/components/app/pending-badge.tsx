import { PendingCountSetter } from "./pending-count-setter";
import * as src from "./source";

/** Server: the pending count for the nav badge (streams in; the hub updates it live afterwards). */
export async function PendingBadge() {
  const session = await src.committeeSession();
  if (!session) return null;
  const pending = await src.pendingPayments();
  return <PendingCountSetter n={pending.length} />;
}
