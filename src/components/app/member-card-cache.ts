// The «أنت» card's last answer, so moving between tabs does not flash it away while it refreshes.
import type { MemberHome } from "./member-view-action";

export const cardCache: { last: MemberHome | null | undefined } = { last: undefined };
/** After removing a person or switching: ask the server again. */
export function forgetMemberCard() {
  cardCache.last = undefined;
}
