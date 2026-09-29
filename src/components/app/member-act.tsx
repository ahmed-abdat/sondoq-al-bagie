"use client";
// The seam for member-link writes, like useAct() for the committee: the real server actions, or
// in demo mode a simulation in the browser (never the server). A member's submission also shows
// up in the demo committee queue with «أرسلها العضو … عبر رابطه».
import { useSyncExternalStore } from "react";
import { reportActionError } from "@/components/providers";
import type { ActionResult, PendingPayment } from "@/lib/data/types";
import { knownMember, pushDemoPending, useIsDemo } from "./act";
// TODO(lane-a): import from "@/lib/data/member-actions" (member writes) and use useAct() for
// createMemberLink / revokeMemberLink once they are in "@/lib/data/actions".
import * as real from "./lane-a-member-actions";
import type { MemberHistoryItem, MemberLinkInfo, MemberSession } from "./member-types";
import { demoMemberSignOut } from "./member-view-action";
import { safeAct } from "./safe-act";

type Actions = typeof real;

/* ───────────── demo store ───────────── */
export type MemberDemo = {
  /** submissions sent in this demo session, newest first */
  sent: MemberHistoryItem[];
  /** committee: links created (info) or stopped (null) in this demo session */
  links: Record<string, MemberLinkInfo | null>;
};
const EMPTY: MemberDemo = { sent: [], links: {} };
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
    const pay: PendingPayment & {
      submittedByMember: { memberRef: string; fullName: string } | null;
    } = {
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
  async createMemberLink({ memberId }) {
    update((s) => ({
      ...s,
      links: { ...s.links, [memberId]: { memberId, createdAt: now(), lastUsedAt: null } },
    }));
    // the demo link opens the demo member (a real link opens this member)
    return ok({ memberId, url: `${window.location.origin}/m/demo` });
  },
  async revokeMemberLink({ memberId }) {
    update((s) => ({ ...s, links: { ...s.links, [memberId]: null } }));
    return ok(undefined);
  },
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
