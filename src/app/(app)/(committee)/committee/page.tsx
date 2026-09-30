import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminApp } from "@/components/admin/app";
import * as src from "@/components/app/source";

export const metadata: Metadata = { title: "صندوق الرابطة" };

/** Home «الصندوق أولًا» (owner pick B). */
export default async function CommitteeHome({ searchParams }: PageProps<"/committee">) {
  const sp = await searchParams;
  // demo only: try the first sign-in setup
  if (src.demoMode && sp.setup === "1") redirect("/committee/setup");
  return <AdminApp path={[]} q={flat(sp)} data={await src.adminData()} />;
}

function flat(sp: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  ) as Record<string, string | undefined>;
}
