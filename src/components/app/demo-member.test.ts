import { describe, expect, it } from "vitest";
import {
  acceptPending,
  declinePending,
  openLink,
  readDemoPhone,
  removeActive,
  switchTo,
  type DemoPhone,
} from "./demo-member";

const empty: DemoPhone = { active: null, profiles: [], pending: null };

describe("demo phone profiles", () => {
  it("first link becomes active; the same link again changes nothing", () => {
    const p = openLink(empty, "demo");
    expect(p).toEqual({ active: "demo", profiles: ["demo"], pending: null });
    expect(openLink(p, "demo")).toEqual(p);
  });
  it("another member's link waits for a choice", () => {
    const p = openLink(openLink(empty, "demo"), "demo2");
    expect(p.pending).toBe("demo2");
    expect(p.active).toBe("demo");
    expect(declinePending(p)).toEqual({ active: "demo", profiles: ["demo"], pending: null });
    expect(acceptPending(p)).toEqual({ active: "demo2", profiles: ["demo", "demo2"], pending: null });
  });
  it("switches only to a profile on this phone; removing keeps the others", () => {
    const p = acceptPending(openLink(openLink(empty, "demo"), "demo2"))!;
    expect(switchTo(p, "demo").active).toBe("demo");
    expect(openLink(switchTo(p, "demo"), "demo2").active).toBe("demo2");
    expect(removeActive(p)).toEqual({ active: "demo", profiles: ["demo"], pending: null });
    expect(removeActive(removeActive(p))).toEqual(empty);
  });
  it("reads the cookies, ignoring unknown tokens", () => {
    const jar: Record<string, string> = {
      bq_member: "demo2",
      bq_demo_profiles: "demo,xx",
      bq_demo_pending: "demo2",
    };
    expect(readDemoPhone((n) => jar[n], "bq_member")).toEqual({
      active: "demo2",
      profiles: ["demo2", "demo"],
      pending: null,
    });
  });
});
