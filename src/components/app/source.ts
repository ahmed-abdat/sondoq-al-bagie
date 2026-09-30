import "server-only";
import { redirect } from "next/navigation";
// The UI's one door to data (Server Components only). Committee-only app (2026-09-30): every
// real read goes through the committee's own session (Lane A's committee getters), never the
// anonymous public client. With SONDOQ_FIXTURES=1 (demo) it serves the fictional fixtures.
// This is the ONLY file that imports ./fixtures.
import * as data from "@/lib/data";
import type { CommitteeRole, MoneyBundle, ReportData } from "@/lib/data/types";
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
