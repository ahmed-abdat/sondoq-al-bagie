import { describe, expect, it, vi } from "vitest";
import { invalidateAfterPaymentChange } from "./realtime";

describe("realtime", () => {
  it("refreshes committee payments, arrears and public data after a payment change", () => {
    const invalidateQueries = vi.fn();
    invalidateAfterPaymentChange({ invalidateQueries });
    expect(invalidateQueries.mock.calls.map((c) => c[0].queryKey)).toEqual([
      ["committee", "payments"],
      ["committee", "arrears"],
      ["public"],
    ]);
  });
});
