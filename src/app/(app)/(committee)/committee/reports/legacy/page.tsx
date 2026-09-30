import type { Metadata } from "next";
import { ReportView } from "@/components/app/report-view";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";

export const metadata: Metadata = { title: "التقرير · اللجنة" };

/** The fund's report behind the committee login (moved from the public /report). */
export default async function ReportsPage() {
  await src.requireCommittee("/committee/reports/legacy");
  const data = await src.committeeReport();
  return (
    <Tab>
      <ReportView data={data} />
    </Tab>
  );
}
