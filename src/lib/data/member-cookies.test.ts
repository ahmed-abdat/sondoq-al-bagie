import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ tryCreateAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => null }));
const c = await import("./member-cookies");
const { hashMemberToken } = await import("./member");

const t = (ch: string) => ch.repeat(43);

describe("saved profiles", () => {
  it("parses only valid, unique tokens, at most 5", () => {
    expect(c.parseSaved(JSON.stringify([t("a"), "bad", t("a"), t("b")]))).toEqual([t("a"), t("b")]);
    expect(c.parseSaved("not json")).toEqual([]);
    expect(c.parseSaved(JSON.stringify(["a", "b", "c", "d", "e", "f"].map(t)))).toHaveLength(5);
  });

  it("adds as most recent and drops the least recently used past 5", () => {
    const five = ["a", "b", "c", "d", "e"].map(t);
    expect(c.withProfile(five, t("f"))).toEqual(["f", "a", "b", "c", "d"].map(t));
    expect(c.withProfile(five, t("c"))).toEqual(["c", "a", "b", "d", "e"].map(t));
    expect(c.withoutProfile(five, t("a"))).toEqual(["b", "c", "d", "e"].map(t));
  });
});

describe("opening a link", () => {
  const live = (tok: string) => ({ data: { member_id: "m", link_id: `l-${tok[0]}` }, error: null });

  it("first link on the device becomes active", async () => {
    jar.clear();
    rpc.mockResolvedValue(live(t("a")));
    expect(await c.openMemberLink(t("a"))).toBe("active");
    expect(jar.get("bq_member")).toBe(t("a"));
    expect(jar.get("bq_member_on")).toBe("1");
  });

  it("another member's link waits for the choice; a saved one switches directly", async () => {
    rpc.mockResolvedValue(live(t("b")));
    expect(await c.openMemberLink(t("b"))).toBe("pending");
    expect(jar.get("bq_member")).toBe(t("a"));
    expect(jar.get("bq_member_pending")).toBe(t("b"));
    jar.set("bq_member_saved", JSON.stringify([t("a"), t("c")]));
    expect(await c.openMemberLink(t("c"))).toBe("active");
    expect(jar.get("bq_member")).toBe(t("c"));
  });

  it("an invalid link changes nothing", async () => {
    const before = new Map(jar);
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await c.openMemberLink(t("z"))).toBe("invalid");
    expect(jar).toEqual(before);
  });

  it("lists the device's live profiles in one call, active flagged", async () => {
    jar.clear();
    jar.set("bq_member", t("a"));
    jar.set("bq_member_saved", JSON.stringify([t("a"), t("b"), t("c")]));
    rpc.mockResolvedValue({
      data: [
        {
          token_hash: hashMemberToken(t("a")),
          link_id: "la",
          member_id: "ma",
          member_ref: "A-1",
          full_name: "أ",
        },
        {
          token_hash: hashMemberToken(t("c")),
          link_id: "lc",
          member_id: "mc",
          member_ref: "A-3",
          full_name: "ج",
        },
      ],
      error: null,
    });
    rpc.mockClear();
    expect(await c.memberProfiles()).toEqual([
      { linkId: "la", memberId: "ma", memberRef: "A-1", fullName: "أ", active: true },
      { linkId: "lc", memberId: "mc", memberRef: "A-3", fullName: "ج", active: false },
    ]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
