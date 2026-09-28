import { describe, expect, it, vi } from "vitest";
import { makeClient } from "./index";

describe("makeClient", () => {
  it("keeps unobserved queries (gcTime within timer limits)", async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const gc = client.getDefaultOptions().queries?.gcTime;
    expect(gc === Infinity || (typeof gc === "number" && gc <= 2 ** 31 - 1)).toBe(true);
    client.setQueryData(["public", "fund_summary"], { balance: 1 });
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(client.getQueryData(["public", "fund_summary"])).toEqual({ balance: 1 });
    vi.useRealTimers();
  });
});
