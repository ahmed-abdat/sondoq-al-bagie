import { describe, expect, it, vi } from "vitest";
import { monthName } from "./dates";
import { THIN } from "./format";
import {
  drawReportSummary,
  monthBars,
  paidLine,
  reportFileName,
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
