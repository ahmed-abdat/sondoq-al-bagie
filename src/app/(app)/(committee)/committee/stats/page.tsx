import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/page";

export const metadata: Metadata = { title: "الإحصاءات · صندوق الرابطة" };

export default function Stats({ searchParams }: PageProps<"/committee/stats">) {
  return <AdminPage path={["stats"]} searchParams={searchParams} />;
}
