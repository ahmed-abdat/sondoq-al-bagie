import { describe, expect, it } from "vitest";
import { formatDateTime, formatDay, formatMonth, formatTime, monthName, todayIso } from "./dates";

describe("dates", () => {
  it("uses Arabic month names with Latin digits", () => {
    expect(formatDay("2026-10-05")).toMatch(/^5 \S+$/);
    expect(formatDay("2026-10-05", { year: true })).toContain("2026");
    expect(formatMonth("2026-10")).toContain("2026");
    expect(formatDay("2026-10-05")).not.toMatch(/[٠-٩]/);
  });

  it("does not shift a date-only value across days", () => {
    expect(formatDay("2026-01-01", { year: true })).toMatch(/^1 /);
  });

  it("names months 1-12", () => {
    expect(monthName(1)).toBe(formatMonth("2026-01", false));
    expect(monthName(12)).toBe(formatMonth("2026-12", false));
    expect(() => monthName(13)).toThrow(RangeError);
  });

  it("formats 24-hour time in Nouakchott (UTC)", () => {
    expect(formatTime("2026-10-05T14:05:00Z")).toBe("14:05");
    expect(formatDateTime("2026-10-05T14:05:00Z")).toMatch(/^5 \S+ · 14:05$/);
  });

  it("returns today's date in UTC", () => {
    expect(todayIso(new Date("2026-10-05T23:59:00Z"))).toBe("2026-10-05");
  });
});
