import { describe, expect, it } from "vitest";
import type { ReportData, ReportExpense, ReportMember } from "./data/types";
import {
  A4_PAGE,
  BLOCK_H,
  chunkEven,
  L,
  membersPerPage,
  moneyBlocks,
  footerLabel,
  statusPill,
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

it("status pills: up to date, late with months, exempt, other", () => {
  const m = (status: ReportMember["status"], monthsBehind = 0) => ({
    status,
    monthsBehind,
    statusLabel: "مسافر",
  });
  expect(statusPill(m("active"))).toEqual({ text: "منتظم", tone: "ok" });
  expect(statusPill(m("active", 3))).toEqual({ text: "متأخر 3", tone: "late" });
  expect(statusPill(m("exempt"))).toEqual({ text: "معفى", tone: "exempt" });
  expect(statusPill(m("away"))).toEqual({ text: "مسافر", tone: "other" });
});

it("footer names the page, and the part of a split list instead of the fund", () => {
  expect(footerLabel({ kind: "cover" }, 1, 6, "28 سبتمبر 2026")).toBe(
    "صندوق الشباب · الصفحة 1 من 6 · حتى 28 سبتمبر 2026",
  );
  expect(
    footerLabel(
      { kind: "members", list: "B", rows: [], part: 2, parts: 3 },
      4,
      6,
      "28 سبتمبر 2026",
    ),
  ).toBe("الصفحة 4 من 6 · الجزء 2 من 3 · حتى 28 سبتمبر 2026");
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
    const pages = paginateReport(report(members));
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
  it("says so when nothing was spent", () => {
    const b = moneyBlocks(report([]));
    expect(b.map((x) => x.t)).toEqual(["heading", "note", "space", "cta"]);
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
