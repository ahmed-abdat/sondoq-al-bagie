// «الإحصاءات» (plan §10): counts and percentages only, never names. Pure, tested.
import { percent } from "@/lib/reports/doc";
import type {
  DonationStats,
  LevyStats as LevyStatsRow,
  StatsReport,
} from "@/lib/data/report-types";
import type { PCampaign, PData, PLevy, PMember } from "./types";

/**
 * A percentage as the reports print it (Lane B's percent()): never 100 unless everyone, never 0
 * unless nobody, so a screen and a shared report never disagree.
 */
export const pct = (n: number, of: number) => {
  const t = percent(n, of);
  return t === "—" ? 0 : parseInt(t, 10);
};

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
    /** the same point last year, when known */
    previous: null as number | null,
    A: group("A"),
    B: group("B"),
    /** all 12 months: who paid it (paid ahead counts too); unpaid only once the month started */
    months: Array.from({ length: 12 }, (_, i) => {
      const k = i + 1;
      return {
        month: k,
        paid: active.filter((m) => m.paid.includes(k)).length,
        unpaid: k <= d.due ? active.filter((m) => m.owed.includes(k)).length : 0,
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
  // groups and totals from the same shares, so the groups add up to the totals
  const group = (g: "A" | "B") => {
    const list = owing.filter((r) => groupOf.get(r) === g);
    const done = list.filter((r) => paidSet.has(r));
    return {
      total: list.length,
      paid: done.length,
      pct: pct(done.length, list.length),
      expected: list.reduce((s, r) => s + share(r), 0),
      collected: done.reduce((s, r) => s + share(r), 0),
    };
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

/** The server's «الإحصاءات» (m32) in the screens' shape: the numbers the reports print. */
export function statsFromReport(r: StatsReport, due: number, owing: number): AllStats {
  const g = (code: string) => {
    const x = r.fees.groups.find((y) => y.groupCode === code);
    return x
      ? { total: x.active, paid: x.paidUp, pct: pct(x.paidUp, x.active) }
      : { total: 0, paid: 0, pct: 0 };
  };
  const o = r.fees.overall;
  return {
    fees: {
      total: o.active,
      paid: o.paidUp,
      pct: pct(o.paidUp, o.active),
      previous: r.previous ? pct(r.previous.overall.paidUp, r.previous.overall.active) : null,
      A: g("A"),
      B: g("B"),
      months: r.fees.months.map((m) => ({
        month: m.month,
        paid: m.paid,
        unpaid: m.month <= due ? m.unpaid : 0,
      })),
      owe: { one: o.owe1, twoThree: o.owe2to3, fourPlus: o.owe4plus },
    },
    owing,
    levies: Object.fromEntries(
      r.levies.map((l) => {
        const lg = (code: string) => {
          const x = l.groups.find((y) => y.groupCode === code);
          const of = x ? x.paid + x.unpaid : 0;
          return {
            total: of,
            paid: x?.paid ?? 0,
            pct: x ? pct(x.paid, x.paid + x.unpaid) : 0,
            expected: x?.expected ?? 0,
            collected: x?.collected ?? 0,
          };
        };
        return [
          l.id,
          {
            total: l.shares,
            paid: l.paid,
            notYet: l.unpaid,
            exempt: l.exempt,
            pct: pct(l.paid, l.paid + l.unpaid),
            expected: l.expected,
            collected: l.collected,
            A: lg("A"),
            B: lg("B"),
            days: l.daysOpen,
          },
        ];
      }),
    ),
    campaigns: Object.fromEntries(
      r.donations.map((c) => [
        c.id,
        {
          givers: c.givers,
          members: c.memberGivers,
          outside: c.outsideGivers,
          pctMembers: pct(c.memberGivers, c.activeMembers),
          collected: c.collected,
          target: c.target ?? 0,
          pctTarget: c.target ? pct(c.collected, c.target) : null,
        },
      ]),
    ),
  };
}

/**
 * Demo only: the fictional data as the server's «الإحصاءات» report, so the demo screens and the
 * demo report images show the same numbers (production reads report_fee_stats etc.).
 */
export function demoStatsReport(d: Omit<PData, "stats">, previousPct: number | null): StatsReport {
  const f = feeStats(d);
  const active = d.members.filter((m) => m.status === "active");
  const block = (list: PMember[]) => {
    const up = list.filter(upToDate).length;
    const behind = (m: PMember) => m.owed.length + m.pastLate.length;
    return {
      active: list.length,
      paidUp: up,
      paidUpPct: list.length ? Math.round((up / list.length) * 1000) / 10 : 0,
      owe1: list.filter((m) => behind(m) === 1).length,
      owe2to3: list.filter((m) => behind(m) >= 2 && behind(m) <= 3).length,
      owe4plus: list.filter((m) => behind(m) >= 4).length,
    };
  };
  const fees = {
    year: d.year,
    refMonth: d.due,
    asOf: null,
    beforeRecords: false,
    overall: block(active),
    groups: (["A", "B"] as const).map((g) => ({
      groupCode: g,
      ...block(active.filter((m) => m.group === g)),
    })),
    months: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      active: f.total,
      paid: active.filter((m) => m.paid.includes(i + 1)).length,
      unpaid: i + 1 <= d.due ? active.filter((m) => m.owed.includes(i + 1)).length : 0,
    })),
  };
  const levies: LevyStatsRow[] = d.levies.map((l) => {
    const s = levyStats(l, d.members, d.today);
    const g = (code: "A" | "B") => {
      const refs = l.refs.filter((r) => d.members.find((m) => m.ref === r)?.group === code);
      const ex = refs.filter((r) => l.exemptRefs?.includes(r)).length;
      const x = s[code];
      return {
        groupCode: code,
        shares: refs.length,
        paid: x.paid,
        unpaid: x.total - x.paid,
        exempt: ex,
        paidPct: x.pct,
        expected: x.expected,
        collected: x.collected,
      };
    };
    return {
      id: l.id,
      title: l.title,
      status: l.status,
      openedOn: l.createdOn,
      daysOpen: s.days ?? 0,
      shares: s.total,
      paid: s.paid,
      unpaid: s.notYet,
      exempt: s.exempt,
      paidPct: s.pct,
      expected: s.expected,
      collected: s.collected,
      groups: [g("A"), g("B")].filter((x) => x.shares > 0),
    };
  });
  const donations: DonationStats[] = d.campaigns.map((c) => {
    const s = campaignStats(c, d.members);
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      openedOn: c.startedOn,
      memberGivers: s.members,
      outsideGivers: s.outside,
      givers: s.givers,
      activeMembers: active.length,
      memberPct: s.pctMembers,
      collected: s.collected,
      target: c.target || null,
      targetPct: s.pctTarget,
    };
  });
  return {
    period: { year: d.year },
    generatedAt: `${d.today}T12:00:00Z`,
    fees,
    previous:
      previousPct === null
        ? null
        : {
            ...fees,
            year: d.year - 1,
            overall: {
              ...fees.overall,
              paidUp: Math.round((previousPct * fees.overall.active) / 100),
              paidUpPct: previousPct,
            },
          },
    levies,
    donations,
  };
}

/** «عضو معفى» / «عضوان معفيان» / «3 أعضاء معفون» / «11 عضوًا معفى» (never «1 معفون»). */
export function exemptWords(n: number) {
  if (n === 1) return "عضو معفى";
  if (n === 2) return "عضوان معفيان";
  const r = n % 100;
  if (r >= 3 && r <= 10) return `${n} أعضاء معفون`;
  return `${n} عضوًا معفى`;
}
