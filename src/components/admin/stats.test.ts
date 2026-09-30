import { describe, expect, it } from "vitest";
import { campaignStats, feeStats, levyStats, pct } from "./stats";
import type { PCampaign, PLevy, PMember } from "./types";

const mem = (ref: string, p: Partial<PMember> = {}): PMember => ({
  id: ref,
  ref,
  group: ref.startsWith("A") ? "A" : "B",
  no: Number(ref.slice(2)),
  name: `م ${ref}`,
  phone: null,
  status: "active",
  fee: 1000,
  paid: [1, 2, 3],
  owed: [],
  notOwed: [],
  pastLate: [],
  lastReminded: null,
  ...p,
});

describe("analytics", () => {
  it("fees: paid up to the due month, by group, how far behind", () => {
    const members = [
      mem("A-1"),
      mem("A-2", { paid: [1, 2], owed: [3] }),
      mem("B-1", { paid: [], owed: [1, 2, 3], pastLate: ["2025-12"] }),
      mem("B-2", { status: "left" }),
    ];
    const s = feeStats({ members, due: 3 });
    expect([s.total, s.paid, s.pct]).toEqual([3, 1, 33]);
    expect(s.A).toEqual({ total: 2, paid: 1, pct: 50 });
    expect(s.B).toEqual({ total: 1, paid: 0, pct: 0 });
    expect(s.months[2]).toEqual({ month: 3, paid: 1, unpaid: 2 });
    expect(s.owe).toEqual({ one: 1, twoThree: 0, fourPlus: 1 });
  });
  it("levy: exempt members are out of the percentage", () => {
    const l: PLevy = {
      id: "l1",
      title: "ل",
      purpose: "",
      perMember: 500,
      scope: "",
      createdOn: "2026-09-01",
      createdBy: "",
      status: "open",
      refs: ["A-1", "A-2", "B-1", "B-3"],
      paidRefs: ["A-1", "B-1"],
      exemptRefs: ["B-3"],
      amounts: { "B-1": 300 },
    };
    const s = levyStats(l, [mem("A-1"), mem("A-2"), mem("B-1"), mem("B-3")], "2026-09-30");
    expect([s.paid, s.notYet, s.exempt, s.pct]).toEqual([2, 1, 1, 67]);
    expect([s.collected, s.expected, s.days]).toEqual([800, 1300, 29]);
    expect(s.B).toEqual({ total: 1, paid: 1, pct: 100 });
  });
  it("donation: members and outside donors, % of members", () => {
    const c = {
      collected: 7000,
      target: 10000,
      gifts: [
        { ref: "A-1", name: "", amount: 1, at: "", method: "cash" },
        { ref: "A-1", name: "", amount: 1, at: "", method: "cash" },
        { ref: null, name: "", amount: 1, at: "", method: "cash" },
      ],
    } as unknown as PCampaign;
    const s = campaignStats(c, [mem("A-1"), mem("A-2"), mem("A-3"), mem("A-4")]);
    expect(s).toMatchObject({ givers: 2, members: 1, outside: 1, pctMembers: 25, pctTarget: 70 });
    expect(pct(1, 0)).toBe(0);
  });
});
