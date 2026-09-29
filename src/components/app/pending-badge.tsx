import { AppBadgeSync } from "@/components/providers";
import { CancellerSetter } from "./canceller-setter";
import { ROLE_LABEL } from "./derive";
import { PendingCountSetter } from "./pending-count-setter";
import * as src from "./source";

/** Server: the pending count for the nav badge (streams in; the hub updates it live afterwards). */
export async function PendingBadge() {
  const session = await src.anyCommitteeSession();
  if (!session) return null;
  const pending = await src.pendingPayments();
  return (
    <>
      <PendingCountSetter n={pending.length} />
      <AppBadgeSync canConfirm={session.canConfirm} fallback={pending.length} />
      <CancellerSetter
        v={
          session.role === "committee"
            ? null
            : { by: session.displayName, role: ROLE_LABEL[session.role] }
        }
      />
    </>
  );
}
