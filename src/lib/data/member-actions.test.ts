import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
/** Cookie jar stand-in: name → value. */
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
}));
const afterFns: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void afterFns.push(fn) }));
const notifyConfirmers = vi.fn();
vi.mock("@/lib/push/send", () => ({
  notifyConfirmers: (...a: unknown[]) => notifyConfirmers(...a),
}));
const rpc = vi.fn();
const upload = vi.fn(async () => ({ error: null }));
const dupQuery = {
  select: () => dupQuery,
  eq: () => dupQuery,
  in: () => dupQuery,
  neq: () => dupQuery,
  limit: async () => ({ data: [], error: null }),
};
vi.mock("@/lib/supabase/admin", () => ({
  tryCreateAdminClient: () => ({
    rpc,
    from: () => dupQuery,
    storage: { from: () => ({ upload }) },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => null }));
const a = await import("./member-actions");
const { hashMemberToken } = await import("./member");

const token = "B".repeat(43);
const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const member = "0f8fad5b-d9cb-469f-a165-70867728950e";
const input = {
  id,
  payerName: "سيدي",
  method: "bankily" as const,
  amount: 1000,
  paidOn: "2026-09-20",
  allocations: [{ kind: "months" as const, memberId: member, year: 2026, month: 9, amount: 1000 }],
  proofPath: `payments/${id}-0123456789ab.jpg`,
  proofHash: "a".repeat(64),
};

beforeEach(() => {
  jar.clear();
  jar.set("bq_member", token);
  afterFns.length = 0;
  rpc.mockReset();
  notifyConfirmers.mockReset();
});

describe("member actions", () => {
  it("submits through the link as pending and tells the confirmers", async () => {
    rpc.mockResolvedValue({
      data: { id, status: "pending", replay: false, pending_overlap: true },
      error: null,
    });
    expect(await a.memberSubmitPayment(input)).toEqual({
      ok: true,
      data: { id, replay: false, pendingOverlap: true },
    });
    expect(rpc).toHaveBeenCalledWith(
      "member_submit_payment",
      expect.objectContaining({
        p_token_hash: hashMemberToken(token),
        p_id: id,
        p_allocations: [{ kind: "months", member_id: member, year: 2026, month: 9, amount: 1000 }],
      }),
    );
    await Promise.all(afterFns.map((f) => f()));
    expect(notifyConfirmers).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ tag: `pending-${id}` }),
    );
  });

  it("needs a link and a screenshot, and never paper", async () => {
    jar.delete("bq_member");
    expect(await a.memberSubmitPayment(input)).toMatchObject({ code: "member_link_invalid" });
    jar.set("bq_member", token);
    expect(await a.memberSubmitPayment({ ...input, proofPath: "", proofHash: "" })).toMatchObject({
      code: "proof_required",
    });
    expect(await a.memberSubmitPayment({ ...input, method: "paper" })).toMatchObject({
      code: "invalid_input",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps database refusals, with the month detail", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", hint: "member_rate_limited", message: "x" },
    });
    expect(await a.memberSubmitPayment(input)).toMatchObject({ code: "member_rate_limited" });
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        hint: "month_already_paid",
        message: "x",
        details: JSON.stringify({ name: "سيدي", ref: "B-12", ym: "2026-09" }),
      },
    });
    const r = await a.memberSubmitPayment(input);
    expect(!r.ok && r.message).toMatch(/^شهر سبتمبر 2026 لـ سيدي/);
  });

  it("uploads a checked screenshot with the secret key, only for a working link", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const form = () => {
      const f = new FormData();
      f.set("file", new Blob([jpeg], { type: "image/jpeg" }));
      f.set("id", id);
      return f;
    };
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await a.memberUploadProof(form())).toMatchObject({ code: "member_link_invalid" });
    expect(upload).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: { member_id: member }, error: null });
    const r = await a.memberUploadProof(form());
    expect(r.ok && r.data.path).toMatch(new RegExp(`^payments/${id}-[0-9a-f]{12}\\.jpg$`));
    expect(upload).toHaveBeenCalled();
  });

  it("signs out the active profile only; the next saved one takes over", async () => {
    const other = "C".repeat(43);
    jar.set("bq_member_saved", JSON.stringify([token, other]));
    jar.set("bq_member_on", "1");
    rpc.mockImplementation(async (fn: string) =>
      fn === "member_sessions"
        ? {
            data: [
              {
                token_hash: hashMemberToken(other),
                link_id: "l2",
                member_id: "m2",
                member_ref: "B-3",
                full_name: "أخي",
              },
            ],
            error: null,
          }
        : { data: null, error: null },
    );
    expect(await a.memberSignOut({ endpoint: "https://push.test/1" })).toEqual({
      ok: true,
      data: { last: false },
    });
    expect(rpc).toHaveBeenCalledWith("member_delete_push", {
      p_token_hash: hashMemberToken(token),
      p_endpoint: "https://push.test/1",
    });
    expect(jar.get("bq_member")).toBe(other);
    expect(JSON.parse(jar.get("bq_member_saved")!)).toEqual([other]);
    expect(jar.get("bq_member_on")).toBe("1");
  });

  it("signing out the last profile clears every member cookie", async () => {
    jar.set("bq_member_saved", JSON.stringify([token]));
    jar.set("bq_member_on", "1");
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await a.memberSignOut()).toEqual({ ok: true, data: { last: true } });
    expect([...jar.keys()]).toEqual([]);
  });

  it("switches to another saved profile by link id", async () => {
    const other = "C".repeat(43);
    jar.set("bq_member_saved", JSON.stringify([token, other]));
    rpc.mockResolvedValue({
      data: [
        {
          token_hash: hashMemberToken(token),
          link_id: "l1",
          member_id: "m1",
          member_ref: "B-12",
          full_name: "سيدي",
        },
        {
          token_hash: hashMemberToken(other),
          link_id: "l2",
          member_id: "m2",
          member_ref: "B-3",
          full_name: "أخي",
        },
      ],
      error: null,
    });
    expect(await a.memberSwitch({ linkId: "l2" })).toEqual({ ok: true, data: undefined });
    expect(jar.get("bq_member")).toBe(other);
    expect(JSON.parse(jar.get("bq_member_saved")!)).toEqual([other, token]);
    expect(await a.memberSwitch({ linkId: "nope" })).toMatchObject({ code: "member_link_invalid" });
  });

  it("accepts a pending link (becomes active, saved first) or declines it", async () => {
    const other = "C".repeat(43);
    jar.set("bq_member_pending", other);
    rpc.mockResolvedValue({ data: { member_id: "m2", link_id: "l2" }, error: null });
    expect(await a.memberAcceptPending()).toEqual({ ok: true, data: { droppedName: null } });
    expect(jar.get("bq_member")).toBe(other);
    expect(JSON.parse(jar.get("bq_member_saved")!)).toEqual([other, token]);
    expect(jar.has("bq_member_pending")).toBe(false);
    jar.set("bq_member_pending", token);
    await a.memberDeclinePending();
    expect(jar.has("bq_member_pending")).toBe(false);
    expect(jar.get("bq_member")).toBe(other);
  });

  it("a sixth profile drops the least recently used, and says whose", async () => {
    const five = ["C", "D", "E", "F", "G"].map((c) => c.repeat(43));
    jar.set("bq_member", five[0]);
    jar.set("bq_member_saved", JSON.stringify(five));
    jar.set("bq_member_pending", token);
    rpc.mockImplementation(async (fn: string) =>
      fn === "member_sessions"
        ? {
            data: [
              {
                token_hash: hashMemberToken(five[4]),
                link_id: "lg",
                member_id: "mg",
                member_ref: "B-7",
                full_name: "جدي",
              },
            ],
            error: null,
          }
        : { data: { member_id: "m1", link_id: "l1" }, error: null },
    );
    expect(await a.memberAcceptPending()).toEqual({ ok: true, data: { droppedName: "جدي" } });
    expect(JSON.parse(jar.get("bq_member_saved")!)).toEqual([token, ...five.slice(0, 4)]);
  });

  it("saves this device's push for every saved profile", async () => {
    const other = "C".repeat(43);
    jar.set("bq_member_saved", JSON.stringify([token, other]));
    rpc.mockResolvedValue({ data: 2, error: null });
    expect(
      await a.memberSavePush({
        endpoint: "https://push.test/9",
        keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) },
      }),
    ).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith(
      "member_save_push",
      expect.objectContaining({ p_token_hashes: [hashMemberToken(token), hashMemberToken(other)] }),
    );
  });
});
