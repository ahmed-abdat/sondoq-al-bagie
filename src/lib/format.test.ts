import { describe, expect, it } from "vitest";
import { formatMro, formatMru, formatNumber, percent, THIN } from "./format";

describe("formatNumber", () => {
  it("groups thousands with a narrow no-break space", () => {
    expect(THIN).toBe(" ");
    expect(formatNumber(500)).toBe("500");
    expect(formatNumber(1000)).toBe(`1${THIN}000`);
    expect(formatNumber(1234567)).toBe(`1${THIN}234${THIN}567`);
  });
  it("keeps up to 2 decimals and a minus sign", () => {
    expect(formatNumber(8.62)).toBe("8.62");
    expect(formatNumber(-1500)).toBe(`−1${THIN}500`);
    expect(formatNumber(-0.001)).toBe("0");
  });
});

describe("currency", () => {
  it("formats MRO with the Arabic currency word", () => {
    expect(formatMro(12500)).toBe(`12${THIN}500 أوقية`);
  });
  it("formats MRU as wallets show it", () => {
    expect(formatMru(1250)).toBe(`1${THIN}250 MRU`);
  });
});

describe("percent", () => {
  it("rounds to a whole number", () => {
    expect(percent(11, 12)).toBe(92);
    expect(percent(0, 0)).toBe(0);
  });
});
