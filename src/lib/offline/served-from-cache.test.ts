import { expect, it } from "vitest";
import { lookupServed, recordServed, savedCopyMessage, type Served } from "./served-from-cache";

const T = Date.parse("2026-09-28T10:00:00Z");

it("remembers the saved copy's date per path (page and RSC alike)", () => {
  const m = new Map<string, Served>();
  recordServed(m, "https://x.app/members?_rsc=abc", "Sun, 27 Sep 2026 08:00:00 GMT", T);
  expect(lookupServed(m, "/members", T - 1000)).toBe(Date.parse("2026-09-27T08:00:00Z"));
  // answered before this page asked: not about this page
  expect(lookupServed(m, "/members", T + 1)).toBeNull();
  expect(lookupServed(m, "/", T - 1000)).toBeNull();
});

it("no Date header: counts as now; keeps at most 50 paths", () => {
  const m = new Map<string, Served>();
  recordServed(m, "/a", null, T);
  expect(lookupServed(m, "/a", 0)).toBe(T);
  for (let i = 0; i < 60; i++) recordServed(m, `/p${i}`, null, T);
  expect(m.size).toBe(50);
});

it("says how old the copy is", () => {
  expect(savedCopyMessage(T - 2 * 3_600_000, T)).toBe("هذه نسخة محفوظة قبل ساعتين.");
  expect(savedCopyMessage(T - 10_000, T)).toBe("هذه نسخة محفوظة قبل لحظات.");
});
