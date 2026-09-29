import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let cookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookie === undefined ? undefined : { value: cookie }) }),
}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ tryCreateAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => null }));
const m = await import("./member");

const token = "A".repeat(43);

describe("member link", () => {
  it("accepts only our 43-character base64url tokens and hashes them to hex", () => {
    expect(m.isMemberToken(token)).toBe(true);
    expect(m.isMemberToken("short")).toBe(false);
    expect(m.isMemberToken(`${"A".repeat(42)}=`)).toBe(false);
    expect(m.hashMemberToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(m.hashMemberToken(token)).toBe(m.hashMemberToken(token));
  });

  it("reads the session from the cookie with the hash, never the token", async () => {
    cookie = token;
    rpc.mockResolvedValue({
      data: {
        link_id: "l1",
        member_id: "m1",
        member_ref: "B-12",
        list_code: "B",
        number: 12,
        full_name: "سيدي",
        group_code: "B",
        status: "active",
        months_behind: 2,
        amount_owed: 1000,
        late_months: ["2026-07", "2026-08"],
        credit: 0,
      },
      error: null,
    });
    expect(await m.memberSession()).toMatchObject({
      memberRef: "B-12",
      amountOwed: 1000,
      lateMonths: ["2026-07", "2026-08"],
    });
    expect(rpc).toHaveBeenCalledWith("member_session", { p_token_hash: m.hashMemberToken(token) });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(token);
  });

  it("no cookie, a bad cookie or a revoked link is no session", async () => {
    rpc.mockClear();
    cookie = undefined;
    expect(await m.memberSession()).toBeNull();
    cookie = "not-a-token";
    expect(await m.memberSession()).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    cookie = token;
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await m.memberSession()).toBeNull();
  });

  it("maps history and beneficiaries", () => {
    const [h] = m.toMemberHistory([
      {
        id: "p1",
        status: "rejected",
        amount: 1000,
        method: "bankily",
        paid_on: "2026-09-01",
        created_at: "2026-09-01T10:00:00Z",
        reject_reason: "صورة غير واضحة",
        payer_name: "سيدي",
        sent_by_me: true,
        for_me: false,
        allocations: [
          {
            kind: "months",
            member_id: "m2",
            member_ref: "B-3",
            full_name: "أخي",
            year: 2026,
            month: 9,
            amount: 500,
          },
        ],
      },
    ]);
    expect(h).toMatchObject({
      status: "rejected",
      rejectReason: "صورة غير واضحة",
      sentByMe: true,
      forMe: false,
    });
    expect(h.allocations[0]).toMatchObject({ memberRef: "B-3", month: 9, campaignTitle: null });
    expect(m.toMemberHistory(null)).toEqual([]);
    expect(
      m.toBeneficiaries([{ member_id: "m2", member_ref: "B-3", full_name: "أخي" }, { x: 1 }]),
    ).toEqual([{ memberId: "m2", memberRef: "B-3", fullName: "أخي" }]);
  });
});
