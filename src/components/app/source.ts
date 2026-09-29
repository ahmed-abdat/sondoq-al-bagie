import "server-only";
// The UI's one door to data (Server Components only). Reads the real Lane A layer; with
// SONDOQ_FIXTURES=1 it serves the fictional fixtures instead (screenshots, dev without a seeded
// database). This is the ONLY file that imports ./fixtures.
import * as data from "@/lib/data";
import type { ActivityItem, Expense, ReportData } from "@/lib/data/types";
import { categoryLabel, currentDueMonth, monthCount, relativeAgo } from "./derive";
import { DEMO_USER, isDemo } from "./demo";
import { toMemberIndex, toMemberRows } from "@/lib/data/member-lists";
import * as fx from "./fixtures";
import { fromVerified } from "./receipt-model";
import type { LedgerEntry } from "./types";

export const usingFixtures = process.env.SONDOQ_FIXTURES === "1";
/** Fixtures + committee writes simulated in the browser; never on production (see demo.ts). */
export const demoMode = isDemo();
const pick = <T>(fixture: () => T, real: () => Promise<T>): Promise<T> =>
  usingFixtures ? Promise.resolve(fixture()) : real();

/** "Now" for date maths (fixed on 28 Sep 2026 in fixture mode so screenshots are stable). */
export const today = () => (usingFixtures ? fx.FX_TODAY : new Date());
export const thisYear = () => today().getUTCFullYear();

/** Monthly fee per group code for a year, MRO ({ A: 1000, B: 500 }). */
export async function groupPrices(year = thisYear()): Promise<Record<string, number>> {
  if (usingFixtures) return fx.FX_PRICE;
  const rows = await data.getGroupPrices(year);
  return Object.fromEntries(
    rows.filter((r) => r.year === year).map((r) => [r.group, r.monthlyAmount]),
  );
}

/* ───────────── public ───────────── */
export const fundSummary = () => pick(fx.fxSummary, () => data.getFundSummary());
export const fundInfo = () => pick(fx.fxInfo, () => data.getFundInfo());
export const members = () =>
  pick(
    () => fx.fxMembers(),
    () => data.getMembers(),
  );
export const memberMonths = (year = thisYear()) =>
  pick(
    () => fx.fxMemberMonths(),
    () => data.getMemberMonths(year),
  );
export const monthly = (year = thisYear()) =>
  pick(fx.fxMonthly, () => data.getMonthlyCollection(year));
export const expenses = () => pick(fx.fxExpenses, () => data.getRecentExpenses());
export const expenseTotals = () => pick(fx.fxExpenseTotals, () => data.getExpenseTotals());
export const campaigns = () => pick(fx.fxCampaigns, () => data.getCampaigns());
export const contributions = (campaignId: string, limit = 20) =>
  pick(
    () =>
      fx
        .fxContributions()
        .filter((c) => c.campaignId === campaignId)
        .slice(0, limit),
    () => data.getCampaignContributions(campaignId, limit),
  );
export const fundAccounts = () => pick(fx.fxAccounts, () => data.getFundAccounts());
export const receipt = (code: string) =>
  pick(
    () => fx.fxReceipt(code),
    () => data.getReceipt(code),
  );
const activity = () => pick(fx.fxActivity, () => data.getActivity());

/** Confirmed payments (from the activity feed) + expenses, newest first. */
export async function ledger(): Promise<LedgerEntry[]> {
  const [acts, exps] = await Promise.all([activity(), expenses()]);
  const now = today();
  const pay = acts
    .filter(
      (a): a is Extract<ActivityItem, { kind: "payment_confirmed" }> =>
        a.kind === "payment_confirmed",
    )
    .map((a): LedgerEntry => ({
      id: `p-${a.paymentId}`,
      paymentId: a.paymentId,
      kind: a.months > 0 ? "payment" : "donation",
      title: a.memberNames,
      sub:
        a.months >= 12
          ? "رسوم السنة كاملة"
          : a.months > 0
            ? `رسوم ${monthCount(a.months)}`
            : "مساهمة في حملة",
      amount: a.amount,
      at: a.at,
      when: relativeAgo(a.at, now),
      method: a.method,
      code: a.receiptCode,
    }));
  const out = exps.map((e: Expense): LedgerEntry => ({
    id: `e-${e.id}`,
    kind: "expense",
    title: e.note ?? categoryLabel(e.category),
    sub: `${categoryLabel(e.category)} · صرفته اللجنة`,
    amount: e.amount,
    at: `${e.spentOn}T12:00:00Z`,
    when: relativeAgo(`${e.spentOn}T12:00:00Z`, now),
    method: null,
    code: null,
    category: e.category,
    note: e.note,
  }));
  const all = [...pay, ...out].sort((a, b) => b.at.localeCompare(a.at));
  // Preload the public receipt of the latest payments (cached per code on the server).
  await Promise.all(
    all
      .filter((e) => e.code)
      .slice(0, 20)
      .map(async (e) => {
        e.receipt = fromVerified(await receipt(e.code!));
      }),
  );
  return all;
}

/* ───────────── committee (RLS decides; fixtures show a demo treasurer) ───────────── */
/** Demo: a fake admin. Otherwise always the real signed-in session (even with fixtures). */
export const committeeSession = () =>
  demoMode
    ? Promise.resolve({ ...fx.fxSession(), displayName: DEMO_USER, role: "admin" as const })
    : data.getCommitteeSession();
export const pendingPayments = () => pick(fx.fxPending, () => data.getPendingPayments());
/** Latest payments (any status), newest first: the committee finds one to fix here. */
export const recentPayments = () => pick(fx.fxRecent, () => data.getRecentPayments());
export const arrears = () => pick(fx.fxArrears, () => data.getArrears());
export const fundAccountsAdmin = () => pick(fx.fxAccountsAdmin, () => data.getFundAccountsAdmin());
/** Committee member list: every member, any status, with phone and current group. */
export const membersAdmin = () => pick(fx.fxMembersAdmin, () => data.getMembersAdmin());
export const committeeAccounts = () =>
  pick(fx.fxCommitteeAccounts, () => data.getCommitteeAccounts());
/** The fund report (/report). Fixtures assemble the same shape from the fictional data. */
export async function report(): Promise<ReportData> {
  if (!usingFixtures) return data.getReport();
  const year = thisYear();
  const due = currentDueMonth(today(), fx.fxInfo().graceDays);
  const months = fx.fxMemberMonths();
  const summary = fx.fxSummary();
  return {
    year,
    summary,
    term: fx.fxTerms().find((t) => !t.endedOn) ?? null,
    monthly: fx.fxMonthly(),
    members: fx.fxMembers().map((m) => {
      const mine = months.filter((x) => x.memberId === m.memberId);
      return {
        memberId: m.memberId,
        memberRef: m.memberRef,
        fullName: m.fullName,
        groupCode: m.groupCode,
        status: m.status,
        statusLabel: m.statusLabel,
        months: Array.from({ length: 12 }, (_, i) => {
          const st = mine.find((x) => x.month === i + 1)?.state ?? "upcoming";
          return st === "paid" && i + 1 > due ? "prepaid" : st;
        }),
        monthsPaid: m.monthsPaidThisYear,
        monthsBehind: m.monthsBehind,
        amountOwed: null,
      };
    }),
    expenses: fx.fxExpenses().map((e) => ({
      spentOn: e.spentOn,
      category: e.category,
      categoryLabel: categoryLabel(e.category),
      note: e.note,
      amount: e.amount,
      campaignId: e.campaignId,
    })),
    expensesComplete: true,
    campaigns: fx.fxCampaigns().map((c) => ({
      campaignId: c.campaignId,
      title: c.title,
      status: c.status,
      targetAmount: c.targetAmount,
      collected: c.collected,
      spent: c.spent,
      balance: c.balance,
    })),
    showAmountOwed: false,
    groupPrices: { A: 1000, B: 500 },
    generatedAt: today().toISOString(),
  };
}
/** Committee settings incl. the carried-over balance and its date (null if not readable). */
export const fundSettings = () =>
  pick(
    () => ({
      ...fx.fxInfo(),
      openingBalance: fx.fxSummary().openingBalance,
      openingBalanceOn: "2026-01-01",
    }),
    () => data.getFundSettings(),
  );
/** /members (and the committee record sheet): members with this year's months as a 12-letter code. */
export const memberRows = (year = thisYear()) =>
  pick(
    () => toMemberRows(fx.fxMembers(), fx.fxMemberMonths(), year),
    () => data.getMemberRows(year),
  );
/** Home: search index and «X من N دفعوا» for this month. */
export const memberIndex = () => {
  const t = today();
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth() + 1;
  return pick(
    () => toMemberIndex(fx.fxMembers(), fx.fxMemberMonths(), y, m),
    () => data.getMemberIndex(y, m),
  );
};
export const terms = () => pick(fx.fxTerms, () => data.getTerms());
export const handovers = () => pick(fx.fxHandovers, () => data.getHandovers());
export const expensesAdmin = () => pick(fx.fxExpensesAdmin, () => data.getExpensesAdmin());
