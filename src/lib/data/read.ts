// Every read, written once against a Supabase client. Server code passes the anonymous or
// cookie client; the browser query factories pass the browser client (so the SW can cache
// public view GETs). RLS decides what a committee read returns.
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import * as map from "./map";
import type { ActivityItem, FundAccountAdmin } from "./types";

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

const thisYear = () => new Date().getFullYear();

/* ───────────── public views ───────────── */

export async function fundSummary(c: Client) {
  return map.toFundSummary(
    must("fund_summary", await c.from("fund_summary").select("*").maybeSingle()),
  );
}

export async function members(c: Client) {
  return many("member_status", await c.from("member_status").select("*").order("number")).map(
    map.toMemberStatus,
  );
}

/** Month grid of every member for one year (default: this year). */
export async function memberMonths(c: Client, year: number = thisYear()) {
  return many(
    "member_months",
    await c.from("member_months").select("*").eq("year", year).order("member_id").order("month"),
  ).map(map.toMemberMonth);
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
    await c.from("arrears").select("*").order("months_count", { ascending: false }).order("number"),
  ).map(map.toArrear);
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
