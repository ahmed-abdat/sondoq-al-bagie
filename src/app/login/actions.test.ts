import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
const signOut = vi.fn();
let row: { active: boolean } | null = null;
const query = {
  select: () => query,
  eq: () => query,
  maybeSingle: async () => ({ data: row, error: null }),
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword, signOut }, from: () => query }),
}));
const redirect = vi.fn((to: string) => {
  throw new Error(`redirect ${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
const { login } = await import("./actions");

const form = (login: string, password: string, next = "") => {
  const f = new FormData();
  f.set("login", login);
  f.set("password", password);
  if (next) f.set("next", next);
  return f;
};

beforeEach(() => {
  signInWithPassword.mockReset().mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  signOut.mockReset();
  redirect.mockClear();
  row = { active: true };
});

describe("login", () => {
  it("signs an active committee member in and goes to the committee page", async () => {
    await expect(login({}, form("⁦36 12 34 56⁩", " secret ", "/committee/late"))).rejects.toThrow(
      "redirect /committee/late",
    );
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "22236123456@phone.sondoq.invalid",
      password: "secret",
    });
  });

  it("explains a stopped (or non-committee) account instead of bouncing back silently", async () => {
    row = null;
    const r = await login({}, form("36123456", "secret"));
    expect(r.error).toMatch(/موقوف/);
    expect(signOut).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("refuses a wrong password", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    expect((await login({}, form("36123456", "x"))).error).toMatch(/غير صحيحة/);
  });

  it("tells a rate limit and a dropped connection apart from a wrong password", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: {
        message: "Request rate limit reached",
        status: 429,
        code: "over_request_rate_limit",
      },
    });
    expect((await login({}, form("36123456", "x"))).error).toMatch(/محاولات كثيرة/);
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "TypeError: fetch failed", status: 0 },
    });
    expect((await login({}, form("36123456", "x"))).error).toMatch(/تعذّر الاتصال/);
  });
});
