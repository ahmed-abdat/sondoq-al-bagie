// Member access (personal link, docs/MEMBER-ACCESS.md): Lane A's client-safe types, plus the
// demo value `/m/demo` puts in the cookie (fixtures, non-production only).
export * from "@/lib/data/member-types";

/** Demo only (fixtures, non-production): the value `/m/demo` puts in MEMBER_COOKIE. */
export const DEMO_MEMBER_TOKEN = "demo";

// TODO(lane-a): drop these when src/lib/data/member-types.ts exports them (a phone can hold up
// to 5 member profiles; the explicit exports here shadow the star export until then).
/** One member profile on this phone. */
export type MemberProfile = {
  linkId: string;
  memberId: string;
  memberRef: string;
  fullName: string;
  /** the one «أنت» shows now */
  active: boolean;
};
/** A link for someone else was opened here: waits for «أضف … وانتقل إليه» or «ابقَ باسم …». */
export type PendingMemberLink = { memberId: string; memberRef: string; fullName: string };
