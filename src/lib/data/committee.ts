import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { displayLogin } from "./logins";
import { isProofPath } from "./proof";
import * as read from "./read";
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
  };
});

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
export const getPayment = committee(read.paymentById, null);
export const getMembersAdmin = committee(read.membersAdmin, []);
export const getArrears = committee(read.arrears, []);
export const getExpensesAdmin = committee(read.expensesAdmin, []);
export const getCommitteeAccounts = committee(read.committeeAccounts, []);
export const getHandovers = committee(read.handovers, []);
export const getHandover = committee(read.handoverById, null);
export const getFundAccountsAdmin = committee(read.fundAccountsAdmin, []);
/** Settings row with opening balance + date (null when signed out / not committee). */
export const getFundSettings = committee(read.fundSettings, null);

/** 5-minute signed link to a proof image, or null (not a committee member / missing file). */
export async function getProofUrl(path: string): Promise<string | null> {
  if (!isProofPath(path)) return null;
  const c = await createClient();
  const { data } = (await c?.storage.from("proofs").createSignedUrl(path, 300)) ?? { data: null };
  return data?.signedUrl ?? null;
}

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
  };
}
