import "server-only";
// TODO(lane-a): stand-in for memberProfiles / memberPending in src/lib/data/member.ts (a phone
// holds up to 5 member profiles). Until then: the one current link, never a pending one.
import { memberSession } from "@/lib/data/member";
import type { MemberProfile, PendingMemberLink } from "./member-types";

export async function memberProfiles(): Promise<MemberProfile[]> {
  const s = await memberSession();
  return s
    ? [
        {
          linkId: s.linkId,
          memberId: s.memberId,
          memberRef: s.memberRef,
          fullName: s.fullName,
          active: true,
        },
      ]
    : [];
}
export async function memberPending(): Promise<PendingMemberLink | null> {
  return null;
}
