/**
 * Shapes the UI codes against. Money is integer MRO everywhere (show MRU with src/lib/money.ts).
 * Dates are ISO strings: `YYYY-MM-DD` for days, full ISO for timestamps.
 * The data layer maps the (all-nullable) generated view rows into these non-null shapes.
 */
import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

export type MembershipStatus = Enums["membership_status"];
export type PaymentStatus = Enums["payment_status"];
export type ExpenseCategory = Enums["expense_category"];
export type CampaignStatus = Enums["campaign_status"];
export type CampaignMode = Enums["campaign_mode"];
export type CommitteeRole = Enums["committee_role"];
/** Same ids as `Method` in src/lib/methods.ts. */
export type PaymentMethod = Enums["payment_method"];

/** Main fund totals (public). */
export type FundSummary = {
  openingBalance: number;
  moneyIn: number;
  moneyOut: number;
  transfersIn: number;
  balance: number;
  collectedThisYear: number;
  spentThisYear: number;
  membersOk: number;
  membersBehind: number;
  lastActivityAt: string | null;
};

/** «الرسوم الشهرية» of one group for one year (MRO per month). */
export type GroupPrice = { year: number; group: string; groupName: string; monthlyAmount: number };

/** One member card (public: no phone). `amountOwed` is null unless the admin turned it on. */
export type MemberStatus = {
  memberId: string;
  number: number;
  fullName: string;
  groupCode: string;
  status: MembershipStatus;
  monthsPaidThisYear: number;
  monthsBehind: number;
  /** 'منتظم' | 'متأخر' */
  statusLabel: string;
  amountOwed: number | null;
};

/** paid · late (due and unpaid) · upcoming (not due yet) · not_owed (exempt/away/left/deceased). */
export type MonthState = "paid" | "late" | "upcoming" | "not_owed";

export type MemberMonth = { memberId: string; year: number; month: number; state: MonthState };

/** «ما جُمع كل شهر»: expected from active members vs collected. */
export type MonthlyCollection = {
  year: number;
  month: number;
  expected: number;
  collected: number;
};

export type ExpenseTotal = { year: number; category: ExpenseCategory; total: number };

export type Expense = {
  id: string;
  spentOn: string;
  category: ExpenseCategory;
  amount: number;
  note: string | null;
  /** null = paid from the main fund */
  campaignId: string | null;
};

/** Committee view of an expense: includes cancelled ones and the receipt image path. */
export type ExpenseAdmin = Expense & {
  receiptPath: string | null;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
};

export type CampaignProgress = {
  campaignId: string;
  title: string;
  purpose: string | null;
  targetAmount: number | null;
  deadline: string | null;
  status: CampaignStatus;
  amountMode: CampaignMode;
  collected: number;
  spent: number;
  transferred: number;
  balance: number;
  participants: number;
  participantsPaid: number;
};

export type ActivityItem =
  | {
      kind: "payment_confirmed";
      at: string;
      paymentId: string;
      memberNames: string;
      months: number;
      amount: number;
      method: PaymentMethod;
      /** verification code for /r/[code]; null for old payments confirmed before receipts existed */
      receiptCode: string | null;
    }
  | { kind: "expense"; at: string; amount: number; category: ExpenseCategory }
  | { kind: "campaign_opened"; at: string; targetAmount: number | null };

/** «آخر المساهمات» of a campaign (public). */
export type CampaignContribution = {
  paymentId: string;
  campaignId: string;
  at: string;
  /** member name, or the payer's name for an outside donor */
  contributorName: string;
  amount: number;
};

/** Wallet number members send money to. The public list holds active ones only. */
export type FundAccount = {
  id: string;
  method: PaymentMethod;
  accountNumber: string;
  holderName: string;
  sortOrder: number;
  active: boolean;
};

/** Admin view of a fund account (includes inactive ones). */
export type FundAccountAdmin = FundAccount & { note: string | null };

/** Public fund settings. */
export type FundInfo = {
  /** Committee WhatsApp number for transfer screenshots, e.g. "+22233334444"; null = not set. */
  whatsappContact: string | null;
  graceDays: number;
  showAmountOwed: boolean;
};

/* ───────────── committee only ───────────── */

export type Allocation =
  | {
      kind: "months";
      memberId: string;
      number: number;
      fullName: string;
      year: number;
      month: number;
      amount: number;
    }
  | {
      kind: "campaign";
      campaignId: string;
      memberId: string | null;
      number: number | null;
      fullName: string | null;
      amount: number;
    }
  | { kind: "credit"; memberId: string; number: number; fullName: string; amount: number };

/** A payment in the committee queue/history (pending ones need confirm/reject). */
export type PendingPayment = {
  id: string;
  status: PaymentStatus;
  payerName: string;
  method: PaymentMethod;
  amount: number;
  paidOn: string;
  txnRef: string | null;
  /** object path in the private `proofs` bucket; get a signed URL from the data layer */
  proofPath: string | null;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  allocations: Allocation[];
  /** set once confirmed (not for paper imports) */
  receiptCode: string | null;
  /** e.g. "2026-0042" */
  receiptNo: string | null;
};

/** Committee arrears row (has the phone for WhatsApp). */
export type Arrear = {
  memberId: string;
  number: number;
  fullName: string;
  phone: string | null;
  groupCode: string;
  status: MembershipStatus;
  /** 'YYYY-MM' strings */
  months: string[];
  monthsCount: number;
  amountOwed: number;
  credit: number;
  lastRemindedAt: string | null;
};

/** Signed-in committee member, for the UI (null when signed out). */
export type CommitteeSession = {
  userId: string;
  email: string | null;
  displayName: string;
  role: CommitteeRole;
  memberId: string | null;
};

/* ───────────── receipts (/r/[code]) ───────────── */

export type VerifiedReceipt =
  | { status: "not_found" }
  | {
      status: "valid" | "cancelled";
      code: string;
      /** printed receipt number, e.g. 2026-0042 */
      receiptNo: string;
      payerName: string;
      amount: number;
      method: PaymentMethod;
      paidOn: string;
      confirmedAt: string;
      confirmedByName: string | null;
      confirmedByRole: CommitteeRole | null;
      /** last 4 characters of the wallet transaction number, if any */
      txnRefLast4: string | null;
      members: { number: number; fullName: string; months: { year: number; month: number }[] }[];
      campaignTitles: string[];
    };

/* ───────────── action results ───────────── */

/** Every server action returns this. `message` is Arabic, ready to show. */
export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; code: string; message: string };
