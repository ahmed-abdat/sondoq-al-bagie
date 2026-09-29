// Member access (personal link, docs/MEMBER-ACCESS.md): types shared by the server reads
// (./member), the member actions (./member-actions) and the UI. Client-safe: no server imports.
import type { RecordPaymentInput } from "./schemas";
import type { ListCode, MembershipStatus, PaymentMethod, PaymentStatus } from "./types";

/** httpOnly cookie holding the raw link token (1 year). Set by /m/[token] after verifyMemberToken. */
export const MEMBER_COOKIE = "bq_member";
export const MEMBER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** Non-httpOnly marker set next to MEMBER_COOKIE (value "1") so static pages know to fetch «أنت». */
export const MEMBER_MARKER_COOKIE = "bq_member_on";
/** httpOnly JSON array of the device's saved link tokens (active included), most recent first. */
export const MEMBER_SAVED_COOKIE = "bq_member_saved";
/** httpOnly, 10 minutes: another member's link opened on this device, awaiting «أضف وانتقل» / «ابقَ». */
export const MEMBER_PENDING_COOKIE = "bq_member_pending";
export const MEMBER_PENDING_MAX_AGE = 60 * 10;
/** Family phones: at most this many member profiles on one device. */
export const MAX_MEMBER_PROFILES = 5;

/** The member behind the link on this device («أنت»). Their own debt is shown to them. */
export type MemberSession = {
  linkId: string;
  memberId: string;
  /** "B-12" */
  memberRef: string;
  listCode: ListCode;
  number: number;
  fullName: string;
  groupCode: string;
  status: MembershipStatus;
  monthsBehind: number;
  /** MRO owed now (late months) */
  amountOwed: number;
  /** late months, "YYYY-MM" oldest first (past years included) */
  lateMonths: string[];
  /** unspent credit, MRO */
  credit: number;
};

export type MemberHistoryAllocation = {
  kind: "months" | "campaign" | "credit";
  memberId: string | null;
  memberRef: string | null;
  fullName: string | null;
  year: number | null;
  month: number | null;
  amount: number;
  campaignTitle: string | null;
};

/** «دفعاتي»: payments that cover me, and payments sent through my link (for anyone). */
export type MemberHistoryItem = {
  id: string;
  status: PaymentStatus;
  amount: number;
  method: PaymentMethod;
  /** YYYY-MM-DD */
  paidOn: string;
  createdAt: string;
  decidedAt: string | null;
  /** confirmed, non-paper: link /r/<code> */
  receiptCode: string | null;
  rejectReason: string | null;
  payerName: string;
  /** submitted through this link */
  sentByMe: boolean;
  /** covers my months or credit */
  forMe: boolean;
  allocations: MemberHistoryAllocation[];
};

/** «دفعت لهم سابقًا»: members covered by earlier submissions through this link. */
export type Beneficiary = { memberId: string; memberRef: string; fullName: string };

/** Same shape as the committee's recordPayment, minus what members cannot choose. */
export type MemberSubmitInput = Omit<RecordPaymentInput, "proofPath" | "proofHash"> & {
  /** from memberUploadProof (required) */
  proofPath: string;
  proofHash: string;
};

export type MemberSubmitResult = {
  id: string;
  /** the same id was already submitted (retry): nothing new was written */
  replay: boolean;
  /** another pending payment covers one of these member-months */
  pendingOverlap: boolean;
};

/** Committee: the member's active link (never the token). */
export type MemberLinkInfo = { memberId: string; createdAt: string; lastUsedAt: string | null };

/** Committee: a new link, shown once (send it on WhatsApp). */
export type IssuedMemberLink = { memberId: string; url: string };

/** One saved profile on this device (the «أنت» switcher). */
export type MemberProfile = {
  linkId: string;
  memberId: string;
  memberRef: string;
  fullName: string;
  /** the profile this device acts as now */
  active: boolean;
};

/** What opening /m/<token> did on this device. */
export type OpenLinkOutcome = "active" | "pending" | "invalid";
