import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/page";

export const metadata: Metadata = { title: "التبرعات · صندوق الرابطة" };

export default function Campaigns({ searchParams }: PageProps<"/committee/campaigns">) {
  return <AdminPage path={["campaigns"]} searchParams={searchParams} />;
}
