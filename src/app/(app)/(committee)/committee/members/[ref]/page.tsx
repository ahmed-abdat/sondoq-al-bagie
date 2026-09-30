import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/page";

export const metadata: Metadata = { title: "كشف حساب · صندوق الرابطة" };

export default async function Member({
  params,
  searchParams,
}: PageProps<"/committee/members/[ref]">) {
  const { ref } = await params;
  return <AdminPage path={["members", ref]} searchParams={searchParams} />;
}
