import { describe, expect, it } from "vitest";
import { isPersistable } from "./persister";

const q = (queryKey: unknown[], status = "success") =>
  ({ queryKey, state: { status } }) as unknown as Parameters<typeof isPersistable>[0];

describe("isPersistable", () => {
  it("keeps successful amount-free public queries", () => {
    expect(isPersistable(q(["public", "fund_stats"]))).toBe(true);
  });
  it("never keeps money, even under a public key (money privacy)", () => {
    for (const v of ["fund_summary", "monthly_collection", "report", "activity_feed", "x"])
      expect(isPersistable(q(["public", v]))).toBe(false);
  });
  it("drops committee data and failed queries", () => {
    expect(isPersistable(q(["committee", "pending"]))).toBe(false);
    expect(isPersistable(q(["public", "x"], "error"))).toBe(false);
  });
});
