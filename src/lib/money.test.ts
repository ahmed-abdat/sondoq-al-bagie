import { describe, expect, it } from "vitest";
import { formatMro, mroToMru, mruToMro, parseAmount, toWesternDigits } from "./money";

describe("toWesternDigits", () => {
  it("converts Arabic-Indic digits", () => {
    expect(toWesternDigits("١٥٠٠")).toBe("1500");
    expect(toWesternDigits("۱۲")).toBe("12");
  });
});

describe("parseAmount", () => {
  it.each([
    ["1500", 1500],
    ["1.500,00", 1500],
    ["1,500.00", 1500],
    ["1 500", 1500],
    ["١٬٥٠٠", 1500],
    ["150,5", 150.5],
    ["1.500", 1500],
    ["المبلغ: 2 000 MRU", 2000],
  ])("parses %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it("returns null without digits", () => {
    expect(parseAmount("أوقية")).toBeNull();
  });
});

describe("mruToMro", () => {
  it("multiplies by ten and rounds", () => {
    expect(mruToMro(150)).toBe(1500);
    expect(mruToMro(50.05)).toBe(501);
  });
});

describe("mroToMru", () => {
  it("divides by ten", () => {
    expect(mroToMru(12500)).toBe(1250);
  });
});

describe("formatMro", () => {
  it("uses latin digits and the currency word", () => {
    expect(formatMro(12500)).toMatch(/^12.500 أوقية$/);
  });
});
