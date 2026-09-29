"use server";
// Member link, for the static public pages: they are the same for everyone (cached), so the
// «أنت» card asks here after load, and only when the link's marker cookie exists. Nothing is
// returned without a valid member session; nothing here is cached.
import { cookies } from "next/headers";
import type { CampaignProgress, FundAccount, MemberRow } from "@/lib/data/types";
import type { MemberCtx } from "./member";
import { writeDemoPhone } from "./demo-link";
import {
  acceptPending,
  declinePending,
  MAX_PROFILES,
  removeActive,
  switchTo,
  type DemoPhone,
} from "./demo-member";
import type { MemberProfile, MemberSession } from "./member-types";
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
  /** every member profile on this phone (the switcher shows when there is more than one) */
  profiles: MemberProfile[];
};

/** The «أنت» card: null when there is no (valid) member link in this browser. */
export async function memberHome(): Promise<MemberHome | null> {
  const s = await src.memberSession();
  if (!s) return null;
  const [rows, ctx, history, profiles] = await Promise.all([
    src.memberRows(),
    memberCtx(),
    src.memberHistory(),
    src.memberProfiles(),
  ]);
  const row = rows.find((r) => r.memberId === s.memberId);
  return {
    s,
    months: row?.months ?? "NNNNNNNNNNNN",
    year: ctx.year,
    dueMonth: ctx.dueMonth,
    waiting: history.filter((h) => h.status === "pending" && h.sentByMe).length,
    profiles,
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

/* ───────────── demo only: this phone's member profiles live in cookies ───────────── */
type Done = { ok: true; data: undefined } | { ok: false; code: string; message: string };
const done: Done = { ok: true, data: undefined };
async function withDemoPhone(f: (p: DemoPhone) => DemoPhone | null): Promise<Done> {
  const p = await src.demoPhone();
  if (!p) return done;
  const next = f(p);
  if (!next)
    return {
      ok: false,
      code: "member_profiles_full",
      message: `هذا الهاتف فيه ${MAX_PROFILES} أشخاص. أزِل أحدهم أولًا.`,
    };
  writeDemoPhone(await cookies(), next);
  return done;
}
/** «إزالة … من هذا الهاتف»: only the active profile goes. */
export async function demoMemberSignOut(): Promise<Done> {
  return withDemoPhone(removeActive);
}
export async function demoMemberSwitch({ linkId }: { linkId: string }): Promise<Done> {
  const t = src.demoTokenOf(linkId);
  return withDemoPhone((p) => (t ? switchTo(p, t) : p));
}
export async function demoMemberAccept(): Promise<Done> {
  return withDemoPhone(acceptPending);
}
export async function demoMemberDecline(): Promise<Done> {
  return withDemoPhone(declinePending);
}
