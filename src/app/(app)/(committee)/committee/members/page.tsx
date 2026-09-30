import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/page";

export const metadata: Metadata = { title: "الأعضاء · صندوق الرابطة" };

export default function Members({ searchParams }: PageProps<"/committee/members">) {
  return <AdminPage path={["members"]} searchParams={searchParams} />;
}
