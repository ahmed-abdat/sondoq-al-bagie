import { describe, expect, it } from "vitest";
import type { ReportData, ReportExpense, ReportMember, ReportMonthState } from "./data/types";
import { monthPaid } from "./report-check";
import {
  A4_PAGE,
  BLOCK_H,
  chunkEven,
  L,
  memberCols,
  membersPerPage,
  numberOf,
  moneyBlocks,
  footerLabel,
  paginateBlocks,
  paginateReport,
  PHONE_PAGE,
  type Block,
} from "./report-pages";

const member = (ref: string, status: ReportMember["status"] = "active"): ReportMember => ({
  memberId: ref,
  memberRef: ref,
  fullName: `عضو ${ref}`,
  groupCode: "g",
  status,
  statusLabel: "منتظم",
  months: Array(12).fill("paid"),
  monthsPaid: 12,
  monthsBehind: 0,
  amountOwed: null,
});
const expense = (i: number): ReportExpense => ({
  spentOn: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
  category: "other" as ReportExpense["category"],
  categoryLabel: "أخرى",
  note: null,
  amount: 1000 + i,
  campaignId: null,
});
const report = (members: ReportMember[], expenses: ReportExpense[] = []): ReportData =>
  ({
    year: 2026,
    summary: { spentThisYear: 5000, termNumber: null } as ReportData["summary"],
    term: null,
    monthly: [],
    members,
    expenses,
    expensesComplete: true,
    campaigns: [],
    showAmountOwed: false,
    groupPrices: { A: 1000, B: 500 },
    generatedAt: "2026-09-28T10:00:00.000Z",
  }) as ReportData;

it("fits 21 member rows on a phone page and 26 on an A4 page", () => {
  expect(membersPerPage(PHONE_PAGE)).toBe(21);
  expect(membersPerPage(A4_PAGE)).toBe(26);
});

it("chunkEven balances pages", () => {
  expect(chunkEven([...Array(45).keys()], 20).map((c) => c.length)).toEqual([15, 15, 15]);
  expect(chunkEven([...Array(20).keys()], 20).map((c) => c.length)).toEqual([20]);
  expect(chunkEven([...Array(21).keys()], 20).map((c) => c.length)).toEqual([11, 10]);
  expect(chunkEven([], 20)).toEqual([]);
});

it("numberOf: the number alone on a group page", () => {
  expect(numberOf({ memberRef: "A-12" })).toBe("12");
  expect(numberOf({ memberRef: "7" })).toBe("7");
});

describe("month cells: a ✓ badge when paid, empty otherwise", () => {
  it("paid and paid ahead get the badge; late, future and not owed stay empty", () => {
    const states: (ReportMonthState | undefined)[] = [
      "paid",
      "prepaid",
      "late",
      "upcoming",
      "not_owed",
      undefined,
    ];
    expect(states.map(monthPaid)).toEqual([true, true, false, false, false, false]);
  });

  it("12 badges fit on the 1080 page with room between them and for the name", () => {
    const c = memberCols(PHONE_PAGE.w);
    expect(c.cx(12) - c.badge).toBeGreaterThanOrEqual(L.pad);
    expect(c.cell - 2 * c.badge).toBeGreaterThanOrEqual(10); // gap between two badges
    expect(2 * c.badge).toBeLessThan(L.row - 8); // row striping still shows around them
    expect(c.cx(1) + c.badge).toBeLessThan(c.nameR - c.nameW);
    expect(c.nameW).toBeGreaterThanOrEqual(380);
  });
});

it("footer is the same on every page", () => {
  expect(footerLabel(4, 7, "28 سبتمبر 2026")).toBe(
    "صندوق الرابطة · الصفحة 4 من 7 · حتى 28 سبتمبر 2026",
  );
});

describe("paginateReport", () => {
  const members = [
    ...Array.from({ length: 45 }, (_, i) => member(`A-${i + 1}`)),
    ...Array.from({ length: 18 }, (_, i) => member(`B-${i + 1}`)),
    member("A-99", "left"),
    member("B-99", "deceased"),
    member("B-98", "exempt"),
  ];

  it("cover, then each list in pages (gone members hidden), then money", () => {
    const pages = paginateReport(report(members, [expense(1)]));
    expect(pages.map((p) => p.kind)).toEqual([
      "cover",
      "members",
      "members",
      "members",
      "members",
      "money",
    ]);
    const lists = pages.flatMap((p) =>
      p.kind === "members" ? [[p.list, p.rows.length, p.part, p.parts]] : [],
    );
    expect(lists).toEqual([
      ["A", 15, 1, 3],
      ["A", 15, 2, 3],
      ["A", 15, 3, 3],
      ["B", 19, 1, 1],
    ]);
    const refs = pages.flatMap((p) => (p.kind === "members" ? p.rows.map((m) => m.memberRef) : []));
    expect(refs).not.toContain("A-99");
    expect(refs).not.toContain("B-99");
    expect(refs).toContain("B-98");
  });

  it("A4 pages hold more rows", () => {
    const many = Array.from({ length: 26 }, (_, i) => member(`A-${i + 1}`));
    const count = (size?: typeof A4_PAGE) =>
      paginateReport(report(many), size).filter((p) => p.kind === "members").length;
    expect(count(A4_PAGE)).toBe(1);
    expect(count()).toBe(2);
  });
});

describe("money pages", () => {
  const campaign = (status: "open" | "closed", collected: number, spent = 0) =>
    ({
      campaignId: `${status}${collected}`,
      title: "حملة",
      status,
      targetAmount: null,
      collected,
      spent,
      balance: collected - spent,
    }) as ReportData["campaigns"][number];

  it("no expenses and no campaigns worth showing: no money page at all", () => {
    const r = { ...report([member("A-1")]), campaigns: [campaign("closed", 0)] };
    expect(moneyBlocks(r)).toEqual([]);
    const pages = paginateReport(r);
    expect(pages.map((p) => p.kind)).toEqual(["cover", "members"]);
  });

  it("keeps open campaigns and closed ones that moved money; titles the page by what is on it", () => {
    const r = {
      ...report([]),
      campaigns: [campaign("open", 0), campaign("closed", 0), campaign("closed", 500)],
    };
    const b = moneyBlocks(r);
    expect(b.map((x) => x.t)).toEqual(["heading", "campaign", "campaign", "space", "cta"]);
    const money = paginateReport(r).filter((p) => p.kind === "money");
    expect(money.map((p) => p.kind === "money" && p.title)).toEqual(["حملات التبرع"]);
    const withExp = paginateReport({ ...r, expenses: [expense(1)] }).find(
      (p) => p.kind === "money",
    );
    expect(withExp?.kind === "money" && withExp.title).toBe("المصاريف والحملات");
  });

  it("splits long expense lists, repeating the heading and the column header", () => {
    const avail = PHONE_PAGE.h - L.band - L.gap - L.foot - 16;
    const pages = paginateBlocks(
      moneyBlocks(
        report(
          [],
          Array.from({ length: 30 }, (_, i) => expense(i)),
        ),
      ),
      avail,
    );
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.reduce((s, b) => s + BLOCK_H[b.t], 0)).toBeLessThanOrEqual(avail);
      expect(page[0].t).toBe("heading");
      expect(page[1].t).toBe("expHead");
    }
    expect((pages[1][0] as Extract<Block, { t: "heading" }>).text).toContain("تابع");
    expect(pages.flat().filter((b) => b.t === "expense")).toHaveLength(30);
  });

  it("never leaves a heading alone at the bottom of a page", () => {
    const blocks: Block[] = [
      { t: "note", text: "x" },
      { t: "heading", text: "حملات التبرع" },
      { t: "note", text: "y" },
    ];
    const pages = paginateBlocks(blocks, BLOCK_H.note + BLOCK_H.heading + 10);
    expect(pages.map((p) => p.map((b) => b.t))).toEqual([["note"], ["heading", "note"]]);
  });
});
