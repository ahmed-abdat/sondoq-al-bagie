import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isMethod, METHOD_LABELS, METHODS, methodLabel, methodLogo } from "./methods";

describe("methods", () => {
  it("recognises only known methods", () => {
    expect(isMethod("bankily")).toBe(true);
    expect(isMethod("cash")).toBe(true);
    expect(isMethod("paypal")).toBe(false);
    expect(isMethod(1)).toBe(false);
  });

  it("has an Arabic label for every method", () => {
    for (const m of METHODS) expect(methodLabel(m)).toBe(METHOD_LABELS[m]);
    expect(methodLabel("masrvi")).toBe("مصرفي");
  });

  it("points wallet logos at files that exist", () => {
    for (const m of METHODS) {
      const logo = methodLogo(m);
      if (logo) expect(existsSync(join(process.cwd(), "public", logo))).toBe(true);
    }
    expect(methodLogo("cash")).toBeNull();
  });
});
