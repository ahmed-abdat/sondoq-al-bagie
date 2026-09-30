import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/page";

export const metadata: Metadata = { title: "التقارير · صندوق الرابطة" };

export default function Reports({ searchParams }: PageProps<"/committee/reports">) {
  return <AdminPage path={["reports"]} searchParams={searchParams} />;
}
