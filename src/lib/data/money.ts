import "server-only";
// Money privacy (docs/MONEY-PRIVACY.md): money figures only for the committee (its own session,
// guarded by RLS / can_see_money) and for a member with their link (our server checks the cookie,
// then reads with the secret key). Strangers get null and the UI shows «•••». Nothing here is
// cached across requests: pages calling these render per request.
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCommitteeSession } from "./committee";
import { memberSession } from "./member";
import * as read from "./read";
import { loadReport, type ReportOptions } from "./report";
import type { CampaignContribution, MoneyBundle, ReportData } from "./types";

type Viewer = { viewer: MoneyBundle["viewer"]; client: read.Client };

/** Who may see money on this request, with the client to read it: committee first, then member. */
export async function moneyViewer(): Promise<Viewer | null> {
  if (await getCommitteeSession()) {
    const client = await createClient();
    if (client) return { viewer: "committee", client };
  }
  if (await memberSession()) {
    const client = tryCreateAdminClient();
    if (client) return { viewer: "member", client };
  }
  return null;
}

/** Every money figure for the home, accounts, report and donations pages; null for strangers. */
export async function getMoney(opts: { year?: number } = {}): Promise<MoneyBundle | null> {
  const v = await moneyViewer();
  if (!v) return null;
  const year = opts.year ?? new Date().getUTCFullYear();
  const [summary, monthly, expenseTotals, expenses, campaigns, activity, terms, info, members] =
    await Promise.all([
      read.fundSummary(v.client),
      read.monthlyCollection(v.client, year),
      read.expenseTotals(v.client),
      read.recentExpenses(v.client),
      read.campaigns(v.client),
      read.activity(v.client),
      read.terms(v.client),
      read.fundInfo(v.client),
      read.members(v.client),
    ]);
  const amountOwed = info.showAmountOwed
    ? Object.fromEntries(
        members
          .filter((m) => m.amountOwed !== null)
          .map((m) => [m.memberId, m.amountOwed as number]),
      )
    : null;
  return {
    viewer: v.viewer,
    year,
    summary,
    monthly,
    expenseTotals,
    expenses,
    campaigns,
    activity,
    terms,
    amountOwed,
  };
}

/** The full report (with money) for the committee or a member; null for strangers (use getReportShell). */
export async function getReportForViewer(opts: ReportOptions = {}): Promise<ReportData | null> {
  const v = await moneyViewer();
  return v ? loadReport(v.client, opts) : null;
}

/** A campaign's contributions with amounts; null for strangers (use getContributorsPublic). */
export async function getMoneyContributions(
  campaignId: string,
  limit = 20,
): Promise<CampaignContribution[] | null> {
  const v = await moneyViewer();
  return v ? read.campaignContributions(v.client, campaignId, limit) : null;
}
