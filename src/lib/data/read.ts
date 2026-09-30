// Every read, written once against a Supabase client. Server code passes the anonymous or
// cookie client; the browser query factories pass the browser client (so the SW can cache
// public view GETs). RLS decides what a committee read returns.
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { CATEGORY_LABELS } from "./labels";
import * as map from "./map";
import type {
  ActivityItem,
  BackupStatus,
  PublicActivityItem,
  CommitteeAccount,
  ExpenseActivity,
  WalletType,
  ExpenseAdmin,
  FundAccountAdmin,
  FundSettings,
} from "./types";

export type Client = SupabaseClient<Database>;

export class DataError extends Error {
  constructor(
    readonly source: string,
    readonly cause: PostgrestError,
  ) {
    super(`[data] ${source}: ${cause.message}`);
  }
}

export function must<T>(source: string, res: { data: T; error: PostgrestError | null }): T {
  if (res.error) throw new DataError(source, res.error);
  return res.data;
}

export function many<T>(
  source: string,
  res: { data: T[] | null; error: PostgrestError | null },
): T[] {
  if (res.error) throw new DataError(source, res.error);
  return res.data ?? [];
}

/**
 * The API returns at most 1000 rows per request (Supabase max-rows). For lists that can grow past
 * that (the month grid: members × 12), read page by page. `page(from, to)` must keep a stable order.
 */
const PAGE = 1000;
export async function paged<T>(
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

/** Late months of years before `year` (paying last year's arrears after 1 January). */
export async function pastLateMonths(c: Client, year: number = thisYear()) {
  const rows = await paged("member_months", (from, to) =>
    c
      .from("member_months")
      .select("*")
      .lt("year", year)
      .eq("state", "late")
      .order("member_id")
      .order("year")
      .order("month")
      .range(from, to),
  );
  return rows.map(map.toMemberMonth);
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

/** All committee terms, oldest first (the open one last). */
export async function terms(c: Client) {
  return many("terms_public", await c.from("terms_public").select("*").order("number")).map(
    map.toTerm,
  );
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

/**
 * All expenses (also cancelled), newest first, with the receipt image path, the activity (m38),
 * the wallet or cash (m31) and who recorded it.
 */
export async function expensesAdmin(c: Client, limit = 100): Promise<ExpenseAdmin[]> {
  const [rows, people] = await Promise.all([
    c
      .from("expenses")
      .select("*, activity:expense_activities(name), wallet:fund_accounts(method, account_number)")
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit),
    c.from("committee").select("user_id, display_name"),
  ]);
  const names = new Map(many("committee", people).map((p) => [p.user_id, p.display_name]));
  return many("expenses", rows).map((r) => ({
    ...toExpenseAdmin(r),
    activityId: r.activity_id,
    activity: r.activity?.name ?? CATEGORY_LABELS[r.category],
    wallet: r.wallet ? { method: r.wallet.method, accountNumber: r.wallet.account_number } : null,
    paidInCash: r.paid_in_cash,
    recordedBy: r.created_by ? (names.get(r.created_by) ?? null) : null,
  }));
}

/** Every expense activity («النشاط», m38), in list order; retired ones too (history). */
export async function expenseActivities(c: Client): Promise<ExpenseActivity[]> {
  return many(
    "expense_activities",
    await c
      .from("expense_activities")
      .select("id, name, sort_order, active")
      .order("sort_order")
      .order("id"),
  ).map((a) => ({ id: a.id, name: a.name, sortOrder: a.sort_order, active: a.active }));
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
    canDelete: r.can_delete ?? false,
    notMember: r.not_member ?? false,
    needsMemberLink: r.needs_member_link ?? false,
  }));
}

/** The settings row (committee), with the opening balance and its date. */
export async function fundSettings(c: Client): Promise<FundSettings | null> {
  const r = must("settings", await c.from("settings").select("*").maybeSingle());
  return r
    ? {
        whatsappContact: r.whatsapp_contact,
        graceDays: r.grace_days,
        showAmountOwed: r.show_amount_owed,
        openingBalance: r.opening_balance,
        openingBalanceOn: r.opening_balance_on,
      }
    : null;
}

/** Last weekly backup run, or null before the first one. */
export async function backupStatus(c: Client): Promise<BackupStatus | null> {
  const r = must(
    "job_runs",
    await c.from("job_runs").select("*").eq("job", "backup").maybeSingle(),
  );
  return r
    ? { ok: r.ok, lastRunAt: r.last_run_at, lastOkAt: r.last_ok_at, detail: r.detail }
    : null;
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
    walletTypeId: r.wallet_type_id,
    opening:
      r.opening_balance !== null && r.opening_on
        ? { amount: r.opening_balance, on: r.opening_on }
        : null,
  }));
}

/** Every wallet («المحافظ», m41), in list order; stopped ones too (history). */
export async function walletTypes(c: Client): Promise<WalletType[]> {
  return many(
    "wallet_types",
    await c
      .from("wallet_types")
      .select(
        "id, name, logo_path, kind, sort_order, active, legacy_method, opening_balance, opening_on",
      )
      .order("sort_order")
      .order("id"),
  ).map((w) => ({
    id: w.id,
    name: w.name,
    logoPath: w.logo_path,
    kind: w.kind === "cash" ? "cash" : "wallet",
    sortOrder: w.sort_order,
    active: w.active,
    legacyMethod: w.legacy_method,
    opening:
      w.opening_balance !== null && w.opening_on
        ? { amount: w.opening_balance, on: w.opening_on }
        : null,
  }));
}

/* ───────────── amount-free public reads (m26: what strangers get) ───────────── */

export async function fundStats(c: Client) {
  return map.toFundStats(must("fund_stats", await c.from("fund_stats").select("*").maybeSingle()));
}

export async function membersPublic(c: Client) {
  return many(
    "member_status_public",
    await c.from("member_status_public").select("*").order("list_code").order("number"),
  ).map(map.toMemberStatusPublic);
}

export async function activityPublic(c: Client) {
  return many(
    "activity_public",
    await c.from("activity_public").select("*").order("at", { ascending: false }),
  )
    .map(map.toPublicActivityItem)
    .filter((a): a is PublicActivityItem => a !== null);
}

/** The newest `limit` confirmed payments and `limit` expenses, amount-free: enough for a short
 *  ledger (merge with toLedger, then keep `limit`). */
export async function ledgerPublic(c: Client, limit: number) {
  const [acts, exps] = await Promise.all([
    c
      .from("activity_public")
      .select("*")
      .eq("kind", "payment_confirmed")
      .order("at", { ascending: false })
      .limit(limit),
    c.from("expenses_public").select("*").order("spent_on", { ascending: false }).limit(limit),
  ]);
  return {
    activity: many("activity_public", acts)
      .map(map.toPublicActivityItem)
      .filter((a): a is PublicActivityItem => a !== null),
    expenses: many("expenses_public", exps).map(map.toExpensePublic),
  };
}

export async function campaignsPublic(c: Client) {
  return many("campaigns_public", await c.from("campaigns_public").select("*")).map(
    map.toCampaignPublic,
  );
}

export async function expensesPublic(c: Client) {
  return many("expenses_public", await c.from("expenses_public").select("*")).map(
    map.toExpensePublic,
  );
}

export async function termsInfo(c: Client) {
  return many("terms_info", await c.from("terms_info").select("*").order("number")).map(
    map.toTermInfo,
  );
}

export async function contributorsPublic(c: Client, campaignId: string, limit = 20) {
  return many(
    "campaign_contributors_public",
    await c
      .from("campaign_contributors_public")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("at", { ascending: false })
      .limit(limit),
  ).map(map.toContributorPublic);
}

/* ───────────── committee tools (m29–m30) ───────────── */

export type ActivityScope = "money" | "settings" | "all";

/**
 * «سجل العمليات»: newest first; pass the last id shown as `before` for the next page. `scope`
 * (m40): business actions by default, settings changes apart, or both.
 */
export async function activityLog(
  c: Client,
  before?: number,
  limit = 50,
  scope: ActivityScope = "money",
) {
  const rows = many(
    "activity_log",
    await c.rpc("activity_log", { p_before: before, p_limit: limit, p_scope: scope }),
  );
  return rows.map(map.toActivityEntry);
}

/** «دفعوا معه سابقًا»: members covered by the same past payments, most often first. */
export async function coPaidMembers(c: Client, memberId: string, limit = 5) {
  const rows = many(
    "co_paid_members",
    await c.rpc("co_paid_members", { p_member_id: memberId, p_limit: limit }),
  );
  return rows.map((r) => ({
    memberId: r.member_id,
    memberRef: r.member_ref,
    fullName: r.full_name,
    times: r.times,
    lastPaidOn: r.last_paid_on,
  }));
}

/** Levy shares (committee): one levy's members, or one member's levies. */
export async function levyShares(
  c: Client,
  filter: { campaignId?: string; memberId?: string } = {},
) {
  let q = c.from("levy_shares").select("*");
  if (filter.campaignId) q = q.eq("campaign_id", filter.campaignId);
  if (filter.memberId) q = q.eq("member_id", filter.memberId);
  return many("levy_shares", await q.order("member_ref")).map(map.toLevyShare);
}

/** «الفئات»: every group with its fee this year and next, members now, retired year (m33). */
/**
 * The accuracy audit (m35): every figure the app shows recomputed from the base tables, one row
 * per check. `ok: false` means a wrong number somewhere (counts only, no names).
 */
export async function accuracyAudit(c: Client) {
  return many("accuracy_audit", await c.rpc("accuracy_audit")).map((r) => ({
    check: r.check_name,
    ok: r.ok === true,
    detail: r.detail ?? "",
  }));
}

export async function groupsOverview(c: Client, year: number) {
  return many("groups_overview", await c.rpc("groups_overview", { p_year: year })).map((g) => ({
    code: g.code,
    name: g.name,
    fee: g.fee ?? null,
    nextYearFee: g.next_year_fee ?? null,
    members: g.members,
    retiredFrom: g.retired_from ?? null,
  }));
}
