import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backoffMs,
  coalesce,
  invalidateAfterPaymentChange,
  isOwnChange,
  shouldCatchUp,
  toastFor,
  toPaymentChange,
} from "./realtime";

describe("realtime", () => {
  afterEach(() => vi.useRealTimers());

  it("refreshes the cached public data after a payment change (committee pages use router.refresh)", () => {
    const invalidateQueries = vi.fn();
    invalidateAfterPaymentChange({ invalidateQueries });
    expect(invalidateQueries.mock.calls.map((c) => c[0].queryKey)).toEqual([["public"]]);
  });

  it("classifies changes and finds who did them", () => {
    const row = {
      id: "p",
      payer_name: "سيدي",
      amount: 1000,
      created_by: "a",
      decided_by: "b",
      cancelled_by: "c",
    };
    expect(toPaymentChange("INSERT", { ...row, status: "pending" })).toMatchObject({
      kind: "pending",
      actorId: "a",
      payerName: "سيدي",
      amount: 1000,
      own: false,
    });
    expect(toPaymentChange("INSERT", { ...row, status: "confirmed" })).toMatchObject({
      kind: "confirmed",
      actorId: "a",
    });
    expect(toPaymentChange("UPDATE", { ...row, status: "confirmed" })).toMatchObject({
      kind: "confirmed",
      actorId: "b",
    });
    expect(toPaymentChange("UPDATE", { ...row, status: "rejected" })).toMatchObject({
      kind: "rejected",
      actorId: "b",
    });
    expect(toPaymentChange("UPDATE", { ...row, status: "cancelled" })).toMatchObject({
      kind: "cancelled",
      actorId: "c",
    });
    expect(toPaymentChange("DELETE", {}, { id: "p" })).toMatchObject({
      id: "p",
      kind: "other",
      actorId: null,
    });
  });

  it("toasts only another member's new pending payment", () => {
    const c = toPaymentChange("INSERT", {
      id: "p",
      status: "pending",
      payer_name: "سيدي",
      created_by: "a",
    });
    expect(toastFor(c)).toBe("دفعة جديدة من سيدي بانتظار التأكيد");
    expect(isOwnChange(c, "a")).toBe(true);
    expect(toastFor({ ...c, own: true })).toBeNull();
    expect(toastFor({ ...c, payerName: null })).toBe("دفعة جديدة بانتظار التأكيد");
    expect(toastFor(toPaymentChange("UPDATE", { id: "p", status: "confirmed" }))).toBeNull();
    expect(isOwnChange(c, null)).toBe(false);
  });

  it("backs off 1 s, 2 s, 4 s … up to 30 s", () => {
    expect([0, 1, 2, 3, 10].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 30000]);
  });

  it("coalesces a burst into one call after the last one", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const run = coalesce(fn, 400);
    run();
    vi.advanceTimersByTime(300);
    run();
    run();
    vi.advanceTimersByTime(399);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    run();
    run.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("catches up on return only after 60 s hidden or a dropped channel, once per minute", () => {
    const base = { now: 100_000, hiddenAt: 90_000, droppedWhileHidden: false, lastCatchUpAt: null };
    expect(shouldCatchUp(base)).toBe(false); // 10 s app switch
    expect(shouldCatchUp({ ...base, hiddenAt: 40_000 })).toBe(true); // 60 s away
    expect(shouldCatchUp({ ...base, droppedWhileHidden: true })).toBe(true);
    expect(shouldCatchUp({ ...base, droppedWhileHidden: true, lastCatchUpAt: 70_000 })).toBe(false);
    expect(shouldCatchUp({ ...base, hiddenAt: null })).toBe(false);
  });
});
