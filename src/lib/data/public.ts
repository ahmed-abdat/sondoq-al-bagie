import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { toFundInfo, toFundSummary } from "./map";
import * as read from "./read";
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
export const getMembers = cached("member_status", read.members, []);
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
export const getFundAccounts = cached("fund_accounts_public", read.fundAccounts, []);
export const getFundInfo = cached("fund_info", read.fundInfo, toFundInfo(null));
