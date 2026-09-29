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
  /** active members («X من N»: membersOk of membersActive) */
  membersActive: number;
  /** sum of balance corrections («فرق عند التسليم»), signed; already inside `balance` */
  adjustments: number;
  /** current committee term («الدورة») and its start date */
  termNumber: number | null;
  termStartedOn: string | null;
};

/** A committee term («الدورة»). Money counted by date inside the term. */
export type Term = {
  number: number;
  title: string;
  startedOn: string;
  /** null while the term is open */
  endedOn: string | null;
  openingBalance: number;
  /** money counted at the handover that closed it */
  closingBalance: number | null;
  collected: number;
  spent: number;
  adjustment: number;
};

export type HandoverStatus = "draft" | "submitted" | "confirmed" | "cancelled";

/** One line of money counted at handover (cash, or one wallet account). MRO. */
export type CountedLine = {
  label: string;
  method?: PaymentMethod | null;
  accountId?: string | null;
  amount: number;
};

/** Committee view of a handover («تسليم الصندوق»). */
export type Handover = {
  id: string;
  fromTerm: number;
  toTerm: number | null;
  status: HandoverStatus;
  countedLines: CountedLine[];
  countedBalance: number | null;
  /** app balance when last saved/submitted; final value fixed at acceptance */
  computedBalance: number | null;
  /** counted − computed at acceptance (booked as «فرق عند التسليم») */
  difference: number | null;
  /** app balance right now (for the live preview) */
  liveBalance: number;
  /** committee user ids that stay active after the handover */
  carryOver: string[];
  note: string | null;
  startedAt: string;
  startedByName: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  acceptedAt: string | null;
  acceptedByName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
};

/** Paper list a member belongs to: A (1000) numbered 1–21, B (500) numbered 1–70. */
export type ListCode = string;

/** «الرسوم الشهرية» of one group for one year (MRO per month). */
export type GroupPrice = { year: number; group: string; groupName: string; monthlyAmount: number };

/** One member card (public: no phone). `amountOwed` is null unless the admin turned it on. */
export type MemberStatus = {
  memberId: string;
  listCode: ListCode;
  number: number;
  /** "A-12" — show this wherever a member number appears */
  memberRef: string;
  fullName: string;
  groupCode: string;
  status: MembershipStatus;
  monthsPaidThisYear: number;
  monthsBehind: number;
  /** 'منتظم' | 'متأخر' */
  statusLabel: string;
  amountOwed: number | null;
};

/** A public list row: the member card plus this year's months as a 12-letter code
 * ("PPPPPPPPLLUU", see month-code.ts: monthStates / decodeMonths). */
export type MemberRow = MemberStatus & {
  /** this year's 12 months as a code (see month-code.ts) */
  months: string;
  /** late months of earlier years, "YYYY-MM" oldest first; absent when none */
  pastLate?: string[];
  /**
   * Price of a payable month ("YYYY-MM": late or upcoming this year, or in `pastLate`) when it is
   * NOT the member's current-group price of this year (group changed, older year, no price set =
   * null). Absent when every payable month costs the current-group price.
   */
  prices?: Record<string, number | null>;
};

/** Home search and counts: no months, no money. */
export type MemberIndex = {
  members: Pick<MemberStatus, "memberId" | "memberRef" | "fullName" | "status" | "statusLabel">[];
  /** active members («X من N») */
  activeCount: number;
  /** active members who paid `month` of `year` */
  paidThisMonth: number;
  year: number;
  month: number;
};

/** paid · late (due and unpaid) · upcoming (not due yet) · not_owed (exempt/away/left/deceased). */
export type MonthState = "paid" | "late" | "upcoming" | "not_owed";

export type MemberMonth = {
  memberId: string;
  year: number;
  month: number;
  state: MonthState;
  /** MRO a payment for this month must have (the group of that month's period); null = no price set for the year */
  price?: number | null;
};

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
  | { kind: "campaign_opened"; at: string; targetAmount: number | null }
  /** «فرق عند التسليم»: signed correction booked at a handover */
  | { kind: "balance_adjustment"; at: string; amount: number };

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

/** Fund settings as the admin edits them (committee read of the settings row). */
export type FundSettings = FundInfo & {
  /** money in the fund on `openingBalanceOn`, MRO */
  openingBalance: number;
  /** YYYY-MM-DD */
  openingBalanceOn: string;
};

/** Last run of the weekly backup (committee settings card). */
export type BackupStatus = {
  ok: boolean;
  /** ISO time of the last run */
  lastRunAt: string;
  /** ISO time of the last good file, null if none yet */
  lastOkAt: string | null;
  /** file path when ok, a short technical error otherwise */
  detail: string | null;
};

export type Allocation =
  | {
      kind: "months";
      memberId: string;
      listCode: ListCode;
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
      listCode: ListCode | null;
      number: number | null;
      fullName: string | null;
      amount: number;
    }
  | {
      kind: "credit";
      memberId: string;
      listCode: ListCode;
      number: number;
      fullName: string;
      amount: number;
    };

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
  /** sent by a member through their personal link: «أرسلها العضو X عبر رابطه» (absent/null otherwise) */
  submittedByMember?: { memberRef: string; fullName: string } | null;
};

/** Committee arrears row (has the phone for WhatsApp). */
export type Arrear = {
  memberId: string;
  listCode: ListCode;
  number: number;
  memberRef: string;
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

/** Committee list of every member (any status) with phone and current group. */
export type MemberAdmin = {
  memberId: string;
  listCode: ListCode;
  number: number;
  memberRef: string;
  fullName: string;
  phone: string | null;
  note: string | null;
  groupCode: string;
  status: MembershipStatus;
  monthsPaidThisYear: number;
  monthsBehind: number;
  amountOwed: number;
  /** first month of membership, YYYY-MM-DD */
  joinedMonth: string | null;
  /** exempt/left members only: unpaid "YYYY-MM" from before (member sheet, never reminders); null otherwise */
  formerDebtMonths: string[] | null;
  /** MRO of formerDebtMonths; null for active members */
  formerDebtAmount: number | null;
};

/** Statuses the committee can set (the enum's "away" and "deceased" are not used, owner decision). */
export const MEMBER_STATUSES = ["active", "exempt", "left"] as const;
export type SettableStatus = (typeof MEMBER_STATUSES)[number];

/** Admin list of committee accounts (settings). */
export type CommitteeAccount = {
  userId: string;
  displayName: string;
  role: CommitteeRole;
  active: boolean;
  memberId: string | null;
  /** email, or "+222XXXXXXXX" for phone logins */
  login: string;
  lastSignInAt: string | null;
  createdAt: string;
  /** never did anything (and not you): «حذف الحساب» instead of only «إيقاف» */
  canDelete: boolean;
  /** the admin marked this confirmer as not a member of the fund */
  notMember: boolean;
  /** active admin/treasurer/deputy with no member link and not marked: «غير مربوط بعضو» */
  needsMemberLink: boolean;
};

/** «حسابي»: the signed-in committee member's own account. */
export type MyProfile = {
  userId: string;
  displayName: string;
  role: CommitteeRole;
  /** "+222XXXXXXXX" for phone logins, else the email */
  login: string;
  memberId: string | null;
  /** "A-12" of the linked member row, null when not linked */
  memberRef: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  /** false once linked: changing or removing the link is for the admin */
  canLinkMember: boolean;
  /** see CommitteeSession.setupPending */
  setupPending: boolean;
};

/** Shown ONCE after creating an account or resetting its password. */
export type IssuedCredentials = { userId: string; login: string; password: string };

/** Signed-in committee member, for the UI (null when signed out). */
export type CommitteeSession = {
  userId: string;
  email: string | null;
  displayName: string;
  role: CommitteeRole;
  memberId: string | null;
  /** may confirm/reject payments (admin, treasurer, deputy) — except ones covering memberId */
  canConfirm: boolean;
  /** first sign-in (or after an admin password reset): show the setup (name, member, password) */
  setupPending: boolean;
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
      members: {
        listCode: ListCode;
        number: number;
        fullName: string;
        months: { year: number; month: number }[];
      }[];
      campaignTitles: string[];
    };

/* ───────────── fund report (shareable, public data only) ───────────── */

/** A month in the report grid: `prepaid` = paid for a month that is not due yet. */
export type ReportMonthState = MonthState | "prepaid";

export type ReportMember = {
  memberId: string;
  memberRef: string;
  fullName: string;
  groupCode: string;
  status: MembershipStatus;
  /** 'منتظم' | 'متأخر' for active members; «معفى» / «غادر» otherwise */
  statusLabel: string;
  /** index 0 = January … 11 = December of `ReportData.year` */
  months: ReportMonthState[];
  monthsPaid: number;
  monthsBehind: number;
  /** null unless the admin turned on «show amounts owed» */
  amountOwed: number | null;
};

export type ReportExpense = {
  spentOn: string;
  category: ExpenseCategory;
  /** Arabic category label */
  categoryLabel: string;
  /** the expense note; the UI shows categoryLabel when it is null */
  note: string | null;
  amount: number;
  campaignId: string | null;
};

export type ReportCampaign = {
  campaignId: string;
  title: string;
  status: CampaignStatus;
  targetAmount: number | null;
  collected: number;
  spent: number;
  balance: number;
};

/** Everything a fund report shows, in one read (getReport). Amounts in MRO. */
export type ReportData = {
  year: number;
  /** live fund totals (all time, like the home page) */
  summary: FundSummary;
  /** the chosen term (default: the open one), null before terms exist */
  term: Term | null;
  /** 12 rows, January first */
  monthly: MonthlyCollection[];
  /** every member, by list then number */
  members: ReportMember[];
  /** expenses of `year`, newest first */
  expenses: ReportExpense[];
  /** false if older expenses of the year may be missing (the public list holds the latest 50) */
  expensesComplete: boolean;
  campaigns: ReportCampaign[];
  showAmountOwed: boolean;
  /** «الرسوم الشهرية» per group for `year`, MRO (0 when no price is set) */
  groupPrices: Record<"A" | "B", number>;
  generatedAt: string;
};

/* ───────────── action results ───────────── */

/** Every server action returns this. `message` is Arabic, ready to show. */
export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; code: string; message: string };

/* ───────────── money privacy (docs/MONEY-PRIVACY.md) ───────────── */
// Strangers get these amount-free shapes; money comes only through getMoney() (committee session
// or a verified member link). Never add an amount to a *Public / FundStats / ReportShell type.

type WithoutKeys<T, K extends PropertyKey> = T extends unknown ? Omit<T, K & keyof T> : never;

/** fund_summary without money: counts, the open term, last activity. */
export type FundStats = Pick<
  FundSummary,
  | "membersOk"
  | "membersBehind"
  | "membersActive"
  | "lastActivityAt"
  | "termNumber"
  | "termStartedOn"
>;
/** The activity feed without amounts (paymentId matches MoneyBundle.activity). */
export type PublicActivityItem = WithoutKeys<ActivityItem, "amount" | "targetAmount">;
export type CampaignPublic = Omit<
  CampaignProgress,
  "targetAmount" | "collected" | "spent" | "transferred" | "balance"
>;
export type ExpensePublic = Omit<Expense, "amount">;
export type TermInfo = Pick<Term, "number" | "title" | "startedOn" | "endedOn">;
export type ContributorPublic = Omit<CampaignContribution, "amount">;

/** The report for strangers (and link previews): the member grid and structure, no money. */
export type ReportShell = {
  year: number;
  stats: FundStats;
  term: TermInfo | null;
  members: Omit<ReportMember, "amountOwed">[];
  expenses: Omit<ReportExpense, "amount">[];
  expensesComplete: boolean;
  campaigns: Pick<ReportCampaign, "campaignId" | "title" | "status">[];
  groupPrices: Record<"A" | "B", number>;
  generatedAt: string;
};

/** Every money figure a page may show, for the committee or a member with their link. */
export type MoneyBundle = {
  viewer: "committee" | "member";
  year: number;
  summary: FundSummary;
  monthly: MonthlyCollection[];
  expenseTotals: ExpenseTotal[];
  expenses: Expense[];
  campaigns: CampaignProgress[];
  activity: ActivityItem[];
  terms: Term[];
  /** memberId → MRO owed; only when the admin turned on «show amounts owed» (as before) */
  amountOwed: Record<string, number> | null;
};
