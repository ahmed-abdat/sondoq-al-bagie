import "server-only";
// TODO(lane-a): stand-in for src/lib/data/member.ts (server-only reads that take the cookie).
// Until it lands, real mode has no member session, so nothing personal is ever shown.
import type {
  Beneficiary,
  MemberHistoryItem,
  MemberLinkInfo,
  MemberSession,
} from "./member-types";

export async function memberSession(): Promise<MemberSession | null> {
  return null;
}
export async function memberHistory(): Promise<MemberHistoryItem[]> {
  return [];
}
export async function memberRecentBeneficiaries(): Promise<Beneficiary[]> {
  return [];
}
export async function getMemberLinks(): Promise<Record<string, MemberLinkInfo>> {
  return {};
}
