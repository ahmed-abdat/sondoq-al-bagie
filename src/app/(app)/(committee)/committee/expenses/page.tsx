import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/page";

export const metadata: Metadata = { title: "المصاريف · صندوق الرابطة" };

export default function Expenses({ searchParams }: PageProps<"/committee/expenses">) {
  return <AdminPage path={["expenses"]} searchParams={searchParams} />;
}
