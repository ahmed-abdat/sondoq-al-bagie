"use client";
// The ONE seam between committee screens and the server actions. Normally it is the real
// `@/lib/data/actions`. In demo mode (see demo.ts) every call is simulated here after ~400 ms,
// updates a local store so the screens react, and never reaches the server.
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import * as real from "@/lib/data/actions";
import type {
  ActionResult,
  CampaignProgress,
  ExpenseAdmin,
  FundAccountAdmin,
  MemberAdmin,
  PendingPayment,
} from "@/lib/data/types";
import { DEMO_USER } from "./demo";

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
};
const EMPTY: DemoState = {
  pending: [],
  expenses: [],
  campaigns: [],
  campaignPatch: {},
  accounts: [],
  members: [],
  memberPatch: {},
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
const wait = () => new Promise((r) => setTimeout(r, 400));
const ok = async <T,>(data: T): Promise<ActionResult<T>> => {
  await wait();
  return { ok: true, data };
};
const now = () => new Date().toISOString();
let receiptSeq = 0;
const nextCode = () => `BQ-DEMO-${String(++receiptSeq).padStart(4, "0")}`;

const demo: Partial<Actions> = {
  async recordPayment(p) {
    const pay: PendingPayment = {
      id: p.id,
      status: "pending",
      payerName: p.payerName,
      method: p.method,
      amount: p.amount,
      paidOn: p.paidOn,
      txnRef: p.txnRef ?? null,
      proofPath: null,
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
          ? { ...a, listCode: "", number: 0, fullName: p.payerName, year: a.year ?? 0 }
          : a.kind === "campaign"
            ? {
                kind: "campaign",
                campaignId: a.campaignId,
                memberId: a.memberId ?? null,
                listCode: null,
                number: null,
                fullName: p.payerName,
                amount: a.amount,
              }
            : {
                kind: "credit",
                memberId: a.memberId,
                listCode: "",
                number: 0,
                fullName: p.payerName,
                amount: a.amount,
              },
      ),
    };
    update((s) => ({ ...s, pending: [...s.pending, pay] }));
    return ok({ id: p.id, status: "pending" as const, replay: false, receiptCode: null });
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
  async uploadProof() {
    return ok({ path: "demo/proof.jpg", hash: "0".repeat(64) });
  },
  async proofUrl() {
    await wait();
    return { ok: false, code: "demo", message: "صورة تجريبية" };
  },
  async recordExpense(p) {
    const e: ExpenseAdmin = {
      id: p.id,
      spentOn: p.spentOn,
      category: p.category,
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
  inviteCommitteeMember: async () => ok({ userId: "demo" }),
  setPassword: async () => ok(undefined),
  requestPasswordReset: async () => ok(undefined),
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
} as Partial<Actions>;

/* ───────────── context ───────────── */
const DemoCtx = createContext(false);

/** Mounted once in the root layout with the server's demo decision. */
export function DemoProvider({ demo: on, children }: { demo: boolean; children: ReactNode }) {
  return <DemoCtx value={on}>{children}</DemoCtx>;
}
export const useIsDemo = () => useContext(DemoCtx);

const DEMO_ACTIONS = { ...real, ...demo } as Actions;

/** Committee actions: real server actions, or simulated ones in demo mode (stable identities). */
export function useAct(): Actions {
  return useContext(DemoCtx) ? DEMO_ACTIONS : real;
}
