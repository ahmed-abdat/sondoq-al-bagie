import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { LatePage } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "المتأخرون · صندوق الرابطة" };

export default async function Late() {
  await src.requireCommittee("/committee/late");
  const [arrears, report] = await Promise.all([src.arrears(), src.committeeReport()]);
  return (
    <Tab>
      <LatePage arrears={arrears} report={report} />
    </Tab>
  );
}
