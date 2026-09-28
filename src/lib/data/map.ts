// Generated view rows are all-nullable; these map them into the non-null shapes in ./types.
// Pure functions (unit tested), shared by server reads and browser query factories.
import type { Database } from "@/lib/supabase/database.types";
import type {
  ActivityItem,
  Allocation,
  Arrear,
  CampaignProgress,
  Expense,
  ExpenseTotal,
  FundAccount,
  FundInfo,
  FundSummary,
  MemberMonth,
  MemberStatus,
  MonthlyCollection,
  MonthState,
  PendingPayment,
} from "./types";

type Row<V extends keyof Database["public"]["Views"]> = Database["public"]["Views"][V]["Row"];

const num = (v: number | null | undefined) => v ?? 0;
const str = (v: string | null | undefined) => v ?? "";

export function toFundSummary(r: Row<"fund_summary"> | null | undefined): FundSummary {
  return {
    openingBalance: num(r?.opening_balance),
    moneyIn: num(r?.money_in),
    moneyOut: num(r?.money_out),
    transfersIn: num(r?.transfers_in),
    balance: num(r?.balance),
    collectedThisYear: num(r?.collected_this_year),
    spentThisYear: num(r?.spent_this_year),
    membersOk: num(r?.members_ok),
    membersBehind: num(r?.members_behind),
    lastActivityAt: r?.last_activity_at ?? null,
  };
}

export function toMemberStatus(r: Row<"member_status">): MemberStatus {
  return {
    memberId: str(r.member_id),
    number: num(r.number),
    fullName: str(r.full_name),
    groupCode: str(r.group_code),
    status: r.member_status ?? "active",
    monthsPaidThisYear: num(r.months_paid_this_year),
    monthsBehind: num(r.months_behind),
    statusLabel: str(r.status_label),
    amountOwed: r.amount_owed,
  };
}

const MONTH_STATES: readonly MonthState[] = ["paid", "late", "upcoming", "not_owed"];

export function toMemberMonth(r: Row<"member_months">): MemberMonth {
  const state = MONTH_STATES.find((s) => s === r.state) ?? "upcoming";
  return { memberId: str(r.member_id), year: num(r.year), month: num(r.month), state };
}

export function toMonthlyCollection(r: Row<"monthly_collection">): MonthlyCollection {
  return {
    year: num(r.year),
    month: num(r.month),
    expected: num(r.expected),
    collected: num(r.collected),
  };
}

export function toExpenseTotal(r: Row<"expense_totals">): ExpenseTotal {
  return { year: num(r.year), category: r.category ?? "other", total: num(r.total) };
}

export function toExpense(r: Row<"recent_expenses">): Expense {
  return {
    id: str(r.id),
    spentOn: str(r.spent_on),
    category: r.category ?? "other",
    amount: num(r.amount),
    note: r.note,
    campaignId: r.campaign_id,
  };
}

export function toCampaignProgress(r: Row<"campaign_progress">): CampaignProgress {
  return {
    campaignId: str(r.campaign_id),
    title: str(r.title),
    purpose: r.purpose,
    targetAmount: r.target_amount,
    deadline: r.deadline,
    status: r.status ?? "open",
    amountMode: r.amount_mode ?? "open",
    collected: num(r.collected),
    spent: num(r.spent),
    transferred: num(r.transferred),
    balance: num(r.balance),
    participants: num(r.participants),
    participantsPaid: num(r.participants_paid),
  };
}

/** Unknown kinds (a newer database) are dropped rather than shown wrong. */
export function toActivityItem(r: Row<"activity_feed">): ActivityItem | null {
  const at = str(r.at);
  switch (r.kind) {
    case "payment_confirmed":
      return { kind: r.kind, at, memberNames: str(r.member_names), months: num(r.months) };
    case "expense":
      return { kind: r.kind, at, amount: num(r.amount), category: r.category ?? "other" };
    case "campaign_opened":
      return { kind: r.kind, at, targetAmount: r.amount };
    default:
      return null;
  }
}

export function toFundAccount(r: Row<"fund_accounts_public">): FundAccount {
  return {
    id: str(r.id),
    method: r.method ?? "other",
    accountNumber: str(r.account_number),
    holderName: str(r.holder_name),
    sortOrder: num(r.sort_order),
  };
}

export function toFundInfo(r: Row<"fund_info"> | null | undefined): FundInfo {
  return {
    whatsappContact: r?.whatsapp_contact ?? null,
    graceDays: r?.grace_days ?? 10,
    showAmountOwed: r?.show_amount_owed ?? false,
  };
}

type RawAllocation = {
  kind?: string;
  member_id?: string | null;
  number?: number | null;
  full_name?: string | null;
  campaign_id?: string | null;
  year?: number | null;
  month?: number | null;
  amount?: number | null;
};

export function toAllocation(a: RawAllocation): Allocation | null {
  const amount = num(a.amount);
  switch (a.kind) {
    case "months":
      return {
        kind: "months",
        memberId: str(a.member_id),
        number: num(a.number),
        fullName: str(a.full_name),
        year: num(a.year),
        month: num(a.month),
        amount,
      };
    case "campaign":
      return {
        kind: "campaign",
        campaignId: str(a.campaign_id),
        memberId: a.member_id ?? null,
        number: a.number ?? null,
        fullName: a.full_name ?? null,
        amount,
      };
    case "credit":
      return {
        kind: "credit",
        memberId: str(a.member_id),
        number: num(a.number),
        fullName: str(a.full_name),
        amount,
      };
    default:
      return null;
  }
}

export function toPendingPayment(r: Row<"payment_queue">): PendingPayment {
  const raw = Array.isArray(r.allocations) ? (r.allocations as RawAllocation[]) : [];
  return {
    id: str(r.id),
    status: r.status ?? "pending",
    payerName: str(r.payer_name),
    method: r.method ?? "other",
    amount: num(r.amount),
    paidOn: str(r.paid_on),
    txnRef: r.txn_ref,
    proofPath: r.proof_path,
    note: r.note,
    createdAt: str(r.created_at),
    createdByName: r.created_by_name,
    decidedAt: r.decided_at,
    decidedByName: r.decided_by_name,
    rejectReason: r.reject_reason,
    cancelReason: r.cancel_reason,
    allocations: raw.map(toAllocation).filter((a): a is Allocation => a !== null),
  };
}

export function toArrear(r: Row<"arrears">): Arrear {
  return {
    memberId: str(r.member_id),
    number: num(r.number),
    fullName: str(r.full_name),
    phone: r.phone,
    groupCode: str(r.group_code),
    status: r.member_status ?? "active",
    months: r.months ?? [],
    monthsCount: num(r.months_count),
    amountOwed: num(r.amount_owed),
    credit: num(r.credit),
    lastRemindedAt: r.last_reminded_at,
  };
}
