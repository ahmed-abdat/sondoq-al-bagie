// The fund report: loadReport (with money, for the committee or a member via ./money) and
// loadReportShell (amount-free, for strangers). No phones, no proofs.
// assembleReport is pure (unit tested); loadReport fetches with any client.
import { CATEGORY_LABELS, STATUS_LABELS } from "./labels";
import * as read from "./read";
import type {
  CampaignProgress,
  Expense,
  FundInfo,
  FundSummary,
  GroupPrice,
  MemberMonth,
  MemberStatus,
  MonthlyCollection,
  ReportData,
  ReportMember,
  ReportShell,
  ReportMonthState,
  Term,
} from "./types";

/** recent_expenses returns at most this many rows (app_private.public_recent_expenses). */
export const PUBLIC_EXPENSES_LIMIT = 50;

export type ReportOptions = { year?: number; term?: number };

export type ReportInput = {
  year: number;
  term?: number;
  summary: FundSummary;
  terms: Term[];
  monthly: MonthlyCollection[];
  members: MemberStatus[];
  months: MemberMonth[];
  expenses: Expense[];
  campaigns: CampaignProgress[];
  info: FundInfo;
  prices: GroupPrice[];
  now: Date;
};

export function assembleReport(i: ReportInput): ReportData {
  const nowYm = i.now.getUTCFullYear() * 12 + i.now.getUTCMonth();
  const grid = new Map<string, ReportMonthState[]>();
  for (const m of i.months) {
    if (m.year !== i.year || m.month < 1 || m.month > 12) continue;
    const row = grid.get(m.memberId) ?? Array<ReportMonthState>(12).fill("not_owed");
    const future = m.year * 12 + (m.month - 1) > nowYm;
    row[m.month - 1] = m.state === "paid" && future ? "prepaid" : m.state;
    grid.set(m.memberId, row);
  }

  const members: ReportMember[] = i.members.map((m) => {
    const months = grid.get(m.memberId) ?? Array<ReportMonthState>(12).fill("not_owed");
    return {
      memberId: m.memberId,
      memberRef: m.memberRef,
      fullName: m.fullName,
      groupCode: m.groupCode,
      status: m.status,
      statusLabel: m.status === "active" ? m.statusLabel : STATUS_LABELS[m.status],
      months,
      monthsPaid: months.filter((s) => s === "paid" || s === "prepaid").length,
      monthsBehind: months.filter((s) => s === "late").length,
      amountOwed: i.info.showAmountOwed ? m.amountOwed : null,
    };
  });

  const byMonth = new Map(i.monthly.filter((m) => m.year === i.year).map((m) => [m.month, m]));
  const monthly = Array.from(
    { length: 12 },
    (_, k) => byMonth.get(k + 1) ?? { year: i.year, month: k + 1, expected: 0, collected: 0 },
  );

  const yearStart = `${i.year}-01-01`;
  const inYear = i.expenses.filter((e) => e.spentOn.slice(0, 4) === String(i.year));
  // The public list is the latest N. It is complete for the year when it was not full, or when it
  // already reaches back before 1 January.
  const oldest = i.expenses.at(-1)?.spentOn;
  const expensesComplete =
    i.expenses.length < PUBLIC_EXPENSES_LIMIT || (oldest !== undefined && oldest < yearStart);

  const term =
    (i.term === undefined
      ? i.terms.find((t) => t.endedOn === null)
      : i.terms.find((t) => t.number === i.term)) ?? null;

  return {
    year: i.year,
    summary: i.summary,
    term,
    monthly,
    members,
    expenses: inYear.map((e) => ({
      spentOn: e.spentOn,
      category: e.category,
      categoryLabel: CATEGORY_LABELS[e.category],
      note: e.note,
      amount: e.amount,
      campaignId: e.campaignId,
    })),
    expensesComplete,
    campaigns: i.campaigns.map((c) => ({
      campaignId: c.campaignId,
      title: c.title,
      status: c.status,
      targetAmount: c.targetAmount,
      collected: c.collected,
      spent: c.spent,
      balance: c.balance,
    })),
    showAmountOwed: i.info.showAmountOwed,
    groupPrices: {
      A: i.prices.find((p) => p.year === i.year && p.group === "A")?.monthlyAmount ?? 0,
      B: i.prices.find((p) => p.year === i.year && p.group === "B")?.monthlyAmount ?? 0,
    },
    generatedAt: i.now.toISOString(),
  };
}

export async function loadReport(
  c: read.Client,
  opts: ReportOptions = {},
  now: Date = new Date(),
): Promise<ReportData> {
  const year = opts.year ?? now.getUTCFullYear();
  const [summary, terms, monthly, members, months, expenses, campaigns, info, prices] =
    await Promise.all([
      read.fundSummary(c),
      read.terms(c),
      read.monthlyCollection(c, year),
      read.members(c),
      read.memberMonths(c, year),
      read.recentExpenses(c),
      read.campaigns(c),
      read.fundInfo(c),
      read.groupPrices(c, year),
    ]);
  return assembleReport({
    year,
    term: opts.term,
    summary,
    terms,
    monthly,
    members,
    months,
    expenses,
    campaigns,
    info,
    prices,
    now,
  });
}

/**
 * The report for strangers and link previews (docs/MONEY-PRIVACY.md): same grid and structure as
 * assembleReport, built from the amount-free public views, with every money field removed.
 */
export async function loadReportShell(
  c: read.Client,
  opts: ReportOptions = {},
  now: Date = new Date(),
): Promise<ReportShell> {
  const year = opts.year ?? now.getUTCFullYear();
  const [stats, terms, members, months, expenses, campaigns, info, prices] = await Promise.all([
    read.fundStats(c),
    read.termsInfo(c),
    read.membersPublic(c),
    read.memberMonths(c, year),
    read.expensesPublic(c),
    read.campaignsPublic(c),
    read.fundInfo(c),
    read.groupPrices(c, year),
  ]);
  return toReportShell(
    assembleReport({
      year,
      term: opts.term,
      summary: { ...emptySummary(), ...stats },
      terms: terms.map((t) => ({
        ...t,
        openingBalance: 0,
        closingBalance: null,
        collected: 0,
        spent: 0,
        adjustment: 0,
      })),
      monthly: [],
      members,
      months,
      expenses: expenses.map((e) => ({ ...e, amount: 0 })),
      campaigns: campaigns.map((x) => ({
        ...x,
        targetAmount: null,
        collected: 0,
        spent: 0,
        transferred: 0,
        balance: 0,
      })),
      info: { ...info, showAmountOwed: false },
      prices,
      now,
    }),
    stats,
  );
}

function emptySummary(): FundSummary {
  return {
    openingBalance: 0,
    moneyIn: 0,
    moneyOut: 0,
    transfersIn: 0,
    balance: 0,
    collectedThisYear: 0,
    spentThisYear: 0,
    membersOk: 0,
    membersBehind: 0,
    lastActivityAt: null,
    membersActive: 0,
    adjustments: 0,
    termNumber: null,
    termStartedOn: null,
  };
}

/** Keep only what strangers may see (explicit picks: a new money field never leaks by default). */
export function toReportShell(r: ReportData, stats: ReportShell["stats"]): ReportShell {
  return {
    year: r.year,
    stats,
    term: r.term
      ? {
          number: r.term.number,
          title: r.term.title,
          startedOn: r.term.startedOn,
          endedOn: r.term.endedOn,
        }
      : null,
    members: r.members.map((m) => ({
      memberId: m.memberId,
      memberRef: m.memberRef,
      fullName: m.fullName,
      groupCode: m.groupCode,
      status: m.status,
      statusLabel: m.statusLabel,
      months: m.months,
      monthsPaid: m.monthsPaid,
      monthsBehind: m.monthsBehind,
    })),
    expenses: r.expenses.map((e) => ({
      spentOn: e.spentOn,
      category: e.category,
      categoryLabel: e.categoryLabel,
      note: e.note,
      campaignId: e.campaignId,
    })),
    expensesComplete: r.expensesComplete,
    campaigns: r.campaigns.map((x) => ({
      campaignId: x.campaignId,
      title: x.title,
      status: x.status,
    })),
    groupPrices: r.groupPrices,
    generatedAt: r.generatedAt,
  };
}
