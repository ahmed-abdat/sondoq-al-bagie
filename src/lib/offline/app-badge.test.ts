import { describe, expect, it, vi } from "vitest";
import { clearAppBadge, nextBadgeCount, syncAppBadge } from "./app-badge";
import { parsePushPayload } from "./push-payload";

const nav = () => ({
  setAppBadge: vi.fn<(n?: number) => Promise<void>>(async () => {}),
  clearAppBadge: vi.fn(async () => {}),
});

describe("syncAppBadge", () => {
  it("shows the count, clears at 0", async () => {
    const n = nav();
    await syncAppBadge(3, n);
    expect(n.setAppBadge).toHaveBeenCalledWith(3);
    await syncAppBadge(0, n);
    expect(n.clearAppBadge).toHaveBeenCalledOnce();
    await clearAppBadge(n);
    expect(n.clearAppBadge).toHaveBeenCalledTimes(2);
  });
  it("is a no-op where unsupported, and never throws", async () => {
    await expect(syncAppBadge(2, {})).resolves.toBeUndefined();
    const n = nav();
    n.setAppBadge.mockRejectedValueOnce(new DOMException("no", "NotAllowedError"));
    await expect(syncAppBadge(2, n)).resolves.toBeUndefined();
  });
  it("sanitises odd counts", async () => {
    const n = nav();
    await syncAppBadge(2.7, n);
    expect(n.setAppBadge).toHaveBeenCalledWith(2);
    await syncAppBadge(-4, n);
    await syncAppBadge(Number.NaN, n);
    expect(n.clearAppBadge).toHaveBeenCalledTimes(2);
  });
});

describe("badge from a push", () => {
  it("uses the server's badgeCount; without it keeps the current badge", () => {
    expect(
      nextBadgeCount(parsePushPayload(JSON.stringify({ tag: "pending-9", badgeCount: 4 }))),
    ).toBe(4);
    expect(nextBadgeCount(parsePushPayload(JSON.stringify({ badgeCount: 0 })))).toBe(0);
    expect(nextBadgeCount(parsePushPayload(JSON.stringify({ tag: "pending-9" })))).toBeNull();
    expect(nextBadgeCount(parsePushPayload(JSON.stringify({ badgeCount: -1 })))).toBeNull();
    expect(nextBadgeCount(parsePushPayload(JSON.stringify({ badgeCount: "3" })))).toBeNull();
  });
});
