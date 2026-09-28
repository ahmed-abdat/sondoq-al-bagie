import type { Metadata } from "next";
import { redirect } from "next/navigation";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { ExportPage } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "تصدير البيانات · اللجنة", robots: { index: false } };

export default async function Export() {
  const session = await src.committeeSession();
  if (!session || session.role === "committee") redirect("/committee");
  return (
    <Tab>
      <ExportPage />
    </Tab>
  );
}
