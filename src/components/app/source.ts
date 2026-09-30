import "server-only";
import { redirect } from "next/navigation";
// The UI's one door to data (Server Components only). Committee-only app (2026-09-30): every
// real read goes through the committee's own session (Lane A's committee getters), never the
// anonymous public client. With SONDOQ_FIXTURES=1 (demo) it serves the fictional fixtures.
// This is the ONLY file that imports ./fixtures.
import * as data from "@/lib/data";
import type { CommitteeRole, MoneyBundle, PendingPayment, ReportData } from "@/lib/data/types";
import type {
  PCampaign,
  PData,
  PLevy,
  PExpense,
  PLog,
  PMember,
  POp,
  PPayment,
} from "@/components/admin/types";
import { monthStates } from "@/lib/data/month-code";
import type { ActivityEntry } from "@/lib/data/map";
import type {
  AnnualReport,
  CampaignReport,
  CommitteeWorkReport,
  ExpensesReport,
  GridReport,
  HandoverReport,
  LateReport,
  MemberStatement,
  SummaryReport,
  WalletsReport,
} from "@/lib/data/report-types";
import * as rfx from "@/lib/reports/fixtures";
import type { Method } from "@/lib/methods";
import { currentDueMonth, fmt } from "./derive";
import { demoAdminData } from "./admin-demo";
import { DEMO_USER, isDemo } from "./demo";
import { toMemberRows } from "@/lib/data/member-lists";
import * as fx from "./fixtures";
import { assembleReport } from "@/lib/data/report";
import { toFundSummary } from "@/lib/data/map";
import type { MyProfile } from "./types";

/** Fixtures + committee writes simulated in the browser; never on production (see demo.ts). */
export const demoMode = isDemo();
/**
 * Fictional reads follow the same fail-closed decision as simulated writes (audit B01 / arch 1):
 * SONDOQ_FIXTURES=1 on a production deployment serves real reads, never fixtures.
 */
export const usingFixtures = demoMode;
const pick = <T>(fixture: () => T, real: () => Promise<T>): Promise<T> =>
  usingFixtures ? Promise.resolve(fixture()) : real();

/** "Now" for date maths (fixed on 28 Sep 2026 in fixture mode so screenshots are stable). */
export const today = () => (usingFixtures ? fx.FX_TODAY : new Date());
export const thisYear = () => today().getUTCFullYear();

/** Monthly fee per group code for a year, MRO ({ A: 1000, B: 500 }). */
export async function groupPrices(year = thisYear()): Promise<Record<string, number>> {
  if (usingFixtures) return fx.FX_PRICE;
  const rows = await data.getCommitteeGroupPrices(year);
  return Object.fromEntries(
    rows.filter((r) => r.year === year).map((r) => [r.group, r.monthlyAmount]),
  );
}

export const fundInfo = () => pick(fx.fxInfo, () => data.getCommitteeFundInfo());
export const fundAccounts = () => pick(fx.fxAccounts, () => data.getCommitteeFundAccounts());

/* ───────────── committee (RLS decides; fixtures show a demo treasurer) ───────────── */
/** Demo: a fake admin. Otherwise always the real signed-in session (even with fixtures). */
export const anyCommitteeSession = () =>
  demoMode
    ? Promise.resolve({ ...fx.fxSession(), displayName: DEMO_USER, role: "admin" as const })
    : data.getCommitteeSession();
/**
 * Committee pages: the session, but a first sign-in (or a password reset by the admin) goes to
 * the setup first. The setup page itself, the nav badge and the viewer check use
 * anyCommitteeSession() so they never loop.
 */
export async function committeeSession() {
  const s = await anyCommitteeSession();
  if (s?.setupPending) redirect("/committee/setup");
  return s;
}
export const pendingPayments = () => pick(fx.fxPending, () => data.getPendingPayments());
/**
 * Demo only (QA): the hub with an empty queue (`?demoQueue=0`) or a long one (`?demoQueue=12`),
 * made from the fictional slips. Outside demo mode the list is returned untouched.
 */
export function demoQueue<T extends { id: string; createdAt: string }>(
  list: T[],
  want: string | undefined,
): T[] {
  if (!demoMode || want === undefined) return list;
  const n = Math.max(0, Math.min(50, Number(want) || 0));
  if (!list.length) return [];
  return Array.from({ length: n }, (_, i) => {
    const p = list[i % list.length];
    const at = new Date(Date.parse(p.createdAt) - i * 7 * 60_000).toISOString();
    return i < list.length ? p : { ...p, id: `${p.id}-q${i}`, createdAt: at };
  });
}
/** Roles that manage the fund (members, campaigns, handover); «مشرف» only records. */
export const MANAGERS: CommitteeRole[] = ["admin", "treasurer", "deputy"];
/**
 * The one guard for committee pages: signed out → login (back to `next`), setup pending → setup,
 * a role outside `roles` → the hub. /committee/setup uses anyCommitteeSession() instead.
 */
export async function requireCommittee(next: string, opts: { roles?: CommitteeRole[] } = {}) {
  const s = await committeeSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (opts.roles && !opts.roles.includes(s.role)) redirect("/committee");
  return s;
}
/** «حسابي»: the signed-in committee user (demo: the fake admin, not linked yet). */
export async function myProfile(): Promise<MyProfile | null> {
  if (demoMode) {
    const s = await anyCommitteeSession();
    if (!s) return null;
    return {
      userId: s.userId,
      displayName: s.displayName,
      role: s.role,
      login: s.email ?? "",
      memberId: null,
      memberRef: null,
      lastSignInAt: fx.FX_TODAY.toISOString(),
      createdAt: "2026-01-01T09:00:00Z",
      canLinkMember: true,
      setupPending: false,
      canConfirm: s.canConfirm,
    };
  }
  const [p, s] = await Promise.all([data.getMyProfile(), data.getCommitteeSession()]);
  if (s?.setupPending) redirect("/committee/setup");
  return p && s ? { ...p, canConfirm: s.canConfirm } : null;
}
/** Latest payments (any status), newest first: the committee finds one to fix here. */
export const recentPayments = () => pick(fx.fxRecent, () => data.getRecentPayments());
export const arrears = () => pick(fx.fxArrears, () => data.getArrears());
export const fundAccountsAdmin = () => pick(fx.fxAccountsAdmin, () => data.getFundAccountsAdmin());
/** Committee member list: every member, any status, with phone and current group. */
export const membersAdmin = () => pick(fx.fxMembersAdmin, () => data.getMembersAdmin());
export const committeeAccounts = () =>
  pick(fx.fxCommitteeAccounts, () => data.getCommitteeAccounts());
/** Fixtures: the full report, assembled like production from the fictional data. */
async function fixtureReport(): Promise<ReportData> {
  const year = thisYear();
  return assembleReport({
    year,
    summary: fx.fxSummary(),
    terms: fx.fxTerms(),
    monthly: fx.fxMonthly(),
    members: fx.fxMembers(),
    months: fx.fxMemberMonths(),
    expenses: fx.fxExpenses(),
    campaigns: fx.fxCampaigns(),
    info: fx.fxInfo(),
    prices: Object.entries(fx.FX_PRICE).map(([group, monthlyAmount]) => ({
      year,
      group,
      groupName: `المجموعة ${group}`,
      monthlyAmount,
    })),
    now: today(),
  });
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
/** Committee settings: the last weekly backup (null = never ran). */
export const backupStatus = () => pick(fx.fxBackupStatus, () => data.getBackupStatus());
/** /members (and the committee record sheet): members with this year's months as a 12-letter code. */
export const memberRows = (year = thisYear()) =>
  pick(
    () =>
      toMemberRows(fx.fxMembers(), fx.fxMemberMonths(), year, {
        pastLate: fx.fxPastLate(),
        groupPrices: fx.FX_PRICE,
      }),
    () => data.getCommitteeMemberRows(year),
  );
export const handovers = () => pick(fx.fxHandovers, () => data.getHandovers());
export const expensesAdmin = () => pick(fx.fxExpensesAdmin, () => data.getExpensesAdmin());

/** The full report (committee pages: /committee/reports, «المتأخرات»). */
export async function committeeReport(): Promise<ReportData> {
  if (usingFixtures) return fixtureReport();
  const r = await data.getReportForViewer();
  if (!r) redirect("/login?next=/committee/reports");
  return r;
}

/* ───────────── money (committee session; fixtures show the demo committee) ───────────── */
/** Every money figure, through the committee's session (null if not allowed). Never cached. */
async function money(): Promise<MoneyBundle | null> {
  if (!usingFixtures) return data.getMoney({ year: thisYear() });
  return fxMoney("committee");
}
function fxMoney(viewer: MoneyBundle["viewer"]): MoneyBundle {
  const info = fx.fxInfo();
  return {
    viewer,
    year: thisYear(),
    summary: fx.fxSummary(),
    monthly: fx.fxMonthly(),
    expenseTotals: fx.fxExpenseTotals(),
    expenses: fx.fxExpenses(),
    campaigns: fx.fxCampaigns(),
    activity: fx.fxActivity(),
    terms: fx.fxTerms(),
    amountOwed: info.showAmountOwed
      ? Object.fromEntries(
          fx
            .fxMembers()
            .filter((m) => m.amountOwed !== null)
            .map((m) => [m.memberId, m.amountOwed as number]),
        )
      : null,
  };
}
/** Committee pages: money through the committee's own session (RLS); null when not allowed
 *  (the page's requireCommittee redirects anyway). */
export async function committeeMoney(): Promise<MoneyBundle | null> {
  if (usingFixtures) return fxMoney("committee");
  return money();
}
/** Committee pages: the fund totals (empty figures when money is not readable). */
export const committeeSummary = () =>
  committeeMoney().then((m) => m?.summary ?? toFundSummary(null));
/** Committee pages: campaigns with their figures. */
export const moneyCampaigns = () => money().then((m) => m?.campaigns ?? []);

/* ───────────── the committee app's one data model (owner picks, 2026-09-30) ───────────── */
const ROLE_WORD: Record<string, string> = {
  admin: "مسؤول",
  treasurer: "عضو اللجنة",
  deputy: "عضو اللجنة",
  committee: "عضو اللجنة",
};
const monthOf = (iso: string) => Number(iso.slice(5, 7));

/** Everything the committee screens show, from the committee's own reads (demo: fixtures). */
export async function adminData(): Promise<PData> {
  if (usingFixtures) return demoAdminData();
  const s = await requireCommittee("/committee");
  const t = today();
  const year = t.getUTCFullYear();
  const [admin, rows, prices, pendingRaw, recentRaw, m, exps, accounts, users, info, acts, shares] =
    await Promise.all([
      membersAdmin(),
      memberRows(year),
      groupPrices(year),
      pendingPayments(),
      recentPayments(),
      money(),
      expensesAdmin(),
      fundAccountsAdmin(),
      committeeAccounts(),
      fundInfo(),
      data.getActivityLog(undefined, 50),
      data.getLevyShares({}),
    ]);
  const due = currentDueMonth(t, info.graceDays);
  const codeOf = new Map(rows.map((r) => [r.memberId, r.months]));
  const rowOf = new Map(rows.map((r) => [r.memberId, r]));
  const members: PMember[] = admin.map((a) => {
    const st = monthStates(codeOf.get(a.memberId) ?? "NNNNNNNNNNNN");
    const at = (k: string) => st.flatMap((x, i) => (x === k ? [i + 1] : []));
    return {
      id: a.memberId,
      ref: a.memberRef,
      group: a.listCode as "A" | "B",
      no: a.number,
      name: a.fullName,
      phone: a.phone,
      status: a.status,
      fee: prices[a.groupCode] ?? 0,
      paid: at("paid"),
      owed: at("late"),
      notOwed: at("not_owed"),
      pastLate: rowOf.get(a.memberId)?.pastLate ?? [],
      prices: rowOf.get(a.memberId)?.prices,
      lastReminded: null,
    };
  });
  const toPay = (p: PendingPayment): PPayment => {
    const lines = new Map<string, PPayment["lines"][number]>();
    for (const x of p.allocations) {
      if (x.kind !== "months") continue;
      const ref = `${x.listCode}-${x.number}`;
      const l = lines.get(ref) ?? { ref, name: x.fullName, months: [] };
      l.months.push(x.month);
      lines.set(ref, l);
    }
    const gift = p.allocations.find((x) => x.kind === "campaign");
    return {
      id: p.id,
      kind: lines.size ? "fees" : "gift",
      status:
        p.status === "pending" ? "pending" : p.status === "cancelled" ? "cancelled" : "confirmed",
      payer: p.payerName,
      method: p.method as Method,
      amount: p.amount,
      at: p.createdAt,
      by: p.createdByName ?? "",
      txn: p.txnRef,
      receiptNo: p.receiptNo,
      lines: [...lines.values()],
      ...(gift && gift.kind === "campaign" ? { campaign: gift.campaignId } : {}),
    };
  };
  const pending = pendingRaw.map(toPay);
  const recent = recentRaw.map(toPay);
  const expenses: PExpense[] = exps
    .filter((e) => !e.cancelledAt)
    .map((e) => ({
      id: e.id,
      at: e.spentOn,
      category: e.category as PExpense["category"],
      note: e.note ?? "",
      amount: e.amount,
      campaign: e.campaignId,
    }));
  const campaignsRaw = (m?.campaigns ?? []).filter((c) => c.amountMode !== "fixed");
  const leviesRaw = (m?.campaigns ?? []).filter((c) => c.amountMode === "fixed");
  const gifts = await Promise.all(
    campaignsRaw.map((c) => data.getMoneyContributions(c.campaignId, 100).catch(() => null)),
  );
  const campaigns: PCampaign[] = campaignsRaw.map((c, i) => ({
    id: c.campaignId,
    title: c.title,
    purpose: c.purpose ?? "",
    target: c.targetAmount ?? 0,
    startedOn: "",
    deadline: c.deadline,
    status: c.status === "open" ? "open" : "closed",
    collected: c.collected,
    spent: c.spent,
    gifts: (gifts[i] ?? []).map((g) => ({
      name: g.contributorName,
      ref: null,
      amount: g.amount,
      at: g.at,
      method: "cash" as Method,
    })),
    spends: expenses
      .filter((e) => e.campaign === c.campaignId)
      .map((e) => ({ note: e.note, amount: e.amount, at: e.at })),
  }));
  const ops: POp[] = [
    ...recent
      .filter((p) => p.status === "confirmed")
      .map((p): POp => ({
        t: p.kind === "gift" ? "gift" : "pay",
        id: p.id,
        at: p.at,
        title: p.payer,
        sub: p.kind === "gift" ? "مساهمة" : "رسوم",
        amount: p.amount,
      })),
    ...expenses.map((e): POp => ({
      t: "exp",
      id: e.id,
      at: `${e.at}T12:00:00Z`,
      title: e.note,
      sub: e.campaign ? "مصروف حملة" : "مصروف",
      amount: e.amount,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const log: PLog[] = acts.map((x) => activityLine(x));
  const levies: PLevy[] = leviesRaw.map((c) => {
    const mine = shares.filter((x) => x.campaignId === c.campaignId);
    const expected = mine.map((x) => x.expected).filter((n) => n > 0);
    const per = expected.length ? Math.max(...expected) : (c.targetAmount ?? 0);
    return {
      id: c.campaignId,
      title: c.title,
      purpose: c.purpose ?? "",
      perMember: per,
      scope: "",
      createdOn: "",
      createdBy: "",
      status: c.status === "open" ? "open" : "closed",
      refs: mine.map((x) => x.memberRef),
      paidRefs: mine.filter((x) => !x.exempt && x.left <= 0).map((x) => x.memberRef),
      exemptRefs: mine.filter((x) => x.exempt).map((x) => x.memberRef),
      amounts: Object.fromEntries(
        mine.filter((x) => x.expected !== per).map((x) => [x.memberRef, x.expected]),
      ),
    };
  });
  const sum = m?.summary ?? toFundSummary(null);
  const month = t.getUTCMonth() + 1;
  const spentIn = (k: number) =>
    expenses
      .filter((e) => !e.campaign && Number(e.at.slice(0, 4)) === year && monthOf(e.at) === k)
      .reduce((n, e) => n + e.amount, 0);
  const monthly = (m?.monthly ?? []).map((x) => ({
    month: x.month,
    collected: x.collected,
    expected: x.expected,
    spent: spentIn(x.month),
  }));
  return {
    today: t.toISOString().slice(0, 10),
    year,
    due,
    me: { name: s.displayName, role: ROLE_WORD[s.role] ?? "عضو اللجنة", admin: s.role === "admin" },
    balance: sum.balance,
    opening: sum.openingBalance,
    collectedYear: sum.collectedThisYear,
    spentYear: sum.spentThisYear,
    monthIn: monthly.find((x) => x.month === month)?.collected ?? 0,
    monthOut: spentIn(month),
    monthly,
    members,
    pending,
    recent,
    ops,
    campaigns,
    expenses,
    accounts: accounts.map((a) => ({
      id: a.id,
      method: a.method as Method,
      number: a.accountNumber,
      holder: a.holderName,
      active: a.active,
    })),
    users: users.map((u) => ({
      name: u.displayName,
      role: ROLE_WORD[u.role] ?? "عضو اللجنة",
      login: u.login,
      last: u.lastSignInAt,
    })),
    prices,
    levies,
    log,
  };
}

/** One «سجل العمليات» line in plain words: who, what, how much, why. */
function activityLine(x: ActivityEntry): PLog {
  const who = x.actorName ?? "اللجنة";
  const amt = x.amount != null ? ` (${fmt(x.amount)} أوقية)` : "";
  const sub = x.subject ? ` ${x.subject}` : "";
  const why = x.reason ? `. السبب: ${x.reason}` : "";
  const W: Record<string, [string, PLog["kind"]]> = {
    record_payment: [`سجّل دفعة${sub}${amt}`, "pay"],
    confirm_payment: [`أكّد دفعة${sub}${amt}`, "ok"],
    reject_payment: [`رفض دفعة${sub}${amt}${why}`, "no"],
    cancel_payment: [`ألغى دفعة${sub}${amt}${why}`, "no"],
    undo_payment: [`تراجع عن دفعة${sub}${amt}`, "no"],
    apply_credit: [`دفع من رصيد${sub}${amt}`, "pay"],
    record_expense: [`سجّل مصروف${sub}${amt}`, "exp"],
    cancel_expense: [`ألغى مصروف${sub}${amt}${why}`, "no"],
    create_campaign: [`فتح تبرعًا:${sub}`, "gift"],
    update_campaign: [`عدّل التبرع${sub}`, "edit"],
    close_campaign: [`أغلق${sub}`, "edit"],
    create_levy: [`أنشأ لوحة${sub}${amt}`, "levy"],
    add_levy_members: [`أضاف أعضاء إلى لوحة${sub}`, "levy"],
    set_levy_share: [`غيّر نصيب${sub}${amt}`, "levy"],
    exempt_levy_share: [`أعفى من لوحة${sub}${why}`, "levy"],
    unexempt_levy_share: [`ألغى إعفاء من لوحة${sub}`, "levy"],
    add_member: [`أضاف عضوًا:${sub}`, "edit"],
    update_member: [`عدّل بيانات${sub}`, "edit"],
    change_member_status: [`غيّر حالة${sub}${why}`, "edit"],
    set_join_month: [`غيّر شهر انضمام${sub}`, "edit"],
    set_group_price: [`غيّر الرسوم الشهرية${sub}${amt}`, "edit"],
    update_settings: ["غيّر الإعدادات", "edit"],
    add_fund_account: [`أضاف رقم محفظة${sub}`, "edit"],
    start_handover: ["بدأ تسليم الصندوق", "edit"],
    submit_handover: ["أرسل محضر التسليم", "edit"],
    accept_handover: ["قبل تسليم الصندوق", "edit"],
    cancel_handover: [`ألغى التسليم${why}`, "no"],
  };
  const [what, kind] = W[x.action] ?? [`${x.action.replaceAll("_", " ")}${sub}${amt}`, "edit"];
  return { who, what, at: x.at, kind };
}

/* ───────────── reports (plan §9: 10 kinds; demo: Lane B's fictional report data) ───────────── */
export type ReportReq =
  | { kind: "annual" | "summary" | "expenses" | "wallets" | "work"; year: number; month?: number }
  | { kind: "grid" | "late"; year: number }
  | { kind: "campaign"; id: string }
  | { kind: "member"; memberId: string; year: number }
  | { kind: "handover"; term: number };
export type ReportRes =
  | { kind: "annual"; data: AnnualReport }
  | { kind: "summary"; data: SummaryReport }
  | { kind: "grid"; data: GridReport }
  | { kind: "late"; data: LateReport }
  | { kind: "expenses"; data: ExpensesReport }
  | { kind: "campaign"; data: CampaignReport }
  | { kind: "member"; data: MemberStatement }
  | { kind: "handover"; data: HandoverReport }
  | { kind: "wallets"; data: WalletsReport }
  | { kind: "work"; data: CommitteeWorkReport };

/** One report's data for the committee (null = not found / not allowed). */
export async function reportFor(q: ReportReq): Promise<ReportRes | null> {
  if (usingFixtures) {
    const F: Record<ReportReq["kind"], ReportRes> = {
      annual: { kind: "annual", data: rfx.fxAnnual },
      summary: { kind: "summary", data: rfx.fxSummary },
      grid: { kind: "grid", data: rfx.fxGrid },
      late: { kind: "late", data: rfx.fxLate },
      expenses: { kind: "expenses", data: rfx.fxExpenses },
      campaign: { kind: "campaign", data: rfx.fxCampaign },
      member: { kind: "member", data: rfx.fxStatement },
      handover: { kind: "handover", data: rfx.fxHandover },
      wallets: { kind: "wallets", data: rfx.fxWallets },
      work: { kind: "work", data: rfx.fxWork },
    };
    if (q.kind === "campaign" && q.id.startsWith("l"))
      return { kind: "campaign", data: rfx.fxLevy };
    return F[q.kind];
  }
  const p =
    "month" in q && q.month
      ? { year: q.year, month: q.month }
      : { year: "year" in q ? q.year : thisYear() };
  const wrap = <K extends ReportRes["kind"], D>(kind: K, d: D | null) =>
    d ? ({ kind, data: d } as unknown as ReportRes) : null;
  switch (q.kind) {
    case "annual":
      return wrap("annual", await data.getAnnualReport(p));
    case "summary":
      return wrap("summary", await data.getSummaryReport(p));
    case "expenses":
      return wrap("expenses", await data.getExpensesReport(p));
    case "wallets":
      return wrap("wallets", await data.getWalletsReport(p));
    case "work":
      return wrap("work", await data.getCommitteeWorkReport(p));
    case "grid":
      return wrap("grid", await data.getGridReport(q.year));
    case "late":
      return wrap("late", await data.getLateReport(q.year));
    case "campaign":
      return wrap("campaign", await data.getCampaignReport(q.id));
    case "member":
      return wrap("member", await data.getMemberStatement(q.memberId, q.year));
    case "handover":
      return wrap("handover", await data.getHandoverReport(q.term));
  }
}

/** «دفعوا معه سابقًا» (m29): members paid together with this one before (demo: none). */
export async function coPaid(memberId: string) {
  if (usingFixtures) return [];
  return data.getCoPaidMembers(memberId, 5);
}
