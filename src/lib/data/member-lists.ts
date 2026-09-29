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

const ym = (m: Pick<MemberMonth, "year" | "month">) =>
  `${m.year}-${String(m.month).padStart(2, "0")}`;

/**
 * `months`: this year's months of every member (with prices); `pastLate`: late months of earlier
 * years; `groupPrices`: this year's monthly price per group code. Rows carry `pastLate` and only
 * the month prices that differ from the member's current-group price (see MemberRow).
 */
export function toMemberRows(
  members: MemberStatus[],
  months: MemberMonth[],
  year: number,
  extra: { pastLate?: MemberMonth[]; groupPrices?: Record<string, number> } = {},
) {
  const by = monthsByMember(months);
  const pastBy = monthsByMember(extra.pastLate ?? []);
  return members.filter(listed).map((m): MemberRow => {
    const own = by.get(m.memberId) ?? [];
    const past = (pastBy.get(m.memberId) ?? []).filter((x) => x.year < year && x.state === "late");
    const row: MemberRow = { ...m, months: encodeMonths(own, year) };
    if (past.length) row.pastLate = past.map(ym).sort();
    if (extra.groupPrices) {
      const base = extra.groupPrices[m.groupCode] ?? null;
      const payable = [
        ...own.filter((x) => x.year === year && (x.state === "late" || x.state === "upcoming")),
        ...past,
      ];
      const prices: Record<string, number | null> = {};
      for (const x of payable) {
        if (x.price !== undefined && x.price !== base) prices[ym(x)] = x.price;
      }
      if (Object.keys(prices).length) row.prices = prices;
    }
    return row;
  });
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
