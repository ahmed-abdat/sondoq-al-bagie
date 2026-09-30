import { expect, it } from "vitest";
import { memberNumber } from "./brand";

it("memberNumber: group letter then number", () => {
  expect(memberNumber("A-12")).toBe("أ 12");
  expect(memberNumber("B-7")).toBe("ب 7");
  expect(memberNumber("C-3")).toBe("C 3");
  expect(memberNumber("42")).toBe("42");
  expect(memberNumber("B-61", true)).toBe("⁧ب 61⁩");
});
