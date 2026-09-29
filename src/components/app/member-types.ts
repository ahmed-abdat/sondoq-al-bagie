// Member access (personal link, docs/MEMBER-ACCESS.md): the Lane A contract, verbatim.
// TODO(lane-a): when src/lib/data/member-types.ts lands, re-export from it and drop these copies.
import type { AllocationInput } from "@/lib/data/schemas";
import type { MembershipStatus, PaymentMethod, PendingPayment } from "@/lib/data/types";

/** httpOnly cookie holding the link token (1 year). */
export const MEMBER_COOKIE = "bq_member";
/** Readable marker set and cleared with it: static pages ask the server only when it exists. */
export const MEMBER_MARKER_COOKIE = "bq_member_on";
/** Demo only (fixtures, non-production): the value `/m/demo` puts in MEMBER_COOKIE. */
export const DEMO_MEMBER_TOKEN = "demo";

export type MemberSession = {
  linkId: string;
  memberId: string;
  memberRef: string;
  listCode: string;
  number: number;
  fullName: string;
  groupCode: string;
  status: MembershipStatus;
  monthsBehind: number;
  amountOwed: number;
  /** "YYYY-MM", oldest first */
  lateMonths: string[];
  credit: number;
};

export type MemberHistoryItem = {
  id: string;
  status: "pending" | "confirmed" | "rejected" | "cancelled";
  amount: number;
  method: PaymentMethod;
  paidOn: string;
  createdAt: string;
  decidedAt: string | null;
  receiptCode: string | null;
  rejectReason: string | null;
  payerName: string;
  sentByMe: boolean;
  forMe: boolean;
  allocations: {
    kind: "months" | "campaign" | "credit";
    memberId: string | null;
    memberRef: string | null;
    fullName: string | null;
    year: number | null;
    month: number | null;
    amount: number;
    campaignTitle: string | null;
  }[];
};

export type Beneficiary = { memberId: string; memberRef: string; fullName: string };

export type MemberSubmitInput = {
  /** one uuid per open sheet (a retry replays) */
  id: string;
  payerName: string;
  /** not paper, not credit */
  method: PaymentMethod;
  amount: number;
  paidOn: string;
  allocations: AllocationInput[];
  txnRef?: string;
  proofPath: string;
  proofHash: string;
  note?: string;
};
export type MemberSubmitResult = { id: string; replay: boolean; pendingOverlap: boolean };

export type MemberLinkInfo = { memberId: string; createdAt: string; lastUsedAt: string | null };
export type IssuedMemberLink = { memberId: string; url: string };

/** A pending payment in the committee queue, maybe sent by a member through their link. */
export type QueuedPayment = PendingPayment & {
  submittedByMember?: { memberRef: string; fullName: string } | null;
};
