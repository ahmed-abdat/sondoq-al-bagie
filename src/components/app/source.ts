import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
// The UI's one door to data (Server Components only). Reads the real Lane A layer; with
// SONDOQ_FIXTURES=1 it serves the fictional fixtures instead (screenshots, dev without a seeded
// database). This is the ONLY file that imports ./fixtures.
import * as data from "@/lib/data";
import type { CommitteeRole, ReportData } from "@/lib/data/types";
import { DEMO_USER, isDemo } from "./demo";
import { toMemberIndex, toMemberRows } from "@/lib/data/member-lists";
import * as fx from "./fixtures";
import { fromVerified } from "./receipt-model";
import { toLedger } from "./ledger";
import { assembleReport } from "@/lib/data/report";
import type { LedgerEntry, MyProfile } from "./types";
import * as memberData from "@/lib/data/member";
import * as profileData from "./lane-a-profiles";
import { readJar } from "@/lib/member-cookies";
import { demoPhoneOf, type DemoPhone } from "./demo-member";
import {
  type Beneficiary,
  type MemberHistoryItem,
  type MemberLinkInfo,
  type MemberProfile,
  type MemberSession,
  type PendingMemberLink,
} from "./member-types";

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
  const all = toLedger(acts, exps, today());
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
/** The fund report (/report). Fixtures assemble the same shape from the fictional data. */
export async function report(): Promise<ReportData> {
  if (!usingFixtures) return data.getReport();
  // the same assembly as production, fed with the fixtures
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

/* ───────────── member link (docs/MEMBER-ACCESS.md; dynamic pages and actions only) ───────────── */
/** Demo: the profiles `/m/demo` and `/m/demo2` put on this phone (cookies). Null outside demo. */
export async function demoPhone(): Promise<DemoPhone | null> {
  if (!demoMode) return null;
  return demoPhoneOf(readJar(await cookies()));
}
async function demoActive() {
  return (await demoPhone())?.active ?? null;
}
/** The member whose personal link opened this browser, or null. Reads the cookie (dynamic). */
export async function memberSession(): Promise<MemberSession | null> {
  if (usingFixtures) {
    const t = await demoActive();
    return t ? fx.fxMemberSession(t) : null;
  }
  return memberData.memberSession();
}
/** Their payments, the ones they sent for others and their submissions (newest first). */
export async function memberHistory(): Promise<MemberHistoryItem[]> {
  if (usingFixtures) {
    const t = await demoActive();
    return t ? fx.fxMemberHistory(t) : [];
  }
  return memberData.memberHistory();
}
/** «دفعت لهم سابقًا»: members covered by earlier payments sent through this link (not me). */
export async function memberBeneficiaries(): Promise<Beneficiary[]> {
  if (usingFixtures) {
    const t = await demoActive();
    return t ? fx.fxMemberBeneficiaries(t) : [];
  }
  return memberData.memberRecentBeneficiaries();
}
/** Every member profile on this phone (up to 5), the active one flagged. */
export async function memberProfiles(): Promise<MemberProfile[]> {
  if (usingFixtures) {
    const p = await demoPhone();
    return p ? p.profiles.map((t) => fx.fxMemberProfile(t, t === p.active)) : [];
  }
  return profileData.memberProfiles();
}
/** A link for someone else opened here, waiting for a choice on /m/switch. */
export async function memberPending(): Promise<PendingMemberLink | null> {
  if (usingFixtures) {
    const t = (await demoPhone())?.pending;
    if (!t) return null;
    const { memberId, memberRef, fullName } = fx.fxMemberSession(t);
    return { memberId, memberRef, fullName };
  }
  return profileData.memberPending();
}
/** Demo: link id → demo token (the switcher sends link ids). */
export const demoTokenOf = (linkId: string) => fx.fxDemoTokenOf(linkId);
/** Committee: the active link of each member who has one. */
export const memberLinks = (): Promise<Record<string, MemberLinkInfo>> =>
  pick(fx.fxMemberLinks, () => memberData.getMemberLinks());
