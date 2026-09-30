"use server";
// Report data for the committee screens, asked when a report is opened or shared.
import * as src from "@/components/app/source";
import { memberCtx } from "@/components/app/page-data";

export async function loadReportData(q: src.ReportReq): Promise<src.ReportRes | null> {
  if (!(await src.anyCommitteeSession())) return null;
  return src.reportFor(q);
}

/** Record sheet: people paid together with this member before, most often first. */
export async function coPaidMembers(memberId: string) {
  if (!(await src.anyCommitteeSession())) return [];
  return src.coPaid(memberId);
}

/** «المزيد»: how many old payments still wait for a confirmation (0 once all are done). */
export async function legacyPendingCount(): Promise<number> {
  if (!(await src.anyCommitteeSession())) return 0;
  return (await src.pendingPayments()).filter((p) => p.status === "pending").length;
}

/** The member sheets («عضو جديد», «تعديل البيانات»): what they need, asked when opened. */
export async function memberAdminData() {
  const s = await src.anyCommitteeSession();
  if (!s) return null;
  const [members, prices, arrears, rows, ctx] = await Promise.all([
    src.membersAdmin(),
    src.groupPrices(),
    src.arrears(),
    src.memberRows(),
    memberCtx(),
  ]);
  const t = src.today();
  return {
    admin: s.role === "admin",
    members,
    prices,
    months: Object.fromEntries(rows.map((r) => [r.memberId, r.months])),
    credit: Object.fromEntries(
      arrears
        .filter((a) => a.credit > 0)
        .map((a) => [a.memberId, { amount: a.credit, months: a.months }]),
    ),
    monthsCtx: { year: ctx.year, dueMonth: ctx.dueMonth },
    thisMonth: `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`,
  };
}

/** The campaign edit sheet: the campaign as the old form expects it, and its pending count. */
export async function campaignForEdit(id: string) {
  if (!(await src.anyCommitteeSession())) return null;
  const [campaigns, pending] = await Promise.all([src.moneyCampaigns(), src.pendingPayments()]);
  const c = campaigns.find((x) => x.campaignId === id) ?? null;
  const pendingCount = pending.filter(
    (p) =>
      p.status === "pending" &&
      p.allocations.some((a) => a.kind === "campaign" && a.campaignId === id),
  ).length;
  return c && { campaign: c, pendingCount };
}
