// The data of the 10 committee reports (docs/COMMITTEE-ONLY-PLAN.md §9), agreed with Lane B, who
// renders them. Loaders are in ./reports. Money is integer MRO (the renderer shows MRU ×10),
// dates are ISO yyyy-mm-dd, names are already resolved. Types only: safe to import anywhere.
import type {
  CampaignStatus,
  ExpenseCategory,
  MembershipStatus,
  PaymentMethod,
  PaymentStatus,
  ReportMonthState,
} from "./types";

/** A year, or one month of it (1–12). Reports default to a year. */
export type Period = { year: number; month?: number };

type Base = { period: Period; generatedAt: string };

export type Income = { fees: number; levies: number; donations: number; total: number };
export type Spending = {
  byCategory: { category: ExpenseCategory; label: string; amount: number }[];
  /** part of total paid from a campaign or levy's own money */
  fromCampaigns: number;
  total: number;
};

/** 1 · full annual (or monthly) report: opening → income by source → spending → closing. */
export type AnnualReport = Base & {
  opening: number;
  income: Income;
  spending: Spending;
  adjustments: number;
  closing: number;
  /** money of campaigns and levies still inside `closing` (not yet spent or moved to the fund) */
  campaignsHeld: number;
  /** every month of the period (12 for a year) */
  months: { year: number; month: number; income: number; spending: number }[];
};

/** 2 · one-page summary. */
export type SummaryReport = Base & {
  opening: number;
  income: number;
  spending: number;
  /** whole association: the fund + money still held by donations and levies (adds up) */
  closing: number;
  /** of `closing`, still held by donations and levies; closing − campaignsHeld = the fund
   *  (= home «في الصندوق» when the period reaches today) */
  campaignsHeld: number;
  membersActive: number;
  /** month period: paid that month; year period: paid the whole year */
  membersPaidPeriod: number;
  membersLate: number;
  openCampaigns: number;
  openLevies: number;
};

/** 3 · months table (always a whole year). Left and deceased members are not listed. */
export type GridReport = {
  year: number;
  generatedAt: string;
  members: {
    memberRef: string;
    fullName: string;
    groupCode: string | null;
    status: MembershipStatus | null;
    statusLabel: string;
    months: ReportMonthState[];
    monthsPaid: number;
    monthsBehind: number;
  }[];
  groupPrices: Record<"A" | "B", number>;
};

/** 4 · «المتأخرات» (a whole year, active members, no amounts). */
export type LateReport = {
  year: number;
  generatedAt: string;
  members: {
    memberRef: string;
    fullName: string;
    groupCode: string | null;
    /** 'YYYY-MM' */
    lateMonths: string[];
    monthsCount: number;
    /** unpaid levy shares */
    levies: { title: string }[];
  }[];
};

/** 5 · expenses of a year or a month. */
export type ExpensesReport = Base & {
  items: {
    spentOn: string;
    category: ExpenseCategory;
    label: string;
    note: string | null;
    amount: number;
    campaignTitle: string | null;
    recordedBy: string | null;
  }[];
  byCategory: { category: ExpenseCategory; label: string; amount: number }[];
  total: number;
};

/** 6 · one campaign or levy, over its whole life. */
export type CampaignReport = {
  generatedAt: string;
  id: string;
  title: string;
  kind: "donation" | "levy";
  purpose: string | null;
  status: CampaignStatus;
  targetAmount: number | null;
  createdAt: string;
  closedAt: string | null;
  collected: number;
  spent: number;
  transferred: number;
  balance: number;
  contributions: { paidOn: string; name: string; memberRef: string | null; amount: number }[];
  expenses: { spentOn: string; note: string | null; amount: number }[];
  /** levy only: every member's share */
  shares?: {
    memberRef: string;
    fullName: string;
    expected: number;
    paid: number;
    left: number;
    exempt: boolean;
    exemptReason: string | null;
  }[];
};

/** 7 · one member's year. */
export type MemberStatement = {
  generatedAt: string;
  year: number;
  member: {
    memberId: string;
    memberRef: string;
    fullName: string;
    groupCode: string | null;
    status: MembershipStatus | null;
    phone: string | null;
  };
  months: {
    month: number;
    state: ReportMonthState | "exempt";
    price: number | null;
    paid: boolean;
    due: boolean;
  }[];
  payments: {
    paymentId: string;
    paidOn: string;
    status: PaymentStatus;
    method: PaymentMethod;
    /** this member's share of the payment */
    amount: number;
    total: number;
    /** 'YYYY-MM' */
    months: string[];
    campaigns: string[];
    note: string | null;
    /** reject or cancel reason */
    reason: string | null;
    recordedBy: string | null;
    recordedAt: string;
    confirmedBy: string | null;
    confirmedAt: string | null;
    cancelledBy: string | null;
    cancelledAt: string | null;
  }[];
  levies: { title: string; expected: number; paid: number; left: number; exempt: boolean }[];
  owed: { monthsCount: number; amountOwed: number; levyLeft: number; credit: number };
};

/** 8 · handover of a term. */
export type HandoverReport = {
  generatedAt: string;
  term: { number: number; title: string; startedOn: string; endedOn: string | null };
  opening: number;
  income: Income;
  spending: Spending;
  adjustments: number;
  computedBalance: number | null;
  counted: { label: string; method: PaymentMethod | null; amount: number }[];
  countedTotal: number | null;
  difference: number | null;
  startedBy: { name: string | null; at: string | null };
  submittedBy: { name: string | null; at: string | null };
  acceptedBy: { name: string | null; at: string | null };
  carryOver: string[];
};

/** 9 · money per wallet (IN per payment method; OUT and balance only once expenses name a wallet). */
export type WalletsReport = Base & {
  wallets: {
    method: PaymentMethod;
    label: string;
    accountNumber: string | null;
    in: number;
    count: number;
    out?: number;
    balance?: number;
  }[];
  cash: { in: number; count: number; out?: number; balance?: number };
  /** expenses recorded before wallets were named (m31) */
  unspecifiedOut?: number;
  totalIn: number;
};

/** 10 · what each committee member did in the period. */
export type CommitteeWorkReport = Base & {
  people: {
    name: string;
    isAdmin: boolean;
    active: boolean;
    payments: { count: number; amount: number };
    expenses: { count: number; amount: number };
    cancellations: number;
    levyExemptions: number;
    lastAt: string | null;
  }[];
  /** «ما أُلغي»: cancelled payments and expenses of the period */
  cancelled?: {
    what: string;
    amount: number;
    by: string | null;
    at: string;
    reason: string | null;
  }[];
};

/* ───────────── «الإحصاءات» (plan §10): counts and percentages, never names ───────────── */

export type FeeStatsBlock = {
  active: number;
  paidUp: number;
  /** 0–100, one decimal */
  paidUpPct: number;
  owe1: number;
  owe2to3: number;
  owe4plus: number;
};

export type FeeStats = {
  year: number;
  /** this month for the current year, 12 for a past year; the as-of month for a snapshot */
  refMonth: number;
  /** YYYY-MM-DD when this is a snapshot of how the year stood that day, else null */
  asOf: string | null;
  /** the snapshot day is before the first recorded payment: its numbers mean nothing */
  beforeRecords: boolean;
  overall: FeeStatsBlock;
  groups: ({ groupCode: string } & FeeStatsBlock)[];
  /** 12 months; unpaid counts only months that have started */
  months: { month: number; active: number; paid: number; unpaid: number }[];
};

export type LevyStats = {
  id: string;
  title: string;
  status: CampaignStatus;
  openedOn: string;
  daysOpen: number;
  shares: number;
  paid: number;
  unpaid: number;
  exempt: number;
  /** of the shares not exempted */
  paidPct: number;
  /** total of the shares not exempted */
  expected: number;
  collected: number;
  groups: {
    groupCode: string;
    shares: number;
    paid: number;
    unpaid: number;
    exempt: number;
    paidPct: number;
    expected: number;
    collected: number;
  }[];
};

export type DonationStats = {
  id: string;
  title: string;
  status: CampaignStatus;
  openedOn: string;
  memberGivers: number;
  outsideGivers: number;
  givers: number;
  activeMembers: number;
  memberPct: number;
  collected: number;
  target: number | null;
  targetPct: number | null;
};

/** «الإحصاءات» report for a year: fees with last year for the trend, every levy and donation. */
export type StatsReport = {
  period: { year: number };
  generatedAt: string;
  fees: FeeStats;
  previous: FeeStats | null;
  levies: LevyStats[];
  donations: DonationStats[];
};
