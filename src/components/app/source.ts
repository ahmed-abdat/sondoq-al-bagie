import "server-only";
// The UI's one door to data (Server Components only). Reads the real Lane A layer; with
// SONDOQ_FIXTURES=1 it serves the fictional fixtures instead (screenshots, dev without a seeded
// database). This is the ONLY file that imports ./fixtures.
import * as data from "@/lib/data";
import type { ActivityItem, Expense } from "@/lib/data/types";
import { categoryLabel, monthCount, relativeAgo } from "./derive";
import * as fx from "./fixtures";
import { fromVerified } from "./receipt-model";
import type { LedgerEntry } from "./types";

export const usingFixtures = process.env.SONDOQ_FIXTURES === "1";
const pick = <T>(fixture: () => T, real: () => Promise<T>): Promise<T> =>
  usingFixtures ? Promise.resolve(fixture()) : real();

/** "Now" for date maths (fixed on 28 Sep 2026 in fixture mode so screenshots are stable). */
export const today = () => (usingFixtures ? fx.FX_TODAY : new Date());
export const thisYear = () => today().getUTCFullYear();

/** Monthly fee per group code for a year, MRO ({ A: 1000, B: 500 }). */
export async function groupPrices(year = thisYear()): Promise<Record<string, number>> {
  if (usingFixtures) return fx.FX_PRICE;
  const rows = await data.getGroupPrices(year);
  return Object.fromEntries(rows.filter((r) => r.year === year).map((r) => [r.group, r.monthlyAmount]));
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
export const committeeSession = () => pick(fx.fxSession, () => data.getCommitteeSession());
export const pendingPayments = () => pick(fx.fxPending, () => data.getPendingPayments());
export const arrears = () => pick(fx.fxArrears, () => data.getArrears());
export const fundAccountsAdmin = () => pick(fx.fxAccountsAdmin, () => data.getFundAccountsAdmin());
export const expensesAdmin = () => pick(fx.fxExpensesAdmin, () => data.getExpensesAdmin());
