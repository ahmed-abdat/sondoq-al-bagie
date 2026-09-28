import { describe, expect, it } from "vitest";
import { toFundInfo, toFundSummary } from "./map";
import { assembleReport, PUBLIC_EXPENSES_LIMIT, type ReportInput } from "./report";
import type { Expense, MemberStatus } from "./types";

const member = (over: Partial<MemberStatus>): MemberStatus => ({
  memberId: "m1",
  listCode: "A",
  number: 1,
  memberRef: "A-1",
  fullName: "عضو",
  groupCode: "A",
  status: "active",
  monthsPaidThisYear: 0,
  monthsBehind: 0,
  statusLabel: "منتظم",
  amountOwed: 2000,
  ...over,
});

const expense = (spentOn: string, amount = 100): Expense => ({
  id: spentOn,
  spentOn,
  category: "sports",
  amount,
  note: null,
  campaignId: null,
});

const base = (over: Partial<ReportInput> = {}): ReportInput => ({
  year: 2026,
  summary: toFundSummary(null),
  terms: [
    {
      number: 1,
      title: "الدورة 1",
      startedOn: "2025-01-01",
      endedOn: "2025-12-31",
      openingBalance: 0,
      closingBalance: 5,
      collected: 0,
      spent: 0,
      adjustment: 0,
    },
    {
      number: 2,
      title: "الدورة 2",
      startedOn: "2026-01-01",
      endedOn: null,
      openingBalance: 5,
      closingBalance: null,
      collected: 0,
      spent: 0,
      adjustment: 0,
    },
  ],
  monthly: [{ year: 2026, month: 3, expected: 1000, collected: 500 }],
  members: [
    member({}),
    member({ memberId: "m2", memberRef: "B-1", status: "left", statusLabel: "منتظم" }),
  ],
  months: [
    { memberId: "m1", year: 2026, month: 1, state: "paid" },
    { memberId: "m1", year: 2026, month: 2, state: "late" },
    { memberId: "m1", year: 2026, month: 12, state: "paid" },
    { memberId: "m1", year: 2025, month: 12, state: "late" },
  ],
  expenses: [expense("2026-05-02"), expense("2025-12-30")],
  campaigns: [],
  info: toFundInfo(null),
  now: new Date("2026-09-28T12:00:00Z"),
  ...over,
});

describe("assembleReport", () => {
  it("builds the 12-month grid with prepaid months and fills missing ones", () => {
    const r = assembleReport(base());
    expect(r.members[0].months).toEqual([
      "paid",
      "late",
      "not_owed",
      "not_owed",
      "not_owed",
      "not_owed",
      "not_owed",
      "not_owed",
      "not_owed",
      "not_owed",
      "not_owed",
      "prepaid",
    ]);
    expect(r.members[0]).toMatchObject({ monthsPaid: 2, monthsBehind: 1 });
    expect(r.members[1].statusLabel).toBe("غادر");
    expect(r.monthly).toHaveLength(12);
    expect(r.monthly[2]).toEqual({ year: 2026, month: 3, expected: 1000, collected: 500 });
    expect(r.monthly[0]).toEqual({ year: 2026, month: 1, expected: 0, collected: 0 });
    expect(r.generatedAt).toBe("2026-09-28T12:00:00.000Z");
  });

  it("hides amounts owed unless the admin turned them on", () => {
    expect(assembleReport(base()).members[0].amountOwed).toBeNull();
    const on = assembleReport(base({ info: { ...toFundInfo(null), showAmountOwed: true } }));
    expect(on.members[0].amountOwed).toBe(2000);
    expect(on.showAmountOwed).toBe(true);
  });

  it("keeps the year's expenses and says when the public list may be cut", () => {
    const r = assembleReport(base());
    expect(r.expenses).toEqual([
      {
        spentOn: "2026-05-02",
        category: "sports",
        categoryLabel: "الرياضة",
        note: null,
        amount: 100,
        campaignId: null,
      },
    ]);
    expect(r.expensesComplete).toBe(true);
    const full = Array.from({ length: PUBLIC_EXPENSES_LIMIT }, () => expense("2026-02-01"));
    expect(assembleReport(base({ expenses: full })).expensesComplete).toBe(false);
    expect(
      assembleReport(base({ expenses: [...full.slice(1), expense("2025-12-01")] }))
        .expensesComplete,
    ).toBe(true);
  });

  it("picks the open term by default, or the one asked for", () => {
    expect(assembleReport(base()).term?.number).toBe(2);
    expect(assembleReport(base({ term: 1 })).term?.number).toBe(1);
    expect(assembleReport(base({ term: 9 })).term).toBeNull();
  });
});
