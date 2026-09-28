import { describe, expect, it } from "vitest";
import { isValidLocalPhone, waLink, waPhone } from "./whatsapp";

describe("waPhone", () => {
  it.each([
    ["36123456", "22236123456"],
    ["36 12 34 56", "22236123456"],
    ["+222 36 12 34 56", "22236123456"],
    ["0022236123456", "22236123456"],
    ["22236123456", "22236123456"],
    // A local number that starts with 222 is still local.
    ["22212345", "22222212345"],
  ])("%s → %s", (input, expected) => {
    expect(waPhone(input)).toBe(expected);
  });
});

describe("isValidLocalPhone", () => {
  it("accepts 8 digits starting with 2, 3 or 4", () => {
    expect(isValidLocalPhone("36 12 34 56")).toBe(true);
    expect(isValidLocalPhone("46123456")).toBe(true);
    expect(isValidLocalPhone("56123456")).toBe(false);
    expect(isValidLocalPhone("3612345")).toBe(false);
  });
});

describe("waLink", () => {
  it("encodes the Arabic text", () => {
    expect(waLink("36123456", "السلام عليكم")).toBe(
      `https://wa.me/22236123456?text=${encodeURIComponent("السلام عليكم")}`,
    );
  });
  it("works without a phone", () => {
    expect(waLink(undefined, "hi")).toBe("https://wa.me/?text=hi");
  });
});

describe("Arabic-Indic digits (Arabic keyboards)", () => {
  it("are converted, not dropped", () => {
    expect(waPhone("٣٦ ١٢ ٣٤ ٥٦")).toBe("22236123456");
    expect(waPhone("+٢٢٢ ٣٦١٢٣٤٥٦")).toBe("22236123456");
    expect(isValidLocalPhone("٣٦١٢٣٤٥٦")).toBe(true);
    expect(waLink("٣٦١٢٣٤٥٦", "x")).toBe("https://wa.me/22236123456?text=x");
  });
});
