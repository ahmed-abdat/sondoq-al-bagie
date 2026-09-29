import { describe, expect, it } from "vitest";
import { toMemberIndex, toMemberRows } from "./member-lists";
import { decodeMonths, encodeMonths, monthStates } from "./month-code";
import type { MemberMonth, MemberStatus } from "./types";

const member = (memberId: string, status: MemberStatus["status"] = "active"): MemberStatus => ({
  memberId,
  listCode: "A",
  number: 1,
  memberRef: `A-${memberId}`,
  fullName: memberId,
  groupCode: "A",
  status,
  monthsPaidThisYear: 0,
  monthsBehind: 0,
  statusLabel: "منتظم",
  amountOwed: null,
});
const mm = (memberId: string, month: number, state: MemberMonth["state"], year = 2026) => ({
  memberId,
  year,
  month,
  state,
});

describe("month code", () => {
  it("round-trips the 12 months and fills gaps with not owed", () => {
    const months = [
      mm("a", 1, "paid"),
      mm("a", 2, "late"),
      mm("a", 12, "upcoming"),
      mm("a", 3, "paid", 2025),
    ];
    const code = encodeMonths(months, 2026);
    expect(code).toBe("PLNNNNNNNNNU");
    expect(monthStates(code).slice(0, 3)).toEqual(["paid", "late", "not_owed"]);
    expect(decodeMonths(code, "a", 2026)[11]).toEqual(mm("a", 12, "upcoming"));
    expect(monthStates("")).toHaveLength(12);
  });
});

describe("member lists", () => {
  const members = [member("a"), member("b", "exempt"), member("c", "left"), member("d")];
  const months = [mm("a", 9, "paid"), mm("b", 9, "paid"), mm("d", 9, "late"), mm("d", 1, "paid")];

  it("rows carry the month code and hide members who left", () => {
    const rows = toMemberRows(members, months, 2026);
    expect(rows.map((r) => r.memberId)).toEqual(["a", "b", "d"]);
    expect(rows[2].months).toBe("PNNNNNNNLNNN");
    expect(rows[0]).toMatchObject({ memberRef: "A-a", groupCode: "A" });
  });

  it("index counts active members who paid the month", () => {
    const idx = toMemberIndex(members, months, 2026, 9);
    expect(idx).toMatchObject({ activeCount: 2, paidThisMonth: 1, year: 2026, month: 9 });
    expect(idx.members.map((m) => m.memberId)).toEqual(["a", "b", "d"]);
    expect(Object.keys(idx.members[0]).sort()).toEqual([
      "fullName",
      "memberId",
      "memberRef",
      "status",
      "statusLabel",
    ]);
  });
});

describe("member rows: past-year arrears and month prices", () => {
  const priced = (
    month: number,
    state: MemberMonth["state"],
    price: number | null,
    year = 2027,
  ) => ({
    ...mm("a", month, state, year),
    price,
  });

  it("adds last years' late months, oldest first", () => {
    const [row] = toMemberRows([member("a")], [priced(1, "upcoming", 1000)], 2027, {
      pastLate: [priced(12, "late", 1000, 2026), priced(11, "late", 1000, 2026)],
    });
    expect(row.pastLate).toEqual(["2026-11", "2026-12"]);
    expect(row.prices).toBeUndefined();
  });

  it("lists only payable months whose price differs from the current group price", () => {
    const [row] = toMemberRows(
      [member("a")],
      [
        priced(1, "late", 500), // was in group B in January
        priced(2, "late", 1000),
        priced(3, "paid", 500), // paid: not payable
        priced(4, "upcoming", 1000),
      ],
      2027,
      { pastLate: [priced(12, "late", 800, 2026)], groupPrices: { A: 1000 } },
    );
    expect(row.prices).toEqual({ "2027-01": 500, "2026-12": 800 });
  });

  it("marks months as unpriced when the year has no price yet", () => {
    const [row] = toMemberRows([member("a")], [priced(1, "upcoming", null)], 2027, {
      pastLate: [priced(12, "late", 1000, 2026)],
      groupPrices: {},
    });
    expect(row.prices).toEqual({ "2026-12": 1000 });
    const [same] = toMemberRows([member("a")], [priced(1, "upcoming", null)], 2027, {
      groupPrices: { A: 1000 },
    });
    expect(same.prices).toEqual({ "2027-01": null });
  });
});
