import { Suspense } from "react";
import { PendingBadge } from "@/components/app/pending-badge";
import { isDemo } from "@/components/app/demo";
import { CommitteeLive } from "@/components/app/views/committee";

// Committee area. The proxy sends signed-out visitors to /login; each page checks the session.
// Nothing is awaited here, so the frame and loading.tsx show at once; the «بانتظار التأكيد» badge
// on the nav streams in.
export default function CommitteeLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {/* demo: fictional data stays local, no socket to the real Supabase host (audit B01) */}
      {!isDemo() && <CommitteeLive />}
      <Suspense fallback={null}>
        <PendingBadge />
      </Suspense>
      {children}
    </>
  );
}
