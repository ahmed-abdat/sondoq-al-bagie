import { describe, expect, it } from "vitest";
import { monthIncome } from "./month-income";

describe("home «المداخيل هذا الشهر»", () => {
  it("leaves out the paper-sheet import (prod September: 408 000 − 372 000)", () => {
    expect(monthIncome({ income: 408_000 }, { paperIn: 372_000 })).toBe(36_000);
  });
  it("a month with no paper rows keeps its income", () => {
    expect(monthIncome({ income: 12_000 }, {})).toBe(12_000);
  });
  it("a failed read hides the line instead of showing a wrong number", () => {
    expect(monthIncome({ income: 408_000 }, null)).toBeNull();
    expect(monthIncome(null, { paperIn: 0 })).toBeNull();
  });
});
