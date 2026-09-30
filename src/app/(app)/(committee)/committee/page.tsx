import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminPage } from "@/components/admin/page";
import { demoMode } from "@/components/app/source";

export const metadata: Metadata = { title: "صندوق الرابطة" };

/** Home «الصندوق أولًا» (owner pick B). */
export default async function CommitteeHome({ searchParams }: PageProps<"/committee">) {
  // demo only: try the first sign-in setup
  if (demoMode && (await searchParams).setup === "1") redirect("/committee/setup");
  return <AdminPage path={[]} searchParams={searchParams} />;
}
