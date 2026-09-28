import { redirect } from "next/navigation";
import { heroData } from "@/components/app/page-data";
import { AppShell } from "@/components/app/shell";
import * as src from "@/components/app/source";
import { CommitteeLive } from "@/components/app/views/committee";

// Committee area: signed-in, active committee members only (the proxy also sends others to /login).
export default async function CommitteeLayout({ children }: LayoutProps<"/">) {
  const session = await src.committeeSession();
  if (!session) redirect("/login?next=/committee");
  const pending = await src.pendingPayments();
  const n = pending.length;
  const hero = await heroData(
    n > 0
      ? `${n} ${n === 1 ? "دفعة" : n === 2 ? "دفعتان" : n <= 10 ? "دفعات" : "دفعة"} بانتظار التأكيد`
      : undefined,
  );
  return (
    <AppShell hero={hero} badge={n}>
      <CommitteeLive />
      {children}
    </AppShell>
  );
}
