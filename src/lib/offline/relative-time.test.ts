import { describe, expect, it } from "vitest";
import { offlineMessage, timeAgo } from "./relative-time";

const NOW = Date.UTC(2026, 9, 5, 12);

describe("timeAgo", () => {
  it("uses Arabic words with Latin digits", () => {
    expect(timeAgo(NOW - 5 * 60_000, NOW)).toBe("قبل 5 دقائق");
    expect(timeAgo(NOW - 3 * 3_600_000, NOW)).toMatch(/3/);
    expect(timeAgo(NOW - 86_400_000, NOW)).toBe("أمس");
  });
  it("says «قبل لحظات» for very fresh data and never goes negative", () => {
    expect(timeAgo(NOW - 10_000, NOW)).toBe("قبل لحظات");
    expect(timeAgo(NOW + 60_000, NOW)).toBe("قبل لحظات");
    expect(offlineMessage(NOW - 10_000, NOW)).toBe("غير متصل. آخر تحديث قبل لحظات");
  });
});

describe("offlineMessage", () => {
  it("mentions the age of the saved data", () => {
    expect(offlineMessage(NOW - 5 * 60_000, NOW)).toBe("غير متصل. آخر تحديث قبل 5 دقائق");
  });
  it("has a message when nothing is saved yet", () => {
    expect(offlineMessage(null, NOW)).toContain("غير متصل");
  });
});
