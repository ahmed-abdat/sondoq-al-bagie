import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { toFundInfo, toFundSummary } from "./map";
import * as read from "./read";
import { toMemberIndex, toMemberRows } from "./member-lists";
import { assembleReport, loadReport, type ReportOptions } from "./report";
import { PUBLIC_TAG } from "./tags";

/**
 * Public data for Server Components. Same for every visitor, so it is cached on the server for
 * 60 s under the "public" tag; committee actions expire it at once (updateTag) after a write.
 * When Supabase is not configured the page still renders with empty data.
 */
function cached<A extends unknown[], R>(
  name: string,
  fn: (c: read.Client, ...args: A) => Promise<R>,
  empty: R,
) {
  return unstable_cache(
    async (...args: A): Promise<R> => {
      const c = createPublicClient();
      return c ? fn(c, ...args) : empty;
    },
    ["public", name],
    { tags: [PUBLIC_TAG], revalidate: 60 },
  );
}

export const getFundSummary = cached("fund_summary", read.fundSummary, toFundSummary(null));
export const getGroupPrices = cached("group_prices", read.groupPrices, []);
export const getMembers = cached("member_status", read.members, []);
export const getLateMembers = cached("late_members", read.lateMembers, []);
export const getMemberMonths = cached("member_months", read.memberMonths, []);
export const getMemberMonthsOf = cached("member_months_of", read.memberMonthsOf, []);
export const getMonthlyCollection = cached("monthly_collection", read.monthlyCollection, []);
export const getExpenseTotals = cached("expense_totals", read.expenseTotals, []);
export const getRecentExpenses = cached("recent_expenses", read.recentExpenses, []);
export const getCampaigns = cached("campaign_progress", read.campaigns, []);
export const getActivity = cached("activity_feed", read.activity, []);
export const getCampaignContributions = cached(
  "campaign_contributions",
  read.campaignContributions,
  [],
);
/** Receipt check for /r/[code] (cached per code; a cancellation expires it). */
export const getReceipt = cached("verify_receipt", read.verifyReceipt, {
  status: "not_found",
} as const);
export const getTerms = cached("terms", read.terms, []);
export const getCurrentTerm = cached("current_term", read.currentTerm, null);
export const getFundAccounts = cached("fund_accounts_public", read.fundAccounts, []);
export const getFundInfo = cached("fund_info", read.fundInfo, toFundInfo(null));

const cachedReport = unstable_cache(
  async (opts: ReportOptions) => {
    const c = createPublicClient();
    return c ? loadReport(c, opts) : null;
  },
  ["public", "report"],
  { tags: [PUBLIC_TAG], revalidate: 60 },
);

/**
 * The shareable fund report (public data only): summary, term, monthly collection, member grid,
 * expenses of the year, campaigns. Default: this year and the open term.
 */
export async function getReport(opts: ReportOptions = {}) {
  const now = new Date();
  return (
    (await cachedReport({ year: opts.year, term: opts.term })) ??
    assembleReport({
      year: opts.year ?? now.getUTCFullYear(),
      term: opts.term,
      summary: toFundSummary(null),
      terms: [],
      monthly: [],
      members: [],
      months: [],
      expenses: [],
      campaigns: [],
      info: toFundInfo(null),
      prices: [],
      now,
    })
  );
}

/**
 * /members list: every listed member (not the ones who left) with this year's months as a
 * 12-letter code. Replaces getMembers() + getMemberMonths() on public pages (~12 bytes of months
 * per member instead of 12 objects).
 */
export const getMemberRows = cached(
  "member_rows",
  async (c: read.Client, year: number = new Date().getUTCFullYear()) => {
    const [members, months] = await Promise.all([read.members(c), read.memberMonths(c, year)]);
    return toMemberRows(members, months, year);
  },
  [],
);

/**
 * Home: search index (id, ref, name, status) and the counts «دفع X من N» for a month
 * (default: this month, UTC).
 */
export const getMemberIndex = cached(
  "member_index",
  async (c: read.Client, year?: number, month?: number) => {
    const now = new Date();
    const y = year ?? now.getUTCFullYear();
    const m = month ?? now.getUTCMonth() + 1;
    const [members, months] = await Promise.all([read.members(c), read.memberMonths(c, y)]);
    return toMemberIndex(members, months, y, m);
  },
  { members: [], activeCount: 0, paidThisMonth: 0, year: 0, month: 0 },
);
