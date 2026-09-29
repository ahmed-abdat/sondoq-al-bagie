"use client";
// The seam for member-link writes (personal link), like useAct() for the committee: the real
// server actions, or in demo mode a simulation in the browser (never the server). A member's
// submission also shows up in the demo committee queue with «أرسلها العضو … عبر رابطه».
// The committee's createMemberLink / revokeMemberLink go through useAct().
import { useSyncExternalStore } from "react";
import { reportActionError } from "@/components/providers";
import type { ActionResult, PendingPayment } from "@/lib/data/types";
import { knownMember, pushDemoPending, useIsDemo } from "./act";
import * as memberActions from "@/lib/data/member-actions";
// TODO(lane-a): memberSwitch / memberAcceptPending / memberDeclinePending from member-actions
import * as profileActions from "./lane-a-profiles-actions";
import type { MemberHistoryItem, MemberSession } from "./member-types";
import {
  demoMemberAccept,
  demoMemberDecline,
  demoMemberSignOut,
  demoMemberSwitch,
} from "./member-view-action";
import { safeAct } from "./safe-act";

const real = { ...memberActions, ...profileActions };
type Actions = typeof real;

/* ───────────── demo store ───────────── */
export type MemberDemo = {
  /** submissions sent in this demo session, newest first */
  sent: MemberHistoryItem[];
};
const EMPTY: MemberDemo = { sent: [] };
let state = EMPTY;
const subs = new Set<() => void>();
const update = (f: (s: MemberDemo) => MemberDemo) => {
  state = f(state);
  subs.forEach((cb) => cb());
};
export function useMemberDemo(): MemberDemo {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
    () => EMPTY,
  );
}

/** Demo only: who the demo member is (the card sets it; the submit stub labels the queue). */
let demoMe: Pick<MemberSession, "memberId" | "memberRef" | "fullName"> | null = null;
export function rememberDemoMember(s: typeof demoMe) {
  demoMe = s;
}

const wait = () => new Promise((r) => setTimeout(r, 400));
const ok = async <T,>(data: T): Promise<ActionResult<T>> => {
  await wait();
  return { ok: true, data };
};
const now = () => new Date().toISOString();

const demo: Actions = {
  async memberUploadProof(form) {
    const file = form.get("file");
    const path = file instanceof Blob ? `demo:${URL.createObjectURL(file)}` : "demo:";
    return ok({ path, hash: "0".repeat(64) });
  },
  async memberSubmitPayment(p) {
    if (state.sent.some((x) => x.id === p.id))
      return ok({ id: p.id, replay: true, pendingOverlap: false });
    const who = (id: string | null | undefined) => (id ? knownMember(id) : null);
    const item: MemberHistoryItem = {
      id: p.id,
      status: "pending",
      amount: p.amount,
      method: p.method,
      paidOn: p.paidOn,
      createdAt: now(),
      decidedAt: null,
      receiptCode: null,
      rejectReason: null,
      payerName: p.payerName,
      sentByMe: true,
      forMe: p.allocations.some((a) => a.memberId && a.memberId === demoMe?.memberId),
      allocations: p.allocations.map((a) => {
        const m = who(a.memberId);
        return {
          kind: a.kind,
          memberId: a.memberId ?? null,
          memberRef: m ? `${m.listCode}-${m.number}` : null,
          fullName: m?.fullName ?? null,
          year: a.kind === "months" ? (a.year ?? null) : null,
          month: a.kind === "months" ? a.month : null,
          amount: a.amount,
          campaignTitle: null,
        };
      }),
    };
    const pay: PendingPayment = {
      id: p.id,
      status: "pending",
      payerName: p.payerName,
      method: p.method,
      amount: p.amount,
      paidOn: p.paidOn,
      txnRef: p.txnRef ?? null,
      proofPath: p.proofPath,
      note: p.note ?? null,
      createdAt: item.createdAt,
      createdByName: null,
      decidedAt: null,
      decidedByName: null,
      rejectReason: null,
      cancelReason: null,
      receiptCode: null,
      receiptNo: null,
      submittedByMember: demoMe ? { memberRef: demoMe.memberRef, fullName: demoMe.fullName } : null,
      allocations: p.allocations.map((a) => {
        const m = who(a.memberId) ?? { fullName: p.payerName, listCode: "", number: 0 };
        return a.kind === "months"
          ? { ...a, ...m, year: a.year ?? 0 }
          : a.kind === "campaign"
            ? {
                kind: "campaign" as const,
                campaignId: a.campaignId,
                memberId: a.memberId ?? null,
                listCode: null,
                number: null,
                fullName: m.fullName,
                amount: a.amount,
              }
            : { kind: "credit" as const, memberId: a.memberId, ...m, amount: a.amount };
      }),
    };
    const key = (a: { memberId?: string | null; year?: number | null; month?: number | null }) =>
      a.month ? `${a.memberId}:${a.year}-${a.month}` : "";
    const mine = new Set(item.allocations.map(key).filter(Boolean));
    const pendingOverlap = state.sent.some((x) => x.allocations.some((a) => mine.has(key(a))));
    update((s) => ({ ...s, sent: [item, ...s.sent] }));
    pushDemoPending(pay);
    return ok({ id: p.id, replay: false, pendingOverlap });
  },
  async memberSignOut() {
    update(() => EMPTY);
    return demoMemberSignOut();
  },
  // this phone's profiles (cookies, so the server pages follow)
  // (a demo submission belongs to the person who sent it: the list starts again)
  async memberSwitch(p) {
    update(() => EMPTY);
    return demoMemberSwitch(p);
  },
  async memberAcceptPending() {
    update(() => EMPTY);
    return demoMemberAccept();
  },
  memberDeclinePending: () => demoMemberDecline(),
  // Lane B's push toggle (demo: nothing is stored)
  memberSavePush: async () => ok(undefined),
  memberDeletePush: async () => ok(undefined),
};

const wrap = (acts: Actions, report?: (e: unknown) => boolean) =>
  Object.fromEntries(
    Object.entries(acts).map(([k, f]) => [
      k,
      safeAct(f as () => Promise<ActionResult<unknown>>, report),
    ]),
  ) as unknown as Actions;
const DEMO_ACTIONS = wrap(demo);
const REAL_ACTIONS = wrap(real, reportActionError);

/** Member-link writes: real server actions, or simulated ones in demo mode. */
export function useMemberAct(): Actions {
  return useIsDemo() ? DEMO_ACTIONS : REAL_ACTIONS;
}
