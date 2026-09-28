// Every read, written once against a Supabase client. Server code passes the anonymous or
// cookie client; the browser query factories pass the browser client (so the SW can cache
// public view GETs). RLS decides what a committee read returns.
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import * as map from "./map";
import type { ActivityItem, CommitteeAccount, ExpenseAdmin, FundAccountAdmin } from "./types";

export type Client = SupabaseClient<Database>;

export class DataError extends Error {
  constructor(
    readonly source: string,
    readonly cause: PostgrestError,
  ) {
    super(`[data] ${source}: ${cause.message}`);
  }
}

function must<T>(source: string, res: { data: T; error: PostgrestError | null }): T {
  if (res.error) throw new DataError(source, res.error);
  return res.data;
}

function many<T>(source: string, res: { data: T[] | null; error: PostgrestError | null }): T[] {
  if (res.error) throw new DataError(source, res.error);
  return res.data ?? [];
}

/**
 * The API returns at most 1000 rows per request (Supabase max-rows). For lists that can grow past
 * that (the month grid: members × 12), read page by page. `page(from, to)` must keep a stable order.
 */
const PAGE = 1000;
async function paged<T>(
  source: string,
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const chunk = many(source, await page(from, from + PAGE - 1));
    rows.push(...chunk);
    if (chunk.length < PAGE) return rows;
  }
}

const thisYear = () => new Date().getFullYear();

/* ───────────── public views ───────────── */

export async function fundSummary(c: Client) {
  return map.toFundSummary(
    must("fund_summary", await c.from("fund_summary").select("*").maybeSingle()),
  );
}

/** Monthly fee per group for a year (default: this year), A then B. */
export async function groupPrices(c: Client, year: number = thisYear()) {
  return many(
    "group_prices_public",
    await c.from("group_prices_public").select("*").eq("year", year).order("group_code"),
  ).map(map.toGroupPrice);
}

export async function members(c: Client) {
  return many(
    "member_status",
    await c.from("member_status").select("*").order("list_code").order("number"),
  ).map(map.toMemberStatus);
}

/**
 * Public late list, most months behind first. `amountOwed` stays null unless the admin turned
 * on settings.show_amount_owed (the database decides).
 */
export async function lateMembers(c: Client) {
  return many(
    "member_status",
    await c
      .from("member_status")
      .select("*")
      .eq("member_status", "active")
      .gt("months_behind", 0)
      .order("months_behind", { ascending: false })
      .order("number"),
  ).map(map.toMemberStatus);
}

/** Month grid of every member for one year (default: this year). */
export async function memberMonths(c: Client, year: number = thisYear()) {
  const rows = await paged("member_months", (from, to) =>
    c
      .from("member_months")
      .select("*")
      .eq("year", year)
      .order("member_id")
      .order("month")
      .range(from, to),
  );
  return rows.map(map.toMemberMonth);
}

/** One member's months, all years. */
export async function memberMonthsOf(c: Client, memberId: string) {
  return many(
    "member_months",
    await c
      .from("member_months")
      .select("*")
      .eq("member_id", memberId)
      .order("year")
      .order("month"),
  ).map(map.toMemberMonth);
}

export async function monthlyCollection(c: Client, year: number = thisYear()) {
  return many(
    "monthly_collection",
    await c.from("monthly_collection").select("*").eq("year", year).order("month"),
  ).map(map.toMonthlyCollection);
}

export async function expenseTotals(c: Client) {
  return many("expense_totals", await c.from("expense_totals").select("*").order("year")).map(
    map.toExpenseTotal,
  );
}

export async function recentExpenses(c: Client) {
  return many("recent_expenses", await c.from("recent_expenses").select("*")).map(map.toExpense);
}

export async function campaigns(c: Client) {
  return many("campaign_progress", await c.from("campaign_progress").select("*")).map(
    map.toCampaignProgress,
  );
}

export async function activity(c: Client) {
  return many(
    "activity_feed",
    await c.from("activity_feed").select("*").order("at", { ascending: false }),
  )
    .map(map.toActivityItem)
    .filter((a): a is ActivityItem => a !== null);
}

/** Latest confirmed contributions to one campaign, newest first. */
export async function campaignContributions(c: Client, campaignId: string, limit = 20) {
  return many(
    "campaign_contributions",
    await c
      .from("campaign_contributions")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("at", { ascending: false })
      .limit(limit),
  ).map(map.toCampaignContribution);
}

/** Public receipt check for /r/[code]. */
export async function verifyReceipt(c: Client, code: string) {
  const clean = code.trim().toUpperCase();
  if (!/^BQ-[A-Z]{4}-[0-9]{4}$/.test(clean)) return map.toVerifiedReceipt(null);
  return map.toVerifiedReceipt(
    must("verify_receipt", await c.rpc("verify_receipt", { p_code: clean })),
  );
}

/** All committee terms, oldest first (the open one last). */
export async function terms(c: Client) {
  return many("terms_public", await c.from("terms_public").select("*").order("number")).map(
    map.toTerm,
  );
}

/** The open term, or null before the terms migration. */
export async function currentTerm(c: Client) {
  return (await terms(c)).find((t) => t.endedOn === null) ?? null;
}

export async function fundAccounts(c: Client) {
  return many("fund_accounts_public", await c.from("fund_accounts_public").select("*")).map(
    map.toFundAccount,
  );
}

export async function fundInfo(c: Client) {
  return map.toFundInfo(must("fund_info", await c.from("fund_info").select("*").maybeSingle()));
}

/* ───────────── committee (RLS: active committee only) ───────────── */

/** Pending payments, oldest first (the queue to confirm). */
export async function pendingPayments(c: Client) {
  return many(
    "payment_queue",
    await c.from("payment_queue").select("*").eq("status", "pending").order("created_at"),
  ).map(map.toPendingPayment);
}

/** Latest payments of any status, newest first. */
export async function recentPayments(c: Client, limit = 50) {
  return many(
    "payment_queue",
    await c
      .from("payment_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
  ).map(map.toPendingPayment);
}

/** Every payment of any status, oldest first (committee CSV export; paged past 1000 rows). */
export async function allPayments(c: Client) {
  const rows = await paged("payment_queue", (from, to) =>
    c.from("payment_queue").select("*").order("created_at").order("id").range(from, to),
  );
  return rows.map(map.toPendingPayment);
}

export async function paymentById(c: Client, id: string) {
  const row = must(
    "payment_queue",
    await c.from("payment_queue").select("*").eq("id", id).maybeSingle(),
  );
  return row ? map.toPendingPayment(row) : null;
}

export async function arrears(c: Client) {
  return many(
    "arrears",
    await c
      .from("arrears")
      .select("*")
      .order("months_count", { ascending: false })
      .order("amount_owed", { ascending: false })
      .order("number"),
  ).map(map.toArrear);
}

/** All expenses (also cancelled), newest first, with the receipt image path. */
export async function expensesAdmin(c: Client, limit = 100): Promise<ExpenseAdmin[]> {
  const rows = many(
    "expenses",
    await c
      .from("expenses")
      .select("*")
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  return rows.map(toExpenseAdmin);
}

function toExpenseAdmin(r: Database["public"]["Tables"]["expenses"]["Row"]): ExpenseAdmin {
  return {
    id: r.id,
    spentOn: r.spent_on,
    category: r.category,
    amount: r.amount,
    note: r.note,
    campaignId: r.campaign_id,
    receiptPath: r.receipt_path,
    createdAt: r.created_at,
    cancelledAt: r.cancelled_at,
    cancelReason: r.cancel_reason,
  };
}

/** Every expense (also cancelled), oldest first (committee CSV export; paged). */
export async function allExpenses(c: Client): Promise<ExpenseAdmin[]> {
  const rows = await paged("expenses", (from, to) =>
    c
      .from("expenses")
      .select("*")
      .order("spent_on")
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  return rows.map(toExpenseAdmin);
}

/** Every member (any status) with phone, current group and status, by list then number. */
export async function membersAdmin(c: Client) {
  return many(
    "members_admin",
    await c.from("members_admin").select("*").order("list_code").order("number"),
  ).map(map.toMemberAdmin);
}

/** Handovers, newest first (the active draft/submitted one, then history). */
export async function handovers(c: Client) {
  return many(
    "handovers_admin",
    await c.from("handovers_admin").select("*").order("started_at", { ascending: false }),
  ).map(map.toHandover);
}

export async function handoverById(c: Client, id: string) {
  const row = must(
    "handovers_admin",
    await c.from("handovers_admin").select("*").eq("id", id).maybeSingle(),
  );
  return row ? map.toHandover(row) : null;
}

/** Committee accounts with their login (admin only; others get an empty list). */
export async function committeeAccounts(c: Client): Promise<CommitteeAccount[]> {
  return many("committee_accounts", await c.from("committee_accounts").select("*")).map((r) => ({
    userId: r.user_id ?? "",
    displayName: r.display_name ?? "",
    role: r.role ?? "committee",
    active: r.active ?? false,
    memberId: r.member_id,
    login: r.login ?? "",
    lastSignInAt: r.last_sign_in_at,
    createdAt: r.created_at ?? "",
  }));
}

export async function fundAccountsAdmin(c: Client): Promise<FundAccountAdmin[]> {
  const rows = many(
    "fund_accounts",
    await c
      .from("fund_accounts")
      .select("*")
      .order("active", { ascending: false })
      .order("sort_order"),
  );
  return rows.map((r) => ({
    id: r.id,
    method: r.method,
    accountNumber: r.account_number,
    holderName: r.holder_name,
    sortOrder: r.sort_order,
    active: r.active,
    note: r.note,
  }));
}
