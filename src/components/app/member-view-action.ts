"use server";
// Member link, for the static public pages: they are the same for everyone (cached), so the
// «أنت» card asks here after load, and only when the link's marker cookie exists. Nothing is
// returned without a valid member session; nothing here is cached.
import { cookies } from "next/headers";
import type { CampaignProgress, FundAccount, MemberRow } from "@/lib/data/types";
import type { MemberCtx } from "./member";
import { DEMO_MEMBER_TOKEN, MEMBER_COOKIE, MEMBER_MARKER_COOKIE } from "./member-types";
import type { MemberSession } from "./member-types";
import { memberCtx } from "./page-data";
import * as src from "./source";

export type MemberHome = {
  s: MemberSession;
  /** this year's 12 months as a code (P paid, L late, U upcoming, N not owed) */
  months: string;
  year: number;
  dueMonth: number;
  /** my submissions still waiting for the committee */
  waiting: number;
};

/** The «أنت» card: null when there is no (valid) member link in this browser. */
export async function memberHome(): Promise<MemberHome | null> {
  const s = await src.memberSession();
  if (!s) return null;
  const [rows, ctx, history] = await Promise.all([
    src.memberRows(),
    memberCtx(),
    src.memberHistory(),
  ]);
  const row = rows.find((r) => r.memberId === s.memberId);
  return {
    s,
    months: row?.months ?? "NNNNNNNNNNNN",
    year: ctx.year,
    dueMonth: ctx.dueMonth,
    waiting: history.filter((h) => h.status === "pending" && h.sentByMe).length,
  };
}

export type MemberSheetData = {
  members: MemberRow[];
  ctx: MemberCtx;
  accounts: FundAccount[];
  campaigns: CampaignProgress[];
  /** «دفعت لهم سابقًا» (member ids, me excluded) */
  recent: string[];
};

/** What «أرسلت دفعة» and «ادفع الآن» need, loaded when the sheet opens (members only). */
export async function memberSheetData(): Promise<MemberSheetData | null> {
  const s = await src.memberSession();
  if (!s) return null;
  const [rows, ctx, accounts, campaigns, recent] = await Promise.all([
    src.memberRows(),
    memberCtx(),
    src.fundAccounts(),
    src.campaigns(),
    src.memberBeneficiaries(),
  ]);
  return {
    members: rows.filter((m) => m.status === "active" || m.status === "exempt"),
    ctx,
    accounts,
    campaigns: campaigns.filter((c) => c.status === "open"),
    recent: recent.map((b) => b.memberId),
  };
}

/** Demo only: «خروج من هذا الجهاز» clears the demo link's cookies. */
export async function demoMemberSignOut(): Promise<{ ok: true; data: undefined }> {
  const jar = await cookies();
  if (src.demoMode && jar.get(MEMBER_COOKIE)?.value === DEMO_MEMBER_TOKEN) {
    jar.delete(MEMBER_COOKIE);
    jar.delete(MEMBER_MARKER_COOKIE);
  }
  return { ok: true, data: undefined };
}
