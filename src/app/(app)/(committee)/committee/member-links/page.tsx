import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { MemberLinksPage } from "@/components/app/member-links";
import { Tab } from "@/components/app/tab";

export const metadata: Metadata = { title: "روابط الأعضاء · صندوق الرابطة" };

export default async function MemberLinks() {
  await src.requireCommittee("/committee/member-links");
  const [members, links] = await Promise.all([src.membersAdmin(), src.memberLinks()]);
  return (
    <Tab>
      <MemberLinksPage members={members} links={links} />
    </Tab>
  );
}
