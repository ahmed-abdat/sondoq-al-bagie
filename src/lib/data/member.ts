import "server-only";
// Member access (docs/MEMBER-ACCESS.md): server-only reads for the member behind the `bq_member`
// cookie. The raw token never leaves our server: it is hashed (SHA-256, hex) and the hash goes to
// the server-only RPCs with the secret key. Nothing here is cached — pages that call these render
// per request, and member data must never land in the public cache or the offline store.
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  Beneficiary,
  MemberHistoryAllocation,
  MemberHistoryItem,
  MemberLinkInfo,
  MemberProfile,
  MemberSession,
} from "./member-types";
import { MEMBER_COOKIE, MEMBER_PENDING_COOKIE } from "./member-types";
import type { MembershipStatus, PaymentMethod, PaymentStatus } from "./types";

/** base64url, 32 random bytes → 43 characters. Anything else is not one of our tokens. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function isMemberToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

/** SHA-256 hex of the token: what the database stores and is asked about. */
export function hashMemberToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The raw token of this request's member cookie, or null. */
export async function memberToken(): Promise<string | null> {
  const t = (await cookies()).get(MEMBER_COOKIE)?.value ?? "";
  return isMemberToken(t) ? t : null;
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const strOrNull = (v: unknown) => (typeof v === "string" ? v : null);
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : num(v));

export function toMemberSession(r: Raw | null): MemberSession | null {
  if (!r || typeof r.member_id !== "string") return null;
  return {
    linkId: str(r.link_id),
    memberId: r.member_id,
    memberRef: str(r.member_ref),
    listCode: str(r.list_code),
    number: num(r.number),
    fullName: str(r.full_name),
    groupCode: str(r.group_code),
    status: (strOrNull(r.status) ?? "active") as MembershipStatus,
    monthsBehind: num(r.months_behind),
    amountOwed: num(r.amount_owed),
    lateMonths: Array.isArray(r.late_months)
      ? r.late_months.filter((m) => typeof m === "string")
      : [],
    credit: num(r.credit),
  };
}

export function toMemberHistory(rows: unknown): MemberHistoryItem[] {
  if (!Array.isArray(rows)) return [];
  return (rows as Raw[]).map((r) => ({
    id: str(r.id),
    status: (strOrNull(r.status) ?? "pending") as PaymentStatus,
    amount: num(r.amount),
    method: (strOrNull(r.method) ?? "other") as PaymentMethod,
    paidOn: str(r.paid_on),
    createdAt: str(r.created_at),
    decidedAt: strOrNull(r.decided_at),
    receiptCode: strOrNull(r.receipt_code),
    rejectReason: strOrNull(r.reject_reason),
    payerName: str(r.payer_name),
    sentByMe: r.sent_by_me === true,
    forMe: r.for_me === true,
    allocations: (Array.isArray(r.allocations) ? (r.allocations as Raw[]) : []).map(
      (a): MemberHistoryAllocation => ({
        kind: (strOrNull(a.kind) ?? "months") as MemberHistoryAllocation["kind"],
        memberId: strOrNull(a.member_id),
        memberRef: strOrNull(a.member_ref),
        fullName: strOrNull(a.full_name),
        year: numOrNull(a.year),
        month: numOrNull(a.month),
        amount: num(a.amount),
        campaignTitle: strOrNull(a.campaign_title),
      }),
    ),
  }));
}

export function toBeneficiaries(rows: unknown): Beneficiary[] {
  if (!Array.isArray(rows)) return [];
  return (rows as Raw[])
    .filter((r) => typeof r.member_id === "string")
    .map((r) => ({
      memberId: str(r.member_id),
      memberRef: str(r.member_ref),
      fullName: str(r.full_name),
    }));
}

/** The member session for a raw token (for /m/[token] and the paste-link flow), or null. */
export async function verifyMemberToken(token: string): Promise<MemberSession | null> {
  if (!isMemberToken(token)) return null;
  const admin = tryCreateAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.rpc("member_session", {
    p_token_hash: hashMemberToken(token),
  });
  if (error) return null;
  return toMemberSession(data as Raw | null);
}

/** «أنت» on this device, or null (no cookie, revoked link, not configured). */
export async function memberSession(): Promise<MemberSession | null> {
  const token = await memberToken();
  return token ? verifyMemberToken(token) : null;
}

/** «دفعاتي»: newest first (max 100). Empty without a valid link. */
export async function memberHistory(): Promise<MemberHistoryItem[]> {
  const token = await memberToken();
  const admin = tryCreateAdminClient();
  if (!token || !admin) return [];
  const { data, error } = await admin.rpc("member_history", {
    p_token_hash: hashMemberToken(token),
  });
  return error ? [] : toMemberHistory(data);
}

/** «دفعت لهم سابقًا»: members covered by earlier submissions through this link (max 12, not me). */
export async function memberRecentBeneficiaries(): Promise<Beneficiary[]> {
  const token = await memberToken();
  const admin = tryCreateAdminClient();
  if (!token || !admin) return [];
  const { data, error } = await admin.rpc("member_recent_beneficiaries", {
    p_token_hash: hashMemberToken(token),
  });
  return error ? [] : toBeneficiaries(data);
}

/** Committee: active member links by member id (never the token). */
export async function getMemberLinks(): Promise<Record<string, MemberLinkInfo>> {
  const sb = await createClient();
  if (!sb) return {};
  const { data, error } = await sb.from("member_links_admin").select("*");
  if (error || !data) return {};
  return Object.fromEntries(
    data
      .filter((r) => r.member_id)
      .map((r) => [
        r.member_id as string,
        {
          memberId: r.member_id as string,
          createdAt: str(r.created_at),
          lastUsedAt: r.last_used_at,
        },
      ]),
  );
}

/** Which of `tokens` are live links, and whose (one RPC for all of them). */
export async function liveProfiles(
  tokens: string[],
): Promise<Map<string, Omit<MemberProfile, "active">>> {
  const out = new Map<string, Omit<MemberProfile, "active">>();
  const admin = tryCreateAdminClient();
  if (!admin || !tokens.length) return out;
  const byHash = new Map(tokens.map((t) => [hashMemberToken(t), t]));
  const { data, error } = await admin.rpc("member_sessions", {
    p_token_hashes: [...byHash.keys()],
  });
  if (error || !Array.isArray(data)) return out;
  for (const r of data as Raw[]) {
    const token = byHash.get(str(r.token_hash));
    if (token && typeof r.link_id === "string") {
      out.set(token, {
        linkId: r.link_id,
        memberId: str(r.member_id),
        memberRef: str(r.member_ref),
        fullName: str(r.full_name),
      });
    }
  }
  return out;
}

/** Another member's link opened on this device and waiting for the choice, or null. */
export async function memberPending(): Promise<MemberSession | null> {
  const t = (await cookies()).get(MEMBER_PENDING_COOKIE)?.value ?? "";
  return isMemberToken(t) ? verifyMemberToken(t) : null;
}
