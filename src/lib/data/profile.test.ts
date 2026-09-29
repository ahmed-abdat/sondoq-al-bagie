import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let row: Record<string, unknown> | null = null;
let user: Record<string, unknown> | null = null;
const q = (data: () => unknown) => {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.maybeSingle = async () => ({ data: data(), error: null });
  return b;
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (t: string) => (t === "committee" ? q(() => row) : q(() => ({ member_ref: "A-7" }))),
  }),
}));
const { getMyProfile } = await import("./committee");

describe("getMyProfile", () => {
  it("returns the own account with the phone login and the linked member", async () => {
    user = {
      id: "u1",
      email: "22236123456@phone.sondoq.invalid",
      last_sign_in_at: "2026-09-29T01:00:00Z",
    };
    row = {
      display_name: "أحمد",
      role: "treasurer",
      member_id: "m1",
      active: true,
      created_at: "2026-09-01",
    };
    expect(await getMyProfile()).toEqual({
      userId: "u1",
      displayName: "أحمد",
      role: "treasurer",
      login: "+22236123456",
      memberId: "m1",
      memberRef: "A-7",
      lastSignInAt: "2026-09-29T01:00:00Z",
      createdAt: "2026-09-01",
      canLinkMember: false,
      setupPending: false,
    });
  });

  it("is null when signed out or not an active committee member", async () => {
    row = null;
    expect(await getMyProfile()).toBeNull();
    user = null;
    expect(await getMyProfile()).toBeNull();
  });

  it("reads the setup flag from app_metadata only", async () => {
    const { isSetupPending } = await import("./committee");
    expect(isSetupPending({ setup_pending: true })).toBe(true);
    expect(isSetupPending({ setup_pending: false })).toBe(false);
    expect(isSetupPending({})).toBe(false);
    expect(isSetupPending(undefined)).toBe(false);
  });
});
