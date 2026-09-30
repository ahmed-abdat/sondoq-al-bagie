import { describe, expect, it } from "vitest";
import { amountValue, cleanAmount } from "./amount-input";

describe("the one amount field", () => {
  it("keeps digits and spaces, Western", () => {
    expect(cleanAmount("١٥٠٠")).toBe("1500");
    expect(cleanAmount("1 500 أوقية")).toBe("1 500 ");
    expect(cleanAmount("1.500")).toBe("1500");
    expect(cleanAmount("-20")).toBe("20");
  });
  it("reads a whole amount, 0 when empty", () => {
    expect(amountValue("1 500")).toBe(1500);
    expect(amountValue("۲۰۰")).toBe(200);
    expect(amountValue("")).toBe(0);
    expect(amountValue("abc")).toBe(0);
  });
});
