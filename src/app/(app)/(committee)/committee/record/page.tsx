import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/page";

export const metadata: Metadata = { title: "سجّل دفعة · صندوق الرابطة" };

export default function Record({ searchParams }: PageProps<"/committee/record">) {
  return <AdminPage path={["record"]} searchParams={searchParams} />;
}
