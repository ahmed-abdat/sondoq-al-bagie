import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/page";

export const metadata: Metadata = { title: "سجل العمليات · صندوق الرابطة" };

export default function Activity({ searchParams }: PageProps<"/committee/activity">) {
  return <AdminPage path={["activity"]} searchParams={searchParams} />;
}
