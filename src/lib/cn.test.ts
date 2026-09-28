import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("drops falsy values and lets later classes win", () => {
    expect(cn("px-2", false, null, undefined, "px-4")).toBe("px-4");
    expect(cn("text-sm", { "font-bold": true, hidden: false })).toBe("text-sm font-bold");
  });
});
