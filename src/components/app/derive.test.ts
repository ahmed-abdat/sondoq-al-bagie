import { describe, expect, it } from "vitest";
import type { MemberStatus } from "@/lib/data/types";
import {
  amountInWords,
  clock,
  currentDueMonth,
  dayDate,
  dayWords,
  dotDate,
  fmt,
  groupLabel,
  maskTxn,
  memberCode,
  nextFreeNumber,
  memberState,
  monthCells,
  monthCount,
  monthsInWords,
  monthsLabel,
  monthsWord,
  normalizeAr,
  relativeAgo,
  remindedLabel,
  searchMembers,
  statusLabel,
} from "./derive";

const m = (p: Partial<MemberStatus>): MemberStatus => ({
  memberId: "x",
  listCode: "A",
  number: 1,
  memberRef: "A-1",
  fullName: "محمد ولد أحمد",
  groupCode: "A",
  status: "active",
  monthsPaidThisYear: 9,
  monthsBehind: 0,
  statusLabel: "منتظم",
  amountOwed: null,
  ...p,
});

describe("months in words", () => {
  it("counts months", () => {
    expect(monthsWord(1)).toBe("شهرًا");
    expect(monthsWord(2)).toBe("شهرين");
    expect(monthsWord(3)).toBe("3 أشهر");
    expect(monthsWord(11)).toBe("11 شهرًا");
    expect(monthCount(1)).toBe("شهر واحد");
    expect(monthCount(2)).toBe("شهران");
    expect(monthCount(12)).toBe("12 شهرًا");
  });
  it("labels runs", () => {
    expect(monthsLabel([9, 7, 8])).toBe("يوليو–سبتمبر");
    expect(monthsLabel([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe("السنة كاملة");
    expect(monthsLabel([3, 5])).toBe("مارس، مايو");
    expect(monthsLabel([8])).toBe("أغسطس");
  });
  it("writes receipt months", () => {
    expect(monthsInWords([7, 8, 9], 2026)).toBe("يوليو – سبتمبر 2026");
    expect(monthsInWords([1, 2, 5], 2026)).toBe("يناير – فبراير، مايو 2026");
    expect(monthsInWords([12], 2026)).toBe("ديسمبر 2026");
    expect(
      monthsInWords(
        [...Array(12)].map((_, i) => i + 1),
        2026,
      ),
    ).toBe("السنة كاملة 2026");
  });
});

describe("amountInWords", () => {
  it("writes amounts", () => {
    expect(amountInWords(0)).toBe("صفر");
    expect(amountInWords(500)).toBe("خمسمائة");
    expect(amountInWords(1000)).toBe("ألف");
    expect(amountInWords(1500)).toBe("ألف وخمسمائة");
    expect(amountInWords(3000)).toBe("ثلاثة آلاف");
    expect(amountInWords(25000)).toBe("خمسة وعشرون ألفًا");
    expect(amountInWords(100000)).toBe("مائة ألف");
  });
});

describe("member state", () => {
  it("derives state and a calm label", () => {
    expect(memberState(m({ monthsPaidThisYear: 12 }))).toBe("ahead");
    expect(statusLabel(m({ monthsPaidThisYear: 12 }))).toBe("مدفوع حتى ديسمبر");
    expect(statusLabel(m({}))).toBe("منتظم");
    expect(statusLabel(m({ monthsBehind: 2, monthsPaidThisYear: 7 }))).toBe("متأخر شهرين");
    expect(statusLabel(m({ monthsBehind: 9, monthsPaidThisYear: 0 }))).toBe("لم يدفع هذا العام");
    expect(memberState(m({ status: "exempt" }))).toBe("off");
    expect(statusLabel(m({ status: "exempt" }))).toBe("معفى");
  });
  it("maps groups", () => {
    expect(groupLabel("A")).toBe("أ");
    expect(groupLabel("b")).toBe("ب");
  });
  it("builds month cells", () => {
    const months = [
      { memberId: "x", year: 2026, month: 8, state: "late" as const },
      { memberId: "x", year: 2026, month: 9, state: "paid" as const },
      { memberId: "x", year: 2026, month: 10, state: "paid" as const },
      { memberId: "x", year: 2026, month: 11, state: "upcoming" as const },
    ];
    const cells = monthCells(months, 9);
    expect(cells[7].state).toBe("owed");
    expect(cells[8].state).toBe("paid");
    expect(cells[9].state).toBe("ahead");
    expect(cells[10].state).toBe("future");
  });
  it("finds the due month after the grace days", () => {
    expect(currentDueMonth(new Date("2026-09-28T10:00:00Z"), 10)).toBe(9);
    expect(currentDueMonth(new Date("2026-09-05T10:00:00Z"), 10)).toBe(8);
  });
});

describe("search", () => {
  const list = [
    { number: 1, fullName: "محمد ولد أحمد" },
    { number: 12, fullName: "أحمدو ولد الطالب" },
    { number: 21, fullName: "عائشة بنت محمد" },
  ];
  it("searches numbers with exact match first", () => {
    expect(searchMembers(list, "1").map((x) => x.number)).toEqual([1, 12]);
    expect(searchMembers(list, "١٢").map((x) => x.number)).toEqual([12]);
  });
  it("finds «A-12» in one list", () => {
    const two = [
      { number: 12, fullName: "س", memberRef: "A-12" },
      { number: 12, fullName: "ص", memberRef: "B-12" },
    ];
    expect(searchMembers(two, "A-12").map((x) => x.fullName)).toEqual(["س"]);
    expect(searchMembers(two, "b12").map((x) => x.fullName)).toEqual(["ص"]);
    expect(searchMembers(two, "ب 12").map((x) => x.fullName)).toEqual(["ص"]);
    expect(memberCode({ memberRef: "B-7" })).toBe("B-7");
    expect(
      nextFreeNumber(
        [
          { listCode: "A", number: 1 },
          { listCode: "A", number: 3 },
        ],
        "A",
      ),
    ).toBe(2);
    expect(nextFreeNumber([{ listCode: "A", number: 1 }], "B")).toBe(1);
  });
  it("normalises Arabic", () => {
    expect(normalizeAr("أحمد")).toBe("احمد");
    expect(normalizeAr("عائشة")).toBe("عائشه");
    expect(searchMembers(list, "احمد").map((x) => x.number)).toEqual([1, 12]);
    expect(searchMembers(list, "  ")).toEqual([]);
  });
});

describe("dates and money", () => {
  it("formats UTC dates in words", () => {
    expect(dayWords("2026-09-28")).toBe("28 سبتمبر");
    expect(dayDate("2026-09-28T09:48:00Z")).toBe("الاثنين 28 سبتمبر 2026");
    expect(clock("2026-09-28T09:48:00Z")).toBe("09:48");
    expect(dotDate("2026-09-28T09:48:00Z")).toBe("28.09.2026");
  });
  it("says how long ago", () => {
    const now = new Date("2026-09-28T10:00:00Z");
    expect(relativeAgo("2026-09-28T09:59:40Z", now)).toBe("الآن");
    expect(relativeAgo("2026-09-28T09:48:00Z", now)).toBe("منذ 12 دقيقة");
    expect(relativeAgo("2026-09-28T09:00:00Z", now)).toBe("منذ ساعة");
    expect(relativeAgo("2026-09-25T10:00:00Z", now)).toBe("منذ 3 أيام");
    expect(relativeAgo("2026-09-01T10:00:00Z", now)).toBe("1 سبتمبر");
    expect(remindedLabel("2026-09-25T10:00:00Z", now)).toBe("ذُكّر قبل 3 أيام");
    expect(remindedLabel("2026-09-27T09:00:00Z", now)).toBe("ذُكّر أمس");
    expect(remindedLabel(null, now)).toBe("لم يُذكَّر بعد");
  });
  it("groups thousands and masks refs", () => {
    expect(fmt(249000)).toBe("249 000");
    expect(maskTxn("BKL-2609281012-482917")).toBe("•••• 2917");
    expect(maskTxn(null)).toBe("");
  });
});
