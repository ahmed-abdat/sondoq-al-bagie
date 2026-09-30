import type { Metadata } from "next";
import { MoreMenu } from "@/components/admin/more";
import * as src from "@/components/app/source";

export const metadata: Metadata = { title: "المزيد · صندوق الرابطة" };

/** A menu: only the session, no fund data, so it opens at once. */
export default async function More() {
  const s = await src.requireCommittee("/committee/more");
  return (
    <MoreMenu me={{ name: s.displayName, role: src.roleWord(s.role), admin: s.role === "admin" }} />
  );
}
