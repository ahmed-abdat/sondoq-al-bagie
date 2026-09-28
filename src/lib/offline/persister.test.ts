import { describe, expect, it } from "vitest";
import { isPersistable } from "./persister";

const q = (queryKey: unknown[], status = "success") =>
  ({ queryKey, state: { status } }) as unknown as Parameters<typeof isPersistable>[0];

describe("isPersistable", () => {
  it("keeps successful public queries", () => {
    expect(isPersistable(q(["public", "fund_summary"]))).toBe(true);
  });
  it("drops committee data and failed queries", () => {
    expect(isPersistable(q(["committee", "pending"]))).toBe(false);
    expect(isPersistable(q(["public", "x"], "error"))).toBe(false);
  });
});
