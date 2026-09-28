import { describe, expect, it, vi } from "vitest";
import type { ReportData, ReportMember, ReportMonthState } from "./data/types";
import { monthName } from "./dates";
import { THIN } from "./format";
import {
  drawReportSummary,
  monthBars,
  paidLine,
  reportFileName,
  reportSummary,
  reportShareText,
  reportUrl,
  shareReportSummary,
  type ReportSummaryData,
} from "./share-report";

const D: ReportSummaryData = {
  termLabel: "الدورة 2026",
  year: 2026,
  balance: 290500,
  collectedThisYear: 294000,
  spentThisYear: 1500,
  paidCount: 38,
  activeCount: 70,
  month: 9,
  months: [
    { month: 1, expected: 50000, collected: 50000 },
    { month: 9, expected: 50000, collected: 25000 },
    { month: 10, expected: 50000, collected: 0 },
  ],
  asOfLabel: "الأحد 5 أكتوبر 2026",
};

it("paidLine / url / file name", () => {
  expect(paidLine(D)).toBe(`38 من 70 دفعوا رسوم ${monthName(9)}`);
  expect(reportUrl("https://x.app/")).toBe("https://x.app/report");
  expect(reportFileName(2026, 9)).toBe("ملخص-صندوق-الشباب-2026-09.png");
});

describe("monthBars", () => {
  it("returns 12 months on a common scale, missing months at zero", () => {
    const bars = monthBars(D.months);
    expect(bars).toHaveLength(12);
    expect(bars[0]).toEqual({ month: 1, collected: 1, expected: 1 });
    expect(bars[8].collected).toBe(0.5);
    expect(bars[1]).toEqual({ month: 2, collected: 0, expected: 0 });
  });
  it("never divides by zero and clamps", () => {
    expect(monthBars([]).every((b) => b.collected === 0)).toBe(true);
    expect(monthBars([{ month: 3, expected: 0, collected: -5 }])[2].collected).toBe(0);
  });
});

it("reportShareText has the numbers, the month line and the link", () => {
  const t = reportShareText(D, "https://x.app/report");
  expect(t).toContain(`في الصندوق الآن: 290${THIN}500 أوقية`);
  expect(t).toContain(`صُرف هذا العام: 1${THIN}500 أوقية`);
  expect(t).toContain(paidLine(D));
  expect(t).toContain("الدورة 2026");
  expect(t).toContain("التفاصيل: https://x.app/report");
});

it("drawReportSummary draws the key texts and 12 month labels", () => {
  const texts: string[] = [];
  const ctx = {
    fillStyle: "",
    font: "",
    textAlign: "right",
    direction: "rtl",
    fillRect() {},
    fillText: (t: string) => void texts.push(t),
    measureText: (t: string) => ({ width: t.length * 30 }),
    beginPath() {},
    arc() {},
    fill() {},
    clip() {},
    save() {},
    restore() {},
    drawImage() {},
    roundRect() {},
  } as unknown as Parameters<typeof drawReportSummary>[0];
  drawReportSummary(ctx, D, { url: "https://x.app/report", fonts: { display: "a", body: "b" } });
  expect(texts).toEqual(
    expect.arrayContaining([
      "في الصندوق الآن",
      `290${THIN}500`,
      paidLine(D),
      "x.app/report",
      "حتى الأحد 5 أكتوبر 2026",
    ]),
  );
  for (let m = 1; m <= 12; m++) expect(texts).toContain(String(m));
});

it("shareReportSummary falls back to WhatsApp text with the link", async () => {
  const open = vi.fn();
  const res = await shareReportSummary(D, "https://x.app/report", { nav: {} as never, open });
  expect(res).toBe("whatsapp");
  expect(decodeURIComponent(open.mock.calls[0][0])).toContain("https://x.app/report");
});

describe("reportSummary (ReportData → card)", () => {
  const member = (
    id: string,
    status: ReportMember["status"],
    months: Partial<Record<number, ReportMonthState>>,
  ): ReportMember => ({
    memberId: id,
    memberRef: id,
    fullName: id,
    groupCode: "A",
    status,
    statusLabel: "",
    months: Array.from({ length: 12 }, (_, i) => months[i + 1] ?? "not_owed"),
    monthsPaid: 0,
    monthsBehind: 0,
    amountOwed: null,
  });
  const R = (over: Partial<ReportData> = {}): ReportData => ({
    year: 2026,
    summary: {
      openingBalance: 0,
      moneyIn: 0,
      moneyOut: 0,
      transfersIn: 0,
      balance: 290500,
      collectedThisYear: 294000,
      spentThisYear: 1500,
      membersOk: 0,
      membersBehind: 0,
      lastActivityAt: null,
      membersActive: 3,
      adjustments: 0,
      termNumber: 2,
      termStartedOn: null,
    },
    term: null,
    monthly: Array.from({ length: 12 }, (_, i) => ({
      year: 2026,
      month: i + 1,
      expected: 1000,
      collected: i < 9 ? 1000 : 0,
    })),
    members: [
      member("a", "active", { 9: "paid" }),
      member("b", "active", { 9: "late", 10: "prepaid" }),
      member("c", "active", { 9: "prepaid" }),
      member("d", "exempt", { 9: "paid" }),
    ],
    expenses: [],
    expensesComplete: true,
    campaigns: [],
    showAmountOwed: false,
    generatedAt: "2026-09-28T10:00:00.000Z",
    ...over,
  });

  it("maps totals, month bars, and paid-this-month among active members", () => {
    const d = reportSummary(R());
    expect(d).toMatchObject({
      termLabel: "الدورة 2",
      year: 2026,
      balance: 290500,
      collectedThisYear: 294000,
      spentThisYear: 1500,
      month: 9,
      paidCount: 2,
      activeCount: 3,
    });
    expect(d.months).toHaveLength(12);
    expect(d.months[0]).toEqual({ month: 1, expected: 1000, collected: 1000 });
    expect(d.asOfLabel).toBe(`الاثنين 28 ${monthName(9)} 2026`);
  });

  it("the share text takes ReportData as is", () => {
    expect(reportShareText(R(), "u")).toBe(reportShareText(reportSummary(R()), "u"));
  });

  it("uses the term title when present, December for a past year", () => {
    const d = reportSummary(
      R({
        year: 2025,
        term: {
          number: 1,
          title: "الدورة الأولى",
          startedOn: "2025-01-01",
          endedOn: null,
          openingBalance: 0,
          closingBalance: null,
          collected: 0,
          spent: 0,
          adjustment: 0,
        },
      }),
    );
    expect(d.termLabel).toBe("الدورة الأولى");
    expect(d.month).toBe(12);
    expect(d.paidCount).toBe(0);
  });
});
