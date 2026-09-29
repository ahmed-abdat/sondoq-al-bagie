// Light member lists for the public pages (home search, /members): no per-month objects.
// Pure (unit tested); the cached server getters are in ./public.
import { encodeMonths } from "./month-code";
import type { MemberIndex, MemberMonth, MemberRow, MemberStatus } from "./types";

/** Public lists hide members who left (history is kept). */
const listed = (m: MemberStatus) => m.status !== "left" && m.status !== "deceased";

function monthsByMember(months: MemberMonth[]) {
  const by = new Map<string, MemberMonth[]>();
  for (const m of months) {
    const list = by.get(m.memberId);
    if (list) list.push(m);
    else by.set(m.memberId, [m]);
  }
  return by;
}

export function toMemberRows(members: MemberStatus[], months: MemberMonth[], year: number) {
  const by = monthsByMember(months);
  return members
    .filter(listed)
    .map((m): MemberRow => ({ ...m, months: encodeMonths(by.get(m.memberId) ?? [], year) }));
}

/** month: 1–12 of `year`, the month the home page counts («دفع X من N لشهر …»). */
export function toMemberIndex(
  members: MemberStatus[],
  months: MemberMonth[],
  year: number,
  month: number,
): MemberIndex {
  const paid = new Set(
    months
      .filter((m) => m.year === year && m.month === month && m.state === "paid")
      .map((m) => m.memberId),
  );
  const active = members.filter((m) => m.status === "active");
  return {
    members: members.filter(listed).map((m) => ({
      memberId: m.memberId,
      memberRef: m.memberRef,
      fullName: m.fullName,
      status: m.status,
      statusLabel: m.statusLabel,
    })),
    activeCount: active.length,
    paidThisMonth: active.filter((m) => paid.has(m.memberId)).length,
    year,
    month,
  };
}
