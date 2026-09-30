// «الإحصاءات» (plan §10): counts and percentages only, never names. Pure, tested.
import type { PCampaign, PData, PLevy, PMember } from "./types";

export const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

const upToDate = (m: PMember) => m.owed.length === 0 && m.pastLate.length === 0;

/** Fees of the year: who is paid up to the due month, per group, per month, and how far behind. */
export function feeStats(d: Pick<PData, "members" | "due">) {
  const active = d.members.filter((m) => m.status === "active");
  const group = (g: "A" | "B") => {
    const list = active.filter((m) => m.group === g);
    const paid = list.filter(upToDate).length;
    return { total: list.length, paid, pct: pct(paid, list.length) };
  };
  const paid = active.filter(upToDate).length;
  const behind = (m: PMember) => m.owed.length + m.pastLate.length;
  return {
    total: active.length,
    paid,
    pct: pct(paid, active.length),
    A: group("A"),
    B: group("B"),
    /** months 1..due: members who paid that month / who owed it and did not */
    months: Array.from({ length: d.due }, (_, i) => {
      const k = i + 1;
      return {
        month: k,
        paid: active.filter((m) => m.paid.includes(k)).length,
        unpaid: active.filter((m) => m.owed.includes(k)).length,
      };
    }),
    owe: {
      one: active.filter((m) => behind(m) === 1).length,
      twoThree: active.filter((m) => behind(m) >= 2 && behind(m) <= 3).length,
      fourPlus: active.filter((m) => behind(m) >= 4).length,
    },
  };
}

const daysBetween = (from: string, to: string) =>
  Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));

/** One لوحة: paid / not yet / exempt, collected vs expected, per group, days open. */
export function levyStats(l: PLevy, members: PMember[], today: string) {
  const exempt = new Set(l.exemptRefs ?? []);
  const paidSet = new Set(l.paidRefs);
  const share = (r: string) => l.amounts?.[r] ?? l.perMember;
  const owing = l.refs.filter((r) => !exempt.has(r));
  const paid = owing.filter((r) => paidSet.has(r));
  const groupOf = new Map(members.map((m) => [m.ref, m.group]));
  const group = (g: "A" | "B") => {
    const list = owing.filter((r) => groupOf.get(r) === g);
    const p = list.filter((r) => paidSet.has(r)).length;
    return { total: list.length, paid: p, pct: pct(p, list.length) };
  };
  const expected = owing.reduce((s, r) => s + share(r), 0);
  const collected = paid.reduce((s, r) => s + share(r), 0);
  return {
    total: l.refs.length,
    paid: paid.length,
    notYet: owing.length - paid.length,
    exempt: l.refs.length - owing.length,
    pct: pct(paid.length, owing.length),
    expected,
    collected,
    A: group("A"),
    B: group("B"),
    days: l.createdOn ? daysBetween(l.createdOn, today) : null,
  };
}

/** One تبرع: how many gave (members + outside donors), % of members, collected vs target. */
export function campaignStats(c: PCampaign, members: PMember[]) {
  const active = members.filter((m) => m.status === "active").length;
  const memberRefs = new Set(c.gifts.flatMap((g) => (g.ref ? [g.ref] : [])));
  const outside = c.gifts.filter((g) => !g.ref).length;
  return {
    givers: memberRefs.size + outside,
    members: memberRefs.size,
    outside,
    pctMembers: pct(memberRefs.size, active),
    collected: c.collected,
    target: c.target,
    pctTarget: c.target > 0 ? pct(c.collected, c.target) : null,
  };
}

export type FeeStats = ReturnType<typeof feeStats>;
export type LevyStats = ReturnType<typeof levyStats>;
export type CampaignStats = ReturnType<typeof campaignStats>;
export type AllStats = {
  fees: FeeStats;
  /** active members who owe fees (any year) or an open لوحة share */
  owing: number;
  levies: Record<string, LevyStats>;
  campaigns: Record<string, CampaignStats>;
};

/**
 * Every number the screens show, computed once in the data door (source.ts) from the same
 * committee reads as the rest of the page; screens never recount. When the stats read lands
 * (plan §10, Lane A) source.ts swaps it in here.
 */
export function allStats(d: Omit<PData, "stats">): AllStats {
  const levyOwing = new Set(
    d.levies.flatMap((l) =>
      l.refs.filter((r) => !l.paidRefs.includes(r) && !l.exemptRefs?.includes(r)),
    ),
  );
  const owing = d.members.filter(
    (m) => m.status === "active" && (!upToDate(m) || levyOwing.has(m.ref)),
  ).length;
  return {
    fees: feeStats(d),
    owing,
    levies: Object.fromEntries(d.levies.map((l) => [l.id, levyStats(l, d.members, d.today)])),
    campaigns: Object.fromEntries(d.campaigns.map((c) => [c.id, campaignStats(c, d.members)])),
  };
}
