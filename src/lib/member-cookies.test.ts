import { describe, expect, it } from "vitest";
import {
  acceptPending,
  declinePending,
  EMPTY_JAR,
  openLink,
  readJar,
  removeProfile,
  switchTo,
  writeJar,
  type MemberJar,
} from "./member-cookies";

const jar = (active: string | null, saved: string[], pending: string | null = null): MemberJar => ({
  active,
  saved,
  pending,
});

describe("opening a link", () => {
  it("first profile on this phone: active, saved, welcome", () => {
    expect(openLink(EMPTY_JAR, "A")).toEqual({ jar: jar("A", ["A"]), to: "/?welcome=1" });
  });
  it("a saved profile: becomes active, home", () => {
    expect(openLink(jar("A", ["A", "B"]), "B")).toEqual({ jar: jar("B", ["B", "A"]), to: "/" });
    expect(openLink(jar("A", ["A"]), "A").to).toBe("/");
  });
  it("another person: pending, the choice page", () => {
    expect(openLink(jar("A", ["A"]), "C")).toEqual({ jar: jar("A", ["A"], "C"), to: "/m/switch" });
  });
});

describe("the choice and the switcher", () => {
  it("accept: saved and active; the 6th drops the least recently used", () => {
    expect(acceptPending(jar("A", ["A"], "C"))).toEqual({
      jar: jar("C", ["C", "A"]),
      dropped: null,
    });
    expect(acceptPending(jar("A", ["A", "B", "D", "E", "F"], "C"))).toEqual({
      jar: jar("C", ["C", "A", "B", "D", "E"]),
      dropped: "F",
    });
    expect(acceptPending(jar("A", ["A"]))).toEqual({ jar: jar("A", ["A"]), dropped: null });
  });
  it("decline keeps the current profile", () => {
    expect(declinePending(jar("A", ["A"], "C"))).toEqual(jar("A", ["A"]));
  });
  it("switch to a saved profile only", () => {
    expect(switchTo(jar("A", ["A", "B"]), "B")).toEqual(jar("B", ["B", "A"]));
    expect(switchTo(jar("A", ["A"]), "Z")).toEqual(jar("A", ["A"]));
  });
  it("remove: the next one becomes active; the last one says so", () => {
    expect(removeProfile(jar("A", ["A", "B"]))).toEqual({ jar: jar("B", ["B"]), last: false });
    expect(removeProfile(jar("A", ["A", "B"]), "B")).toEqual({ jar: jar("A", ["A"]), last: false });
    expect(removeProfile(jar("A", ["A"]))).toEqual({ jar: jar(null, []), last: true });
  });
});

describe("cookies", () => {
  const store = (c: Record<string, string>) => ({
    get: (n: string) => (n in c ? { value: c[n] } : undefined),
  });
  it("reads the jar, tolerating junk and phones from before profiles", () => {
    expect(
      readJar(store({ bq_member: "A", bq_member_saved: '["A","B"]', bq_member_pending: "C" })),
    ).toEqual(jar("A", ["A", "B"], "C"));
    expect(readJar(store({ bq_member: "A" }))).toEqual(jar("A", ["A"]));
    expect(readJar(store({ bq_member_saved: "not json" }))).toEqual(EMPTY_JAR);
    expect(readJar(store({ bq_member_saved: '["<x>", 5, "B", "B"]' })).saved).toEqual(["B"]);
    expect(readJar(store({ bq_member: "bad token!" }))).toEqual(EMPTY_JAR);
  });
  it("writes everything, deletes what is gone", () => {
    const set: Record<string, [string, Record<string, unknown>]> = {};
    const deleted: string[] = [];
    const w = {
      set: (n: string, v: string, o: object) => (set[n] = [v, o as Record<string, unknown>]),
      delete: (n: string) => deleted.push(n),
    };
    writeJar(w, jar("A", ["A", "B"], "C"));
    expect(set.bq_member).toEqual([
      "A",
      expect.objectContaining({ httpOnly: true, maxAge: 31536000 }),
    ]);
    expect(set.bq_member_saved[0]).toBe('["A","B"]');
    expect(set.bq_member_on).toEqual(["1", expect.not.objectContaining({ httpOnly: true })]);
    expect(set.bq_member_pending).toEqual([
      "C",
      expect.objectContaining({ httpOnly: true, maxAge: 600 }),
    ]);
    writeJar(w, EMPTY_JAR);
    expect(deleted).toEqual(["bq_member", "bq_member_saved", "bq_member_on", "bq_member_pending"]);
  });
});
