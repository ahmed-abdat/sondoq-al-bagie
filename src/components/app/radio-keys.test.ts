import { describe, expect, it } from "vitest";
import { nextRadio, radioTab } from "./radio-keys";

describe("radio keys (audit B06)", () => {
  it("one Tab stop: the checked chip, or the first when none is", () => {
    expect([0, 1, 2].map((i) => radioTab(i === 1, i, true))).toEqual([-1, 0, -1]);
    expect([0, 1, 2].map((i) => radioTab(false, i, false))).toEqual([0, -1, -1]);
  });
  it("arrows move with wrap; RTL: left is next", () => {
    expect(nextRadio(0, 3, "ArrowLeft", true)).toBe(1);
    expect(nextRadio(0, 3, "ArrowRight", true)).toBe(2);
    expect(nextRadio(2, 3, "ArrowRight", false)).toBe(0);
    expect(nextRadio(1, 3, "ArrowDown", true)).toBe(2);
    expect(nextRadio(1, 3, "ArrowUp", false)).toBe(0);
    expect(nextRadio(1, 3, "End", true)).toBe(2);
    expect(nextRadio(1, 3, "Home", true)).toBe(0);
    expect(nextRadio(1, 3, "Enter", true)).toBeNull();
  });
});
