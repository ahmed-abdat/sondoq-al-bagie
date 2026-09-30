"use client";
// The ONE seam between committee screens and the server actions. Normally it is the real
// `@/lib/data/actions`. In demo mode (see demo.ts) every call is simulated here after ~400 ms,
// updates a local store so the screens react, and never reaches the server.
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { reportActionError } from "@/components/providers";
import * as real from "@/lib/data/actions";
import type {
  ActionResult,
  CampaignProgress,
  ExpenseAdmin,
  FundAccountAdmin,
  Handover,
  MemberAdmin,
  PendingPayment,
} from "@/lib/data/types";
import { generatePassword, parseLogin } from "@/lib/data/logins";
import { DEMO_USER } from "./demo";
import { safeAct } from "./safe-act";

type Actions = typeof real;

/* ───────────── local demo state ───────────── */
export type DemoState = {
  pending: PendingPayment[];
  expenses: ExpenseAdmin[];
  campaigns: CampaignProgress[];
  campaignPatch: Record<string, Partial<CampaignProgress>>;
  accounts: FundAccountAdmin[];
  members: MemberAdmin[];
  memberPatch: Record<string, Partial<MemberAdmin>>;
  /** the handover being prepared in the demo (null = none / use the server's) */
  handover: Handover | null;
  /** months paid from credit in the demo, "YYYY-MM" per member */
  creditPaid: Record<string, string[]>;
};
const EMPTY: DemoState = {
  pending: [],
  expenses: [],
  campaigns: [],
  campaignPatch: {},
  accounts: [],
  members: [],
  memberPatch: {},
  handover: null,
  creditPaid: {},
};
let state = EMPTY;
const subs = new Set<() => void>();
const update = (f: (s: DemoState) => DemoState) => {
  state = f(state);
  subs.forEach((cb) => cb());
};
/** Local demo additions/changes (empty outside demo mode). */
export function useDemoState(): DemoState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
    () => EMPTY,
  );
}

/* ───────────── simulated actions ───────────── */
/** Demo only: names of the members a screen is about to record for (the real server knows them). */
const known = new Map<string, { fullName: string; listCode: string; number: number }>();
export function rememberMembers(
  list: { memberId: string; fullName: string; listCode: string; number: number }[],
) {
  for (const m of list) known.set(m.memberId, m);
}
/** Demo only: the fund balance the handover screen shows (the submit stub records it). */
let handoverBalance = 0;
export function rememberHandoverBalance(b: number) {
  handoverBalance = b;
}
const nameOf = (id: string | null | undefined, fallback: string) =>
  (id && known.get(id)) || { fullName: fallback, listCode: "", number: 0 };
const wait = () => new Promise((r) => setTimeout(r, 400));
const ok = async <T,>(data: T): Promise<ActionResult<T>> => {
  await wait();
  return { ok: true, data };
};
const now = () => new Date().toISOString();
let receiptSeq = 0;
const demoLogins = new Set<string>();
const nextCode = () => `BQ-DEMO-${String(++receiptSeq).padStart(4, "0")}`;

/**
 * Every server action, decided for demo mode: a simulation, or "real" when it is safe to reach the
 * server (none today). A new action in `@/lib/data/actions` is a type error here until it is added.
 */
type Sim = { [K in keyof Actions]: Actions[K] | "real" };
const demo = {
  async recordPayment(p) {
    // like the server: the same id again is a replay, not a second payment
    if (state.pending.some((x) => x.id === p.id))
      return ok({
        id: p.id,
        status: "pending" as const,
        replay: true,
        receiptCode: null,
        pendingOverlap: false,
      });
    const pay: PendingPayment = {
      id: p.id,
      status: "pending",
      payerName: p.payerName,
      method: p.method,
      amount: p.amount,
      paidOn: p.paidOn,
      txnRef: p.txnRef ?? null,
      proofPath: p.proofPath ?? null,
      note: p.note ?? null,
      createdAt: now(),
      createdByName: DEMO_USER,
      decidedAt: null,
      decidedByName: null,
      rejectReason: null,
      cancelReason: null,
      receiptCode: null,
      receiptNo: null,
      allocations: p.allocations.map((a) =>
        a.kind === "months"
          ? { ...a, ...nameOf(a.memberId, p.payerName), year: a.year ?? 0 }
          : a.kind === "campaign"
            ? {
                kind: "campaign",
                campaignId: a.campaignId,
                memberId: a.memberId ?? null,
                listCode: null,
                number: null,
                fullName: nameOf(a.memberId, p.payerName).fullName,
                amount: a.amount,
              }
            : {
                kind: "credit",
                memberId: a.memberId,
                ...nameOf(a.memberId, p.payerName),
                amount: a.amount,
              },
      ),
    };
    // like the server (m23): another pending payment already covers one of these months
    const key = (a: { kind: string; memberId?: string | null; year?: number; month?: number }) =>
      a.kind === "months" ? `${a.memberId}:${a.year}-${a.month}` : "";
    const mine = new Set(p.allocations.map(key).filter(Boolean));
    const pendingOverlap = state.pending.some((x) => x.allocations.some((a) => mine.has(key(a))));
    update((s) => ({ ...s, pending: [...s.pending, pay] }));
    return ok({
      id: p.id,
      status: "pending" as const,
      replay: false,
      receiptCode: null,
      pendingOverlap,
    });
  },
  async confirmPayment() {
    return ok({
      already: false,
      decidedByName: DEMO_USER,
      decidedAt: now(),
      receiptCode: nextCode(),
    });
  },
  rejectPayment: async () => ok(undefined),
  cancelPayment: async () => ok(undefined),
  undoPayment: async () => ok(undefined),
  async uploadProof(form) {
    // keep the picked image on this phone so the new slip can show it
    const file = form.get("file");
    const path = file instanceof Blob ? `demo:${URL.createObjectURL(file)}` : "demo:";
    return ok({ path, hash: "0".repeat(64) });
  },
  async proofUrl({ path }) {
    await wait();
    if (path.startsWith("demo:blob:")) return { ok: true, data: path.slice(5) };
    // fixture slips: a fictional wallet screenshot drawn here, so the demo proof opens
    const url = demoProofImage(path);
    return url ? { ok: true, data: url } : { ok: false, code: "demo", message: "صورة تجريبية" };
  },
  async recordExpense(p) {
    if (state.expenses.some((x) => x.id === p.id)) return ok(p.id);
    const e: ExpenseAdmin = {
      id: p.id,
      spentOn: p.spentOn,
      category: p.category ?? "other",
      ...(p.activityId !== undefined ? { activityId: p.activityId } : {}),
      amount: p.amount,
      note: p.note ?? null,
      campaignId: p.campaignId ?? null,
      receiptPath: null,
      createdAt: now(),
      cancelledAt: null,
      cancelReason: null,
    };
    update((s) => ({ ...s, expenses: [e, ...s.expenses] }));
    return ok(p.id);
  },
  cancelExpense: async () => ok(undefined),
  logReminder: async () => ok("demo"),
  async createCampaign(p) {
    if (state.campaigns.some((x) => x.campaignId === p.id)) return ok(p.id);
    const c: CampaignProgress = {
      campaignId: p.id,
      title: p.title,
      purpose: p.purpose ?? null,
      targetAmount: p.targetAmount ?? null,
      deadline: p.deadline ?? null,
      status: "open",
      amountMode: p.amountMode ?? "open",
      collected: 0,
      spent: 0,
      transferred: 0,
      balance: 0,
      participants: 0,
      participantsPaid: 0,
    };
    update((s) => ({ ...s, campaigns: [c, ...s.campaigns] }));
    return ok(p.id);
  },
  async updateCampaign(p) {
    update((s) => ({
      ...s,
      campaignPatch: {
        ...s.campaignPatch,
        [p.id]: {
          title: p.title,
          purpose: p.purpose,
          targetAmount: p.targetAmount,
          deadline: p.deadline,
        },
      },
    }));
    return ok(undefined);
  },
  async closeCampaign(p) {
    update((s) => ({
      ...s,
      campaignPatch: { ...s.campaignPatch, [p.id]: { ...s.campaignPatch[p.id], status: "closed" } },
    }));
    return ok(0);
  },
  updateSettings: async () => ok(undefined),
  async addFundAccount(p) {
    const a: FundAccountAdmin = {
      id: crypto.randomUUID(),
      method: p.method,
      accountNumber: p.accountNumber,
      holderName: p.holderName,
      sortOrder: 99,
      active: true,
      note: p.note ?? null,
    };
    update((s) => ({ ...s, accounts: [...s.accounts, a] }));
    return ok(a.id);
  },
  updateFundAccount: async () => ok(undefined),
  async createCommitteeAccount(p) {
    const login = parseLogin(p.login);
    if (!login) {
      await wait();
      return { ok: false, code: "bad_login", message: "اكتب رقم هاتف أو بريدًا صحيحًا." };
    }
    // like the server: the same login twice (e.g. a retry after a lost answer) is taken
    if (demoLogins.has(login.display)) {
      await wait();
      return { ok: false, code: "login_taken", message: "هذا البريد أو الرقم مستخدم لحساب آخر." };
    }
    demoLogins.add(login.display);
    return ok({ userId: crypto.randomUUID(), login: login.display, password: generatePassword() });
  },
  async resetCommitteePassword() {
    return ok({ userId: "demo", login: "+22236123456", password: generatePassword() });
  },
  setCommitteeActive: async () => ok(undefined),
  setCommitteeMember: async () => ok(undefined),
  linkCommitteeMember: async () => ok(undefined),
  deleteCommitteeAccount: async () => ok(undefined),
  updateMyProfile: async () => ok(undefined),
  signOutEverywhere: async () => ok(undefined),
  async startHandover(p) {
    const h: Handover = {
      id: p.id,
      fromTerm: 2,
      toTerm: null,
      status: "draft",
      countedLines: [],
      countedBalance: null,
      computedBalance: null,
      difference: null,
      liveBalance: 0,
      carryOver: [],
      note: p.note ?? null,
      startedAt: now(),
      startedByName: DEMO_USER,
      submittedAt: null,
      submittedByName: null,
      acceptedAt: null,
      acceptedByName: null,
      cancelledAt: null,
      cancelReason: null,
    };
    update((s) => ({ ...s, handover: h }));
    return ok(p.id);
  },
  async updateHandoverDraft(p) {
    update((s) =>
      s.handover
        ? {
            ...s,
            handover: {
              ...s.handover,
              countedLines: p.countedLines.map((l) => ({ ...l })),
              countedBalance: p.countedLines.reduce((t, l) => t + l.amount, 0),
              carryOver: p.carryOver ?? [],
              note: p.note ?? null,
            },
          }
        : s,
    );
    return ok(undefined);
  },
  async submitHandover() {
    update((s) =>
      s.handover
        ? {
            ...s,
            // demo: submitted by «someone else» so the accept step can be tried too, and a
            // 1 000 transfer confirmed after the submit, so the accept screen shows the change
            handover: {
              ...s.handover,
              status: "submitted",
              computedBalance: handoverBalance - 1000,
              submittedAt: now(),
              startedByName: "المسؤول السابق",
              submittedByName: "المسؤول السابق",
            },
          }
        : s,
    );
    return ok(undefined);
  },
  async acceptHandover() {
    update((s) =>
      s.handover
        ? {
            ...s,
            handover: {
              ...s.handover,
              status: "confirmed",
              toTerm: 3,
              acceptedAt: now(),
              acceptedByName: DEMO_USER,
            },
          }
        : s,
    );
    return ok(3);
  },
  async cancelHandover(p) {
    update((s) =>
      s.handover
        ? {
            ...s,
            handover: {
              ...s.handover,
              status: "cancelled",
              cancelledAt: now(),
              cancelReason: p.reason,
            },
          }
        : s,
    );
    return ok(undefined);
  },
  setPassword: async () => ok(undefined),
  completeSetup: async () => ok(undefined),
  async addMember(p) {
    const m: MemberAdmin = {
      memberId: crypto.randomUUID(),
      listCode: p.listCode,
      number: p.number,
      memberRef: `${p.listCode}-${p.number}`,
      fullName: p.fullName,
      groupCode: p.groupCode,
      status: p.status ?? "active",
      monthsPaidThisYear: 0,
      monthsBehind: 0,
      amountOwed: 0,
      phone: p.phone ?? null,
      note: p.note ?? null,
      joinedMonth: p.fromMonth,
      formerDebtMonths: null,
      formerDebtAmount: null,
    };
    update((s) => ({ ...s, members: [...s.members, m] }));
    return ok(m.memberId);
  },
  async nextMemberNumber() {
    await wait();
    return { ok: false, code: "demo", message: "" }; // the screen keeps its local guess
  },
  async updateMember(p) {
    update((s) => ({
      ...s,
      memberPatch: {
        ...s.memberPatch,
        [p.memberId]: {
          ...s.memberPatch[p.memberId],
          fullName: p.fullName,
          phone: p.phone,
          note: p.note,
          ...(p.number ? { number: p.number } : {}),
        },
      },
    }));
    return ok(undefined);
  },
  async changeMemberStatus(p) {
    update((s) => ({
      ...s,
      memberPatch: {
        ...s.memberPatch,
        [p.memberId]: { ...s.memberPatch[p.memberId], status: p.status },
      },
    }));
    return ok("demo");
  },
  async changeMemberGroup(p) {
    update((s) => ({
      ...s,
      memberPatch: {
        ...s.memberPatch,
        [p.memberId]: { ...s.memberPatch[p.memberId], groupCode: p.groupCode },
      },
    }));
    return ok("demo");
  },
  async applyCredit(p) {
    const keys = p.months.map((x) => `${x.year}-${String(x.month).padStart(2, "0")}`);
    update((s) => ({
      ...s,
      creditPaid: {
        ...s.creditPaid,
        [p.memberId]: [...new Set([...(s.creditPaid[p.memberId] ?? []), ...keys])],
      },
    }));
    return ok({ id: p.id, replay: false, receiptCode: nextCode() });
  },
  cancelLastPeriod: async () => ok("demo"),
  async setJoinMonth(p) {
    update((s) => ({
      ...s,
      memberPatch: {
        ...s.memberPatch,
        [p.memberId]: { ...s.memberPatch[p.memberId], joinedMonth: p.fromMonth },
      },
    }));
    return ok("demo");
  },
  setCommitteeNotMember: async () => ok(undefined),
  setGroupPrice: async () => ok(undefined),
  savePushSubscription: async () => ok(undefined),
  deletePushSubscription: async () => ok(undefined),
  // m29–m30 (Lane A): not in the demo yet
  createLevy: async (p) => ok(p.id),
  addLevyMembers: async (p) => ok(p.memberIds.length),
  setLevyShare: async () => ok(undefined),
  exemptLevyShare: async () => ok(undefined),
  unexemptLevyShare: async () => ok(undefined),
  setPushKinds: async () => ok(undefined),
  createGroup: async () => ok("C"),
  moveMembersToGroup: async (p) =>
    ok({
      moved: p.memberIds?.length ?? 0,
      skippedAlreadyInTarget: 0,
      blocked: [],
      fromFee: null,
      toFee: null,
    }),
  retireGroup: async () => ok(undefined),
  // m38 (Lane A): not in the demo yet
  addExpenseActivity: async () => ok(99),
  renameExpenseActivity: async () => ok(undefined),
  setExpenseActivityActive: async () => ok(undefined),
  // m41 (Lane A): not in the demo yet
  addWalletType: async () => ok(99),
  updateWalletType: async () => ok(undefined),
  setWalletTypeActive: async () => ok(undefined),
  addWalletAccount: async () => ok(crypto.randomUUID()),
  uploadWalletLogo: async () => ok({ path: "0000000000000000.png" }),
  // m43 (Lane A): not in the demo yet
  replaceWalletAccount: async () => ok(crypto.randomUUID()),
  correctWalletAccount: async () => ok(undefined),
} satisfies Sim;

/* ───────────── context ───────────── */
const DemoCtx = createContext(false);

/** Mounted once in the root layout with the server's demo decision. */
export function DemoProvider({ demo: on, children }: { demo: boolean; children: ReactNode }) {
  return <DemoCtx value={on}>{children}</DemoCtx>;
}
export const useIsDemo = () => useContext(DemoCtx);

const safeAll = (acts: Record<string, unknown>, report?: (e: unknown) => boolean) =>
  Object.fromEntries(
    Object.entries(acts).map(([k, f]) => [
      k,
      typeof f === "function" ? safeAct(f as () => Promise<ActionResult<unknown>>, report) : f,
    ]),
  ) as Actions;

// built once (stable identities); a key with no decision fails loudly instead of calling the server
const DEMO_ACTIONS = safeAll(
  Object.fromEntries(
    Object.keys(real).map((k) => {
      const d = (demo as Record<string, unknown>)[k];
      const fail = () => {
        console.error(`demo: no simulation for ${k}`);
        throw new Error(`demo: no simulation for ${k}`);
      };
      return [k, d === "real" ? real[k as keyof Actions] : (d ?? fail)];
    }),
  ),
);
// an action the server no longer knows (a deploy since this page loaded): Lane B shows «تحديث»
const REAL_ACTIONS = safeAll(real, reportActionError);

/** Committee actions: real server actions, or simulated ones in demo mode (stable identities). */
export function useAct(): Actions {
  return useContext(DemoCtx) ? DEMO_ACTIONS : REAL_ACTIONS;
}

/** Demo only: a plainly fictional transfer screenshot (PNG data URL), one look per path. */
function demoProofImage(path: string): string | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 360;
  c.height = 640;
  const g = c.getContext("2d");
  if (!g) return null;
  const n = [...path].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  g.fillStyle = "#f2f4f3";
  g.fillRect(0, 0, 360, 640);
  g.fillStyle = "#1a5f2e";
  g.fillRect(0, 0, 360, 120);
  g.fillStyle = "#fff";
  g.font = "bold 26px system-ui";
  g.textAlign = "center";
  g.fillText("تحويل ناجح", 180, 72);
  g.fillStyle = "#14201a";
  g.font = "bold 34px system-ui";
  g.fillText(`${(n % 9) + 1}00 MRU`, 180, 220);
  g.font = "20px system-ui";
  g.fillStyle = "#56645c";
  g.fillText("صورة تجريبية، ليست إيصالًا حقيقيًا", 180, 280);
  g.fillText(`TX-DEMO-${1000 + (n % 9000)}`, 180, 330);
  g.fillStyle = "#cdd5d0";
  for (let i = 0; i < 4; i++) g.fillRect(60, 400 + i * 40, i % 2 ? 180 : 240, 12);
  return c.toDataURL("image/png");
}
