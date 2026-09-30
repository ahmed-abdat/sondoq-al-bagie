import { describe, expect, it } from "vitest";
import { nothingToPay } from "./kit";
import type { PLevy, PMember } from "./types";

const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const mem = (p: Partial<PMember> = {}): PMember => ({
  id: "m1",
  ref: "A-1",
  group: "A",
  feeGroup: { code: "A", name: "أ" },
  no: 1,
  name: "م",
  phone: null,
  status: "active",
  fee: 1000,
  paid: all,
  owed: [],
  notOwed: [],
  pastLate: [],
  lastReminded: null,
  ...p,
});
const levy = (p: Partial<PLevy> = {}) =>
  ({ id: "l1", refs: ["A-1"], paidRefs: [], exemptRefs: [], perMember: 500, ...p }) as PLevy;

describe("nothingToPay (the payment picker's default list leaves these out)", () => {
  it("the whole year paid, no لوحة share: nothing to pay", () => {
    expect(nothingToPay(mem(), { levies: [] })).toBe(true);
  });
  it("months before joining count as nothing owed", () => {
    expect(
      nothingToPay(mem({ paid: [4, 5, 6, 7, 8, 9, 10, 11, 12], notOwed: [1, 2, 3] }), {
        levies: [],
      }),
    ).toBe(true);
  });
  it("a month not yet due is still payable (paying ahead)", () => {
    expect(nothingToPay(mem({ paid: all.slice(0, 9) }), { levies: [] })).toBe(false);
  });
  it("a late month of an earlier year is owed", () => {
    expect(nothingToPay(mem({ pastLate: ["2025-12"] }), { levies: [] })).toBe(false);
  });
  it("an unpaid لوحة share is owed; paid or exempt is not", () => {
    expect(nothingToPay(mem(), { levies: [levy()] })).toBe(false);
    expect(nothingToPay(mem(), { levies: [levy({ paidRefs: ["A-1"] })] })).toBe(true);
    expect(nothingToPay(mem(), { levies: [levy({ exemptRefs: ["A-1"] })] })).toBe(true);
    expect(nothingToPay(mem(), { levies: [levy({ refs: ["B-2"] })] })).toBe(true);
  });
  it("exempt, away or left members have nothing to pay", () => {
    for (const status of ["exempt", "away", "left"] as const)
      expect(nothingToPay(mem({ status, paid: [] }), { levies: [] })).toBe(true);
  });
});

import { monthCell } from "./kit";
describe("the member's month grid (QA pass 9 P0-4)", () => {
  // joined in April: January–March not owed; April–September paid; October–December empty
  const m = { paid: [4, 5, 6, 7, 8, 9], notOwed: [1, 2, 3] };
  it("paid «✓», not owed «—» «غير مستحق عليه», else empty", () => {
    expect(monthCell(m, 1)).toEqual({ mark: "—", label: "غير مستحق عليه" });
    expect(monthCell(m, 4)).toEqual({ mark: "✓", label: "مدفوع" });
    expect(monthCell(m, 10)).toEqual({ mark: "", label: "لم يُدفع" });
  });
  it("exempt or away months come as not owed from the server and show «—»", () => {
    const away = { paid: [1, 2], notOwed: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
    expect(monthCell(away, 7).mark).toBe("—");
    const exempt = { paid: [], notOwed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
    expect(monthCell(exempt, 12).label).toBe("غير مستحق عليه");
  });
});
