import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const jar = { value: undefined as string | undefined, deleted: [] as string[] };
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (jar.value === undefined ? undefined : { value: jar.value }),
    delete: (n: string) => void jar.deleted.push(n),
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
  jar.value = token;
  jar.deleted = [];
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
    jar.value = undefined;
    expect(await a.memberSubmitPayment(input)).toMatchObject({ code: "member_link_invalid" });
    jar.value = token;
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

  it("signs out: both cookies go, and this device's push", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await a.memberSignOut({ endpoint: "https://push.test/1" })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(jar.deleted).toEqual(["bq_member", "bq_member_on"]);
    expect(rpc).toHaveBeenCalledWith("member_delete_push", {
      p_token_hash: hashMemberToken(token),
      p_endpoint: "https://push.test/1",
    });
  });
});
