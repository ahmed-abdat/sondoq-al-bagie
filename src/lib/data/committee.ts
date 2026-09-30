import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { displayLogin } from "./logins";
import { toFundInfo } from "./map";
import { EMPTY_MEMBER_INDEX, loadMemberIndex, loadMemberRows } from "./member-lists";
import * as read from "./read";
import * as reports from "./reports";
import type { CommitteeRole, CommitteeSession, MyProfile } from "./types";

/** Same rule as app_private.can_confirm() in the database. */
const CONFIRMERS: readonly CommitteeRole[] = ["admin", "treasurer", "deputy"];

/**
 * Signed-in, active committee member, or null. Deduplicated per request. Use it in committee
 * pages/layouts to redirect to /login and to show role-based UI (the database re-checks every
 * write anyway).
 */
export const getCommitteeSession = cache(async (): Promise<CommitteeSession | null> => {
  const sb = await createClient();
  if (!sb) return null;
  const { data: auth } = await sb.auth.getUser();
  const user = auth.user;
  if (!user) return null;
  const { data } = await sb
    .from("committee")
    .select("display_name, role, member_id, active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data?.active) return null;
  return {
    userId: user.id,
    email: user.email ?? null,
    displayName: data.display_name,
    role: data.role,
    memberId: data.member_id,
    canConfirm: CONFIRMERS.includes(data.role),
    setupPending: isSetupPending(user.app_metadata),
  };
});

/**
 * Set by the admin actions that hand out a password (new account, password reset) in the login's
 * app_metadata, which the user cannot change; cleared by completeSetup. Absent = done.
 */
export function isSetupPending(appMetadata: Record<string, unknown> | null | undefined): boolean {
  return appMetadata?.setup_pending === true;
}

/** Committee reads for Server Components. Never cached across users (RLS decides the rows). */
function committee<A extends unknown[], R>(
  fn: (c: read.Client, ...args: A) => Promise<R>,
  empty: R,
) {
  return async (...args: A): Promise<R> => {
    const c = await createClient();
    return c ? fn(c, ...args) : empty;
  };
}

export const getPendingPayments = committee(read.pendingPayments, []);
export const getRecentPayments = committee(read.recentPayments, []);
export const getMembersAdmin = committee(read.membersAdmin, []);
export const getArrears = committee(read.arrears, []);
export const getExpensesAdmin = committee(read.expensesAdmin, []);
export const getCommitteeAccounts = committee(read.committeeAccounts, []);
export const getHandovers = committee(read.handovers, []);
export const getFundAccountsAdmin = committee(read.fundAccountsAdmin, []);
/** Settings row with opening balance + date (null when signed out / not committee). */
export const getFundSettings = committee(read.fundSettings, null);
/** Last weekly backup run for the admin (null before the first run or when signed out). */
export const getBackupStatus = committee(read.backupStatus, null);

/*
 * The member and fund reads the committee pages share with the old public pages, read with the
 * committee's own session (per request, never cached across users). They replace the anon cached
 * getters of ./public, which stop working once m28 closes anon access.
 */
export const getCommitteeMemberRows = committee(loadMemberRows, []);
export const getCommitteeMemberIndex = committee(loadMemberIndex, EMPTY_MEMBER_INDEX);
export const getCommitteeMembers = committee(read.membersPublic, []);
export const getCommitteeMemberMonths = committee(read.memberMonths, []);
export const getCommitteeGroupPrices = committee(read.groupPrices, []);
export const getCommitteeFundAccounts = committee(read.fundAccounts, []);
export const getCommitteeFundInfo = committee(read.fundInfo, toFundInfo(null));

/* Committee tools and the 10 reports (m29–m31; they need those migrations applied). */
export const getActivityLog = committee(read.activityLog, []);
export const getCoPaidMembers = committee(read.coPaidMembers, []);
export const getLevyShares = committee(read.levyShares, []);
export const getAnnualReport = committee(reports.loadAnnual, null);
export const getSummaryReport = committee(reports.loadSummary, null);
export const getGridReport = committee(reports.loadGrid, null);
export const getLateReport = committee(reports.loadLate, null);
export const getExpensesReport = committee(reports.loadExpenses, null);
export const getCampaignReport = committee(reports.loadCampaign, null);
export const getMemberStatement = committee(reports.loadStatement, null);
export const getHandoverReport = committee(reports.loadHandover, null);
export const getWalletsReport = committee(reports.loadWallets, null);
export const getCommitteeWorkReport = committee(reports.loadCommitteeWork, null);
export const getStatsReport = committee(reports.loadStats, null);
export const getGroupsOverview = committee(read.groupsOverview, []);
export const getAccuracyAudit = committee(read.accuracyAudit, []);
export const getExpenseActivities = committee(read.expenseActivities, []);
export const getWalletTypes = committee(read.walletTypes, []);
export const getLevyStats = committee(reports.loadLevyStats, null);
export const getDonationStats = committee(reports.loadDonationStats, null);

/** «حسابي»: the signed-in, active committee member's own account, or null. */
export async function getMyProfile(): Promise<MyProfile | null> {
  const sb = await createClient();
  if (!sb) return null;
  const { data: auth } = await sb.auth.getUser();
  const user = auth.user;
  if (!user) return null;
  const { data: row } = await sb
    .from("committee")
    .select("display_name, role, member_id, active, created_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row?.active) return null;
  let memberRef: string | null = null;
  if (row.member_id) {
    const { data: m } = await sb
      .from("members_admin")
      .select("member_ref")
      .eq("member_id", row.member_id)
      .maybeSingle();
    memberRef = m?.member_ref ?? null;
  }
  return {
    userId: user.id,
    displayName: row.display_name,
    role: row.role,
    login: displayLogin(user.email),
    memberId: row.member_id,
    memberRef,
    lastSignInAt: user.last_sign_in_at ?? null,
    createdAt: row.created_at,
    canLinkMember: row.member_id === null,
    setupPending: isSetupPending(user.app_metadata),
  };
}
