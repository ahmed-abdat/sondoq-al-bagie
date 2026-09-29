import { describe, expect, it } from "vitest";
import type { MemberLinkInfo } from "@/lib/data/member-types";
import type { MemberAdmin } from "@/lib/data/types";
import { linkCounts, linkGroups, linkRows, linkState, nextInWalk } from "./member-links-model";

const m = (
  id: string,
  ref: string,
  status: MemberAdmin["status"] = "active",
  phone: string | null = "36123456",
): MemberAdmin => {
  const [l, n] = ref.split("-");
  return {
    memberId: id,
    listCode: l,
    number: Number(n),
    memberRef: ref,
    fullName: `عضو ${id}`,
    phone,
    note: null,
    groupCode: l,
    status,
    monthsPaidThisYear: 0,
    monthsBehind: 0,
    amountOwed: 0,
    joinedMonth: null,
    formerDebtMonths: null,
    formerDebtAmount: null,
  };
};
const link = (id: string, used = false): MemberLinkInfo => ({
  memberId: id,
  createdAt: "2026-09-01T10:00:00Z",
  lastUsedAt: used ? "2026-09-02T10:00:00Z" : null,
});

const members = [
  m("b2", "B-2"),
  m("a10", "A-10", "active", null),
  m("a2", "A-2"),
  m("x", "A-3", "left"),
  m("e", "A-4", "exempt"),
  m("a1", "A-1"),
  m("b1", "B-1"),
];
const links: Record<string, MemberLinkInfo> = { a2: link("a2"), b1: link("b1", true) };
const rows = linkRows(members, (id) => links[id]);

describe("member links", () => {
  it("state: none / sent / using", () => {
    expect(linkState(null)).toBe("none");
    expect(linkState(link("a"))).toBe("sent");
    expect(linkState(link("a", true))).toBe("using");
  });

  it("active members only, in paper order", () => {
    expect(rows.map((r) => r.memberRef)).toEqual(["A-1", "A-2", "A-10", "B-1", "B-2"]);
    expect(rows.map((r) => r.state)).toEqual(["none", "sent", "none", "using", "none"]);
  });

  it("counts and groups", () => {
    expect(linkCounts(rows)).toEqual({ total: 5, sent: 2, left: 3 });
    expect(linkGroups(rows).map((g) => [g.code, g.sent, g.items.length])).toEqual([
      ["A", 1, 3],
      ["B", 1, 2],
    ]);
  });

  it("walk: first unsent, then the next unsent after the current, skipping", () => {
    expect(nextInWalk(rows, null)).toBe("a1");
    expect(nextInWalk(rows, "a1")).toBe("a10");
    expect(nextInWalk(rows, "a10")).toBe("b2");
    expect(nextInWalk(rows, "b2")).toBeNull();
    expect(nextInWalk(rows, null, new Set(["a1", "a10"]))).toBe("b2");
  });

  it("walk after a send: the sent row no longer counts", () => {
    const after = linkRows(members, (id) => (id === "a1" ? link("a1") : links[id]));
    expect(nextInWalk(after, null)).toBe("a10");
    expect(nextInWalk(after, "a1")).toBe("a10");
  });
});
