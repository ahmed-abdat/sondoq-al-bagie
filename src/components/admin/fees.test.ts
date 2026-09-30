import { describe, expect, it } from "vitest";
import { feeAllocations, feesTotal, pastWords, payablePast, priceOf } from "./fees";

const m = {
  id: "m4",
  fee: 1000,
  pastLate: ["2025-12", "2025-11"],
  prices: { "2025-11": 800, "2025-12": 800 } as Record<string, number | null>,
};

describe("record fees", () => {
  it("prices earlier-year months at their own price", () => {
    expect(priceOf(m, "2025-11")).toBe(800);
    expect(priceOf(m, "2026-03")).toBe(1000);
    // «أ 4»: 2 × 800 (2025) + 9 × 1000
    expect(feesTotal(m, 2026, [1, 2, 3, 4, 5, 6, 7, 8, 9], payablePast(m))).toBe(10_600);
  });
  it("allocates oldest first, one line per month with its year", () => {
    const a = feeAllocations(m, 2026, [2, 1], ["2025-12", "2025-11"]);
    expect(a.map((x) => `${x.year}-${x.month}:${x.amount}`)).toEqual([
      "2025-11:800",
      "2025-12:800",
      "2026-1:1000",
      "2026-2:1000",
    ]);
  });
  it("leaves out a year with no price", () => {
    expect(payablePast({ ...m, prices: { "2025-11": null } })).toEqual(["2025-12"]);
  });
  it("says earlier months with their year", () => {
    expect(pastWords(["2025-12", "2025-11"])).toBe("نوفمبر وديسمبر 2025");
    expect(pastWords(["2024-12", "2025-01"])).toBe("ديسمبر 2024 ويناير 2025");
  });
});
