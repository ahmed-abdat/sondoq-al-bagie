import "server-only";
// One server entry for the committee app's screens: the data model, then the screen.
import * as src from "@/components/app/source";
import { AdminApp } from "./app";

type SP = Record<string, string | string[] | undefined>;

export async function AdminPage({
  path,
  searchParams,
}: {
  path: string[];
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const q = Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  ) as Record<string, string | undefined>;
  return <AdminApp path={path} q={q} data={await src.adminData()} />;
}
