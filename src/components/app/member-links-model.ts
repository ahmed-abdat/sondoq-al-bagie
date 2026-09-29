// «روابط الأعضاء»: who has a personal link (sent), who opened it (using), groups and the
// «أرسل للجميع بالترتيب» walk. Pure, unit tested.
import type { MemberLinkInfo } from "@/lib/data/member-types";
import type { MemberAdmin } from "@/lib/data/types";

export type LinkState = "none" | "sent" | "using";

export type LinkRow = Pick<
  MemberAdmin,
  "memberId" | "memberRef" | "listCode" | "number" | "fullName" | "phone" | "groupCode"
> & { state: LinkState };

/** An active link = sent; one used at least once = using. */
export const linkState = (link: MemberLinkInfo | null | undefined): LinkState =>
  !link ? "none" : link.lastUsedAt ? "using" : "sent";

/** Active members only, in paper order (list, number), with their link state. */
export function linkRows(
  members: MemberAdmin[],
  linkOf: (memberId: string) => MemberLinkInfo | null | undefined,
): LinkRow[] {
  return members
    .filter((m) => m.status === "active")
    .map((m) => ({
      memberId: m.memberId,
      memberRef: m.memberRef,
      listCode: m.listCode,
      number: m.number,
      fullName: m.fullName,
      phone: m.phone,
      groupCode: m.groupCode,
      state: linkState(linkOf(m.memberId)),
    }))
    .sort(
      (a, b) =>
        a.groupCode.localeCompare(b.groupCode) ||
        a.listCode.localeCompare(b.listCode) ||
        a.number - b.number,
    );
}

/** One section per fee group, with «sent/total». */
export function linkGroups(rows: LinkRow[]) {
  const codes = [...new Set(rows.map((r) => r.groupCode))];
  return codes.map((code) => {
    const items = rows.filter((r) => r.groupCode === code);
    return { code, items, sent: items.filter((r) => r.state !== "none").length };
  });
}

export function linkCounts(rows: LinkRow[]) {
  const sent = rows.filter((r) => r.state !== "none").length;
  return { total: rows.length, sent, left: rows.length - sent };
}

/**
 * The walk: the next member without a link after `afterId` (list order), or the first one when
 * `afterId` is null. `skip` = ids passed over in this walk. null = the walk is over.
 */
export function nextInWalk(
  rows: LinkRow[],
  afterId: string | null,
  skip: ReadonlySet<string> = new Set(),
): string | null {
  const start = afterId ? rows.findIndex((r) => r.memberId === afterId) + 1 : 0;
  return (
    rows.slice(start).find((r) => r.state === "none" && !skip.has(r.memberId))?.memberId ?? null
  );
}
