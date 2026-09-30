import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/page";

export const metadata: Metadata = { title: "المزيد · صندوق الرابطة" };

export default function More({ searchParams }: PageProps<"/committee/more">) {
  return <AdminPage path={["more"]} searchParams={searchParams} />;
}
