import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const session = { name: "session" };
let signedIn = true;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => (signedIn ? session : null) }));
const read = vi.hoisted(() => ({
  membersPublic: vi.fn(async () => []),
  memberMonths: vi.fn(async () => []),
  pastLateMonths: vi.fn(async () => []),
  groupPrices: vi.fn(async () => [{ year: 2026, group: "B", groupName: "B", monthlyAmount: 500 }]),
  fundAccounts: vi.fn(async () => []),
  fundInfo: vi.fn(),
}));
vi.mock("./read", async (orig) => ({ ...(await orig<typeof import("./read")>()), ...read }));
const c = await import("./committee");

beforeEach(() => {
  signedIn = true;
  for (const f of Object.values(read)) f.mockClear();
});

describe("committee reads (replace the anon cached getters before m28)", () => {
  it("read with the committee's own session, per call", async () => {
    await c.getCommitteeMemberRows(2026);
    expect(read.membersPublic).toHaveBeenCalledWith(session);
    expect(read.memberMonths).toHaveBeenCalledWith(session, 2026);
    expect(read.groupPrices).toHaveBeenCalledWith(session, 2026);
    await c.getCommitteeFundAccounts();
    expect(read.fundAccounts).toHaveBeenCalledWith(session);
  });

  it("give empty data without a session", async () => {
    signedIn = false;
    expect(await c.getCommitteeMemberRows()).toEqual([]);
    expect((await c.getCommitteeMemberIndex()).members).toEqual([]);
    expect((await c.getCommitteeFundInfo()).graceDays).toBe(10);
    expect(read.membersPublic).not.toHaveBeenCalled();
  });

  it("index counts the month asked for", async () => {
    const idx = await c.getCommitteeMemberIndex(2026, 9);
    expect(idx).toMatchObject({ year: 2026, month: 9 });
    expect(read.memberMonths).toHaveBeenCalledWith(session, 2026);
  });
});
