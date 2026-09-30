import { describe, expect, it } from "vitest";
import { isLevy } from "./levy-kind";

const none = new Set<string>();
describe("a لوحة is never shown as a تبرع", () => {
  it("a two-price لوحة (per_group, الفئة ب price) is a لوحة", () => {
    expect(isLevy({ campaignId: "l2", amountMode: "per_group" }, none)).toBe(true);
  });
  it("a fixed لوحة, or any campaign with levy shares, is a لوحة", () => {
    expect(isLevy({ campaignId: "l1", amountMode: "fixed" }, none)).toBe(true);
    expect(isLevy({ campaignId: "l3", amountMode: "custom" }, new Set(["l3"]))).toBe(true);
  });
  it("an open تبرع stays a تبرع; the database kind wins when given", () => {
    expect(isLevy({ campaignId: "c1", amountMode: "open" }, none)).toBe(false);
    expect(isLevy({ campaignId: "c1", amountMode: "fixed", kind: "donation" }, none)).toBe(false);
    expect(isLevy({ campaignId: "c2", amountMode: "open", kind: "levy" }, none)).toBe(true);
  });
});
