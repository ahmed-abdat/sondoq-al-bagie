import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/page";

export const metadata: Metadata = { title: "التبرعات · صندوق الرابطة" };

export default async function Campaign({
  params,
  searchParams,
}: PageProps<"/committee/campaigns/[id]">) {
  const { id } = await params;
  return <AdminPage path={["campaigns", id]} searchParams={searchParams} />;
}
