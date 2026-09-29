import { afterEach, describe, expect, it, vi } from "vitest";
import { allowsBackgroundDownload, whenIdle } from "./data-saver";

describe("allowsBackgroundDownload", () => {
  it.each([
    [undefined, true],
    [{}, true],
    [{ effectiveType: "4g" }, true],
    [{ effectiveType: "3g" }, true],
    [{ effectiveType: "2g" }, false],
    [{ effectiveType: "slow-2g" }, false],
    [{ saveData: true, effectiveType: "4g" }, false],
  ])("%j → %s", (conn, ok) => expect(allowsBackgroundDownload(conn)).toBe(ok));
});

describe("whenIdle", () => {
  afterEach(() => vi.useRealTimers());

  it("waits for idle and can be cancelled", () => {
    const cbs: IdleRequestCallback[] = [];
    vi.stubGlobal("requestIdleCallback", (cb: IdleRequestCallback) => cbs.push(cb));
    const cancel = vi.fn();
    vi.stubGlobal("cancelIdleCallback", cancel);
    const fn = vi.fn();
    const stop = whenIdle(fn);
    expect(fn).not.toHaveBeenCalled();
    cbs[0]({ didTimeout: false, timeRemaining: () => 10 });
    expect(fn).toHaveBeenCalledOnce();
    stop();
    expect(cancel).toHaveBeenCalledWith(1);
    vi.unstubAllGlobals();
  });

  it("falls back to a timer without requestIdleCallback", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const fn = vi.fn();
    whenIdle(fn);
    vi.advanceTimersByTime(1500);
    expect(fn).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
