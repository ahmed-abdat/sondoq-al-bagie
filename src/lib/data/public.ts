import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { toFundInfo, toFundStats } from "./map";
import * as read from "./read";
import { EMPTY_MEMBER_INDEX, loadMemberIndex, loadMemberRows } from "./member-lists";
import { loadReportShell, type ReportOptions } from "./report";
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

export const getGroupPrices = cached("group_prices", read.groupPrices, []);
/** Member cards without amounts owed (member_status_public; amounts only via getMoney). */
export const getMembers = cached("member_status_public", read.membersPublic, []);
export const getMemberMonths = cached("member_months", read.memberMonths, []);
/** Receipt check for /r/[code] (cached per code; a cancellation expires it). */
export const getReceipt = cached("verify_receipt", read.verifyReceipt, {
  status: "not_found",
} as const);
export const getFundAccounts = cached("fund_accounts_public", read.fundAccounts, []);
export const getFundInfo = cached("fund_info", read.fundInfo, toFundInfo(null));

/**
 * /members list: every listed member (not the ones who left) with this year's months as a
 * 12-letter code, last years' late months and the month prices that differ from the group price
 * (the record screen prices each month with them). Replaces getMembers() + getMemberMonths() on public pages (~12 bytes of months
 * per member instead of 12 objects).
 */
export const getMemberRows = cached("member_rows", loadMemberRows, []);

/**
 * Home: search index (id, ref, name, status) and the counts «دفع X من N» for a month
 * (default: this month, UTC).
 */
export const getMemberIndex = cached("member_index", loadMemberIndex, EMPTY_MEMBER_INDEX);

/* ───────────── amount-free public reads (money privacy: what strangers get) ───────────── */

export const getFundStats = cached("fund_stats", read.fundStats, toFundStats(null));
export const getActivityPublic = cached("activity_public", read.activityPublic, []);
/** Home: the newest `limit` payments and expenses, amount-free (not the whole feed). */
export const getLedgerPublic = cached(
  "ledger_public",
  (c: read.Client, limit: number = 3) => read.ledgerPublic(c, limit),
  { activity: [], expenses: [] },
);
export const getCampaignsPublic = cached("campaigns_public", read.campaignsPublic, []);
export const getExpensesPublic = cached("expenses_public", read.expensesPublic, []);
export const getTermsInfo = cached("terms_info", read.termsInfo, []);
export const getContributorsPublic = cached(
  "campaign_contributors_public",
  (c: read.Client, campaignId: string, limit?: number) =>
    read.contributorsPublic(c, campaignId, limit),
  [],
);

/** The report for strangers and link previews: grid and structure, no money. */
export const getReportShell = cached(
  "report_shell",
  (c: read.Client, opts: ReportOptions = {}) => loadReportShell(c, opts),
  null,
);
