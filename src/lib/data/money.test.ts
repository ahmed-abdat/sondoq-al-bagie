import { beforeEach, describe, expect, it, vi } from "vitest";
import { toFundInfo, toFundSummary } from "./map";
import type { FundInfo, MemberStatus } from "./types";

vi.mock("server-only", () => ({}));
let committee = false;
let member = false;
const userClient = { name: "user" };
const adminClient = { name: "admin" };
vi.mock("./committee", () => ({ getCommitteeSession: async () => (committee ? {} : null) }));
vi.mock("./member", () => ({ memberSession: async () => (member ? {} : null) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => userClient }));
vi.mock("@/lib/supabase/admin", () => ({ tryCreateAdminClient: () => adminClient }));

const status = (over: Partial<MemberStatus>): MemberStatus => ({
  memberId: "m1",
  listCode: "A",
  number: 1,
  memberRef: "A-1",
  fullName: "عضو",
  groupCode: "A",
  status: "active",
  monthsPaidThisYear: 3,
  monthsBehind: 1,
  statusLabel: "متأخر",
  amountOwed: 2000,
  ...over,
});
let info: FundInfo = toFundInfo(null);
const read = vi.hoisted(() => ({
  fundSummary: vi.fn(),
  monthlyCollection: vi.fn(async () => []),
  expenseTotals: vi.fn(async () => []),
  recentExpenses: vi.fn(async () => []),
  campaigns: vi.fn(async () => []),
  activity: vi.fn(async () => []),
  terms: vi.fn(async () => []),
  fundInfo: vi.fn(),
  members: vi.fn(),
  memberMonths: vi.fn(async (): Promise<unknown[]> => []),
  groupPrices: vi.fn(async () => []),
  campaignContributions: vi.fn(async () => [{ amount: 500 }]),
  fundStats: vi.fn(),
  termsInfo: vi.fn(),
  membersPublic: vi.fn(),
  expensesPublic: vi.fn(),
  campaignsPublic: vi.fn(),
}));
vi.mock("./read", () => read);

const money = await import("./money");
const { loadReportShell } = await import("./report");

beforeEach(() => {
  committee = false;
  member = false;
  info = { ...toFundInfo(null), showAmountOwed: false };
  for (const f of Object.values(read)) f.mockClear();
  read.fundSummary.mockImplementation(async () => ({ ...toFundSummary(null), balance: 543500 }));
  read.fundInfo.mockImplementation(async () => info);
  read.members.mockImplementation(async () => [
    status({}),
    status({ memberId: "m2", amountOwed: null }),
  ]);
});

describe("money viewer", () => {
  it("a stranger gets null everywhere and nothing is read", async () => {
    expect(await money.moneyViewer()).toBeNull();
    expect(await money.getMoney()).toBeNull();
    expect(await money.getReportForViewer()).toBeNull();
    expect(await money.getMoneyContributions("c1")).toBeNull();
    expect(read.fundSummary).not.toHaveBeenCalled();
    expect(read.campaignContributions).not.toHaveBeenCalled();
  });

  it("the committee reads with its own session (RLS), before a member cookie", async () => {
    committee = true;
    member = true;
    expect(await money.moneyViewer()).toEqual({ viewer: "committee", client: userClient });
    const m = await money.getMoney({ year: 2026 });
    expect(m).toMatchObject({ viewer: "committee", year: 2026, amountOwed: null });
    expect(m?.summary.balance).toBe(543500);
    expect(read.fundSummary).toHaveBeenCalledWith(userClient);
    expect(read.monthlyCollection).toHaveBeenCalledWith(userClient, 2026);
  });

  it("a member with a link reads with the server client", async () => {
    member = true;
    expect(await money.moneyViewer()).toEqual({ viewer: "member", client: adminClient });
    expect((await money.getMoney())?.viewer).toBe("member");
    expect(read.fundSummary).toHaveBeenCalledWith(adminClient);
    expect(await money.getMoneyContributions("c1", 5)).toEqual([{ amount: 500 }]);
    expect(read.campaignContributions).toHaveBeenCalledWith(adminClient, "c1", 5);
  });

  it("amounts owed only when the admin turned them on, skipping null", async () => {
    member = true;
    expect((await money.getMoney())?.amountOwed).toBeNull();
    info = { ...info, showAmountOwed: true };
    expect((await money.getMoney())?.amountOwed).toEqual({ m1: 2000 });
  });

  it("the full report for a viewer keeps money", async () => {
    committee = true;
    const r = await money.getReportForViewer({ year: 2026 });
    expect(r?.summary.balance).toBe(543500);
    expect(read.memberMonths).toHaveBeenCalledWith(userClient, 2026);
  });
});

describe("report shell", () => {
  it("reads only the amount-free views and returns no money keys", async () => {
    const stats = {
      membersOk: 20,
      membersBehind: 1,
      membersActive: 21,
      lastActivityAt: null,
      termNumber: 2,
      termStartedOn: "2026-01-01",
    };
    read.fundStats.mockResolvedValue(stats);
    read.termsInfo.mockResolvedValue([
      { number: 2, title: "الدورة 2", startedOn: "2026-01-01", endedOn: null },
    ]);
    read.membersPublic.mockResolvedValue([{ ...status({}), amountOwed: null }]);
    read.expensesPublic.mockResolvedValue([
      { id: "e1", spentOn: "2026-03-01", category: "sports", note: null, campaignId: null },
    ]);
    read.campaignsPublic.mockResolvedValue([
      {
        campaignId: "c1",
        title: "حملة",
        purpose: null,
        deadline: null,
        status: "open",
        amountMode: "free",
        participants: 0,
        participantsPaid: 0,
      },
    ]);
    info = { ...info, showAmountOwed: true };
    read.memberMonths.mockResolvedValueOnce([
      { memberId: "m1", year: 2026, month: 1, state: "paid", price: 1000 },
    ]);
    const c = { name: "anon" } as never;
    const shell = await loadReportShell(c, { year: 2026 }, new Date("2026-09-29T00:00:00Z"));

    for (const f of [
      read.fundSummary,
      read.terms,
      read.members,
      read.recentExpenses,
      read.campaigns,
    ])
      expect(f).not.toHaveBeenCalled();
    expect(read.monthlyCollection).not.toHaveBeenCalled();
    expect(shell.stats).toEqual(stats);
    expect(shell.term).toEqual({
      number: 2,
      title: "الدورة 2",
      startedOn: "2026-01-01",
      endedOn: null,
    });
    expect(shell.members[0].months[0]).toBe("paid");
    const json = JSON.stringify(shell);
    for (const key of [
      "amount",
      "amountOwed",
      "balance",
      "collected",
      "spent",
      "targetAmount",
      "openingBalance",
      "closingBalance",
      "summary",
      "monthly",
      "showAmountOwed",
    ])
      expect(json).not.toContain(`"${key}"`);
  });
});
