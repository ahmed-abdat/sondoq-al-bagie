"use server";
// Report data for the committee screens, asked when a report is opened or shared.
import * as src from "@/components/app/source";

export async function loadReportData(q: src.ReportReq): Promise<src.ReportRes | null> {
  if (!(await src.anyCommitteeSession())) return null;
  return src.reportFor(q);
}

/** Record sheet: people paid together with this member before, most often first. */
export async function coPaidMembers(memberId: string) {
  if (!(await src.anyCommitteeSession())) return [];
  return src.coPaid(memberId);
}
