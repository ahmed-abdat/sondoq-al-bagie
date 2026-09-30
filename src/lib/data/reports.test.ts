import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberMonth, MemberStatus } from "./types";

const read = vi.hoisted(() => ({
  members: vi.fn(),
  memberMonths: vi.fn(),
  fundAccounts: vi.fn(),
  walletTypes: vi.fn(),
  fundAccountsAdmin: vi.fn(),
}));
vi.mock("./read", async (orig) => ({ ...(await orig<typeof import("./read")>()), ...read }));
const r = await import("./reports");

/** Supabase stand-in: every chain call returns the builder; awaiting gives the table's rows. */
function fakeClient(tables: Record<string, unknown[]>, rpcs: Record<string, unknown> = {}) {
  const rpc = vi.fn(async (name: string) => ({ data: rpcs[name] ?? null, error: null }));
  const from = (t: string) => {
    const rows = tables[t] ?? [];
    const b: Record<string, unknown> = {};
    for (const m of [
      "select",
      "eq",
      "is",
      "gte",
      "lte",
      "order",
      "range",
      "in",
      "not",
      "neq",
      "limit",
    ])
      b[m] = () => b;
    b.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok);
    return b;
  };
  return { client: { from, rpc } as never, rpc };
}

const now = new Date("2026-09-30T10:00:00Z");
const member = (over: Partial<MemberStatus>): MemberStatus => ({
  memberId: "m1",
  listCode: "A",
  number: 1,
  memberRef: "A-1",
  fullName: "عضو",
  groupCode: "A",
  status: "active",
  monthsPaidThisYear: 0,
  monthsBehind: 0,
  statusLabel: "منتظم",
  amountOwed: null,
  ...over,
});
const month = (memberId: string, m: number, state: MemberMonth["state"]): MemberMonth => ({
  memberId,
  year: 2026,
  month: m,
  state,
});

beforeEach(() => {
  for (const f of Object.values(read)) f.mockReset();
});

describe("report periods", () => {
  it("a year, a month, and February of a leap year", () => {
    expect(r.periodRange({ year: 2026 })).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(r.periodRange({ year: 2026, month: 9 })).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(r.periodRange({ year: 2028, month: 2 }).to).toBe("2028-02-29");
  });

  it("annual report maps the SQL totals with category labels", async () => {
    const { client, rpc } = fakeClient(
      {},
      {
        report_period: {
          opening: 100,
          income: { fees: 50, levies: 20, donations: 10, total: 80 },
          spending: {
            by_category: [{ category: "sports", amount: 30 }],
            by_activity: [{ activity_id: 3, name: "الفريق الرياضي", amount: 30 }],
            from_campaigns: 5,
            total: 30,
          },
          adjustments: -1,
          closing: 149,
          campaigns_held: 7,
          income_due: { total: 70, fees_for_other_months: 20, fees_paid_outside: 10 },
          months: [{ year: 2026, month: 1, income: 80, due_income: 70, spending: 30 }],
        },
      },
    );
    const a = await r.loadAnnual(client, { year: 2026 }, now);
    expect(rpc).toHaveBeenCalledWith("report_period", { p_from: "2026-01-01", p_to: "2026-12-31" });
    expect(a).toMatchObject({
      period: { year: 2026 },
      opening: 100,
      closing: 149,
      campaignsHeld: 7,
      income: { levies: 20, total: 80 },
      spending: { fromCampaigns: 5, total: 30 },
    });
    expect(a.spending.byCategory[0]).toMatchObject({ category: "sports", amount: 30 });
    expect(a.spending.byCategory[0].label).toBeTruthy();
    expect(a.spending.byActivity).toEqual([{ activityId: 3, name: "الفريق الرياضي", amount: 30 }]);
    expect(a.incomeDue).toEqual({ total: 70, feesForOtherMonths: 20, feesPaidOutside: 10 });
    expect(a.months[0]).toEqual({ year: 2026, month: 1, income: 80, dueIncome: 70, spending: 30 });
    // total by due month = total by date − other months + paid outside
    expect(a.incomeDue.total).toBe(
      a.income.total - a.incomeDue.feesForOtherMonths + a.incomeDue.feesPaidOutside,
    );
  });

  it("expenses: each item names its activity; totals per activity add up", async () => {
    const e = (id: string, activity_id: number, name: string | null, amount: number) => ({
      id,
      spent_on: "2026-05-01",
      category: "other",
      activity_id,
      activity: name === null ? null : { name },
      note: null,
      amount,
      campaign_id: null,
      created_by: "u1",
    });
    const { client } = fakeClient({
      expenses: [e("x1", 5, "رحلة", 700), e("x2", 5, "رحلة", 300), e("x3", 4, null, 200)],
      committee: [{ user_id: "u1", display_name: "أحمد" }],
      campaigns: [],
    });
    const x = await r.loadExpenses(client, { year: 2026 }, now);
    expect(x.items[0]).toMatchObject({
      activityId: 5,
      activity: "رحلة",
      label: "رحلة",
      recordedBy: "أحمد",
    });
    expect(x.items[2].activity).toBe("أخرى");
    expect(x.byActivity).toEqual([
      { activityId: 5, name: "رحلة", amount: 1000 },
      { activityId: 4, name: "أخرى", amount: 200 },
    ]);
    expect(x.byActivity.reduce((s, a) => s + a.amount, 0)).toBe(x.total);
  });
});

describe("member reports", () => {
  it("late: active members with late months or an unpaid levy share, no amounts", async () => {
    read.members.mockResolvedValue([
      member({}),
      member({ memberId: "m2", memberRef: "A-2", fullName: "ب" }),
      member({ memberId: "m3", memberRef: "A-3", status: "left" }),
      member({ memberId: "m4", memberRef: "A-4" }),
    ]);
    read.memberMonths.mockResolvedValue([
      month("m1", 3, "late"),
      month("m1", 2, "late"),
      month("m3", 1, "late"),
      month("m4", 1, "paid"),
    ]);
    const { client } = fakeClient({
      levy_shares: [
        { member_id: "m2", title: "لوحة", left_amount: 1000, exempt: false },
        { member_id: "m4", title: "لوحة", left_amount: 1000, exempt: true },
      ],
    });
    const late = await r.loadLate(client, 2026, now);
    expect(late.members.map((m) => m.memberRef)).toEqual(["A-1", "A-2"]);
    expect(late.members[0]).toMatchObject({
      lateMonths: ["2026-02", "2026-03"],
      monthsCount: 2,
      levies: [],
    });
    expect(late.members[1].levies).toEqual([{ title: "لوحة" }]);
    // the paper grid: 12 cells, the same states as the months table
    expect(late.members[0].months).toHaveLength(12);
    expect(late.members[0].months[1]).toBe("late");
    expect(late.members[0].months[2]).toBe("late");
    expect(late.termLabel).toBeNull();
    expect(JSON.stringify(late)).not.toMatch(/amount/i);
  });

  it("summary: paid the whole year vs paid that month", async () => {
    read.members.mockResolvedValue([member({}), member({ memberId: "m2", monthsBehind: 2 })]);
    read.memberMonths.mockResolvedValue([
      ...Array.from({ length: 12 }, (_, k) => month("m1", k + 1, "paid")),
      month("m2", 9, "paid"),
      month("m2", 10, "upcoming"),
    ]);
    const money = {
      opening: 1,
      income: { total: 2 },
      spending: { total: 3, by_category: [] },
      closing: 5000,
      campaigns_held: 1500,
      months: [],
    };
    const { client } = fakeClient(
      {
        campaigns: [
          { kind: "levy", status: "open" },
          { kind: "donation", status: "open" },
        ],
      },
      { report_period: money },
    );
    const year = await r.loadSummary(client, { year: 2026 }, now);
    expect(year).toMatchObject({
      membersActive: 2,
      membersPaidPeriod: 1,
      membersLate: 1,
      openLevies: 1,
      openCampaigns: 1,
      closing: 5000,
      campaignsHeld: 1500,
    });
    const sept = await r.loadSummary(client, { year: 2026, month: 9 }, now);
    expect(sept.membersPaidPeriod).toBe(2);
  });

  it("statement: 12 months with paid / prepaid / late / exempt / not a member", () => {
    const s = r.toMemberStatement(
      {
        year: 2026,
        member: {
          member_id: "m1",
          member_ref: "A-1",
          full_name: "عضو",
          group_code: "A",
          status: "active",
        },
        months: [
          { month: 1, status: "active", price: 1000, paid: true, due: false },
          { month: 2, status: "active", price: 1000, paid: false, due: true },
          { month: 3, status: "exempt", price: 1000, paid: false, due: false },
          { month: 10, status: "active", price: 1000, paid: false, due: false },
          { month: 11, status: "active", price: 1000, paid: true, due: false },
        ],
        payments: [
          {
            payment_id: "p1",
            paid_on: "2026-01-05",
            status: "confirmed",
            method: "bankily",
            amount: 1000,
            total: 2000,
            months: [{ year: 2026, month: 1 }],
            campaigns: [],
            recorded_by_name: "مشرف",
            recorded_at: "2026-01-05T10:00:00Z",
            confirmed_by_name: "مشرف",
          },
        ],
        levies: [{ title: "لوحة", expected: 2000, paid: 0, left: 2000, exempt: false }],
        owed: { months_count: 1, amount_owed: 1000, levy_left: 2000, credit: 0 },
      },
      now,
    );
    expect(s.months.map((m) => m.state).slice(0, 4)).toEqual([
      "paid",
      "late",
      "exempt",
      "not_owed",
    ]);
    expect(s.months[9].state).toBe("upcoming");
    expect(s.months[10].state).toBe("prepaid");
    expect(s.payments[0]).toMatchObject({
      months: ["2026-01"],
      recordedBy: "مشرف",
      amount: 1000,
      total: 2000,
    });
    expect(s.owed).toEqual({ monthsCount: 1, amountOwed: 1000, levyLeft: 2000, credit: 0 });
  });
});

describe("money reports", () => {
  it("wallets: one row per account (balance only with an opening), cash apart, paper and unspecified", async () => {
    read.walletTypes.mockResolvedValue([
      {
        id: 1,
        name: "بنكيلي",
        logoPath: "a1b2c3d4e5f60718.png",
        kind: "wallet",
        sortOrder: 1,
        active: true,
        legacyMethod: "bankily",
        opening: null,
      },
      {
        id: 9,
        name: "ويل",
        logoPath: null,
        kind: "wallet",
        sortOrder: 8,
        active: true,
        legacyMethod: null,
        opening: null,
      },
      {
        id: 8,
        name: "نقدًا",
        logoPath: null,
        kind: "cash",
        sortOrder: 99,
        active: true,
        legacyMethod: "cash",
        opening: { amount: 500, on: "2026-01-01" },
      },
    ]);
    read.fundAccountsAdmin.mockResolvedValue([{ id: "f1", accountNumber: "22000001" }]);
    const row = (o: Record<string, unknown>) => ({
      wallet_type_id: null,
      fund_account_id: null,
      method: null,
      in_count: 0,
      in_amount: 0,
      out_count: 0,
      out_amount: 0,
      opening_balance: null,
      opening_on: null,
      balance: null,
      transfer_in: 0,
      transfer_out: 0,
      ...o,
    });
    const { client } = fakeClient(
      {},
      {
        report_wallets: [
          row({
            wallet_type_id: 1,
            fund_account_id: "f1",
            method: "bankily",
            in_count: 2,
            in_amount: 3000,
            out_count: 1,
            out_amount: 700,
            opening_balance: 1000,
            opening_on: "2026-01-01",
            balance: 3150,
            transfer_out: 150,
          }),
          row({ wallet_type_id: 9, method: "other", in_count: 1, in_amount: 200, balance: 200 }),
          row({
            wallet_type_id: 8,
            method: "cash",
            in_count: 1,
            in_amount: 500,
            out_count: 1,
            out_amount: 300,
            opening_balance: 500,
            opening_on: "2026-01-01",
            balance: 700,
            transfer_in: 150,
          }),
          row({ method: "paper", in_count: 5, in_amount: 9000 }),
          row({ out_count: 2, out_amount: 900 }),
        ],
      },
    );
    const w = await r.loadWallets(client, { year: 2026 }, now);
    expect(w.wallets).toEqual([
      {
        walletTypeId: 1,
        fundAccountId: "f1",
        method: "bankily",
        label: "بنكيلي",
        logoPath: "a1b2c3d4e5f60718.png",
        accountNumber: "22000001",
        in: 3000,
        count: 2,
        out: 700,
        transferIn: 0,
        transferOut: 150,
        opening: { amount: 1000, on: "2026-01-01" },
        balance: 3150,
      },
      expect.objectContaining({
        walletTypeId: 9,
        label: "ويل",
        fundAccountId: null,
        in: 200,
        opening: null,
        balance: 200,
      }),
    ]);
    expect(w.cash).toEqual({
      in: 500,
      count: 1,
      out: 300,
      transferIn: 150,
      transferOut: 0,
      opening: { amount: 500, on: "2026-01-01" },
      balance: 700,
    });
    expect(w.paperIn).toBe(9000);
    expect(w.unspecifiedOut).toBe(900);
    expect(w.totalIn).toBe(3000 + 200 + 500 + 9000);
  });

  it("campaign: a non-member donor by name, members by ref, levy shares", async () => {
    const { client } = fakeClient({
      campaigns: [
        {
          id: "c1",
          title: "لوحة",
          kind: "levy",
          purpose: null,
          status: "open",
          target_amount: null,
          created_at: "t",
          closed_at: null,
        },
      ],
      campaign_progress: [{ collected: 3000, spent: 0, transferred: 0, balance: 3000 }],
      payment_allocations: [
        { payment_id: "p1", member_id: null, donor_name: "متبرع من خارج الصندوق", amount: 1000 },
        { payment_id: "p2", member_id: "m1", donor_name: null, amount: 2000 },
      ],
      payments: [
        { id: "p1", paid_on: "2026-09-02", payer_name: "تحويل", status: "confirmed" },
        { id: "p2", paid_on: "2026-09-01", payer_name: "أب", status: "confirmed" },
      ],
      members: [{ id: "m1", list_code: "B", number: 7, full_name: "عضو" }],
      expenses: [],
      levy_shares: [
        {
          member_ref: "B-7",
          full_name: "عضو",
          expected: 2000,
          paid: 2000,
          left_amount: 0,
          exempt: false,
          exempt_reason: null,
        },
      ],
    });
    const c = await r.loadCampaign(client, "c1", now);
    expect(c?.contributions).toEqual([
      { paidOn: "2026-09-01", name: "عضو", memberRef: "B-7", amount: 2000 },
      { paidOn: "2026-09-02", name: "متبرع من خارج الصندوق", memberRef: null, amount: 1000 },
    ]);
    expect(c?.shares?.[0]).toMatchObject({ memberRef: "B-7", left: 0, exempt: false });
  });

  it("committee work: people from SQL and what was cancelled, newest first", async () => {
    const { client } = fakeClient(
      {
        payments: [
          {
            payer_name: "دافع",
            amount: 1000,
            cancelled_by: "u1",
            cancelled_at: "2026-09-02T00:00:00Z",
            cancel_reason: "خطأ",
          },
        ],
        expenses: [
          {
            note: null,
            category: "sports",
            amount: 50,
            cancelled_by: "u1",
            cancelled_at: "2026-09-05T00:00:00Z",
            cancel_reason: null,
          },
        ],
        committee: [{ user_id: "u1", display_name: "المسؤول" }],
      },
      {
        report_committee_work: [
          {
            display_name: "المسؤول",
            is_admin: true,
            active: true,
            payments_count: 3,
            payments_amount: 3000,
            expenses_count: 1,
            expenses_amount: 50,
            cancellations: 2,
            levy_exemptions: 0,
            last_at: null,
          },
        ],
      },
    );
    const w = await r.loadCommitteeWork(client, { year: 2026, month: 9 }, now);
    expect(w.people[0]).toMatchObject({
      name: "المسؤول",
      isAdmin: true,
      payments: { count: 3, amount: 3000 },
    });
    expect(w.cancelled?.map((x) => x.amount)).toEqual([50, 1000]);
    expect(w.cancelled?.[1]).toMatchObject({ what: "دافع", by: "المسؤول", reason: "خطأ" });
  });
});

describe("«الإحصاءات»", () => {
  const fee = (year: number, active: number) => ({
    year,
    ref_month: 9,
    overall: { active, paid_up: 1, paid_up_pct: 33.33, owe_1: 1, owe_2_3: 1, owe_4plus: 0 },
    groups: [
      {
        group_code: "A",
        active,
        paid_up: 1,
        paid_up_pct: 33.3,
        owe_1: 1,
        owe_2_3: 1,
        owe_4plus: 0,
      },
    ],
    months: [{ month: 1, active, paid: 2, unpaid: 1 }],
  });

  it("maps fee, levy and donation stats; last year only when it had members", async () => {
    const rpc = vi.fn(async (name: string, args: { p_year?: number }) => ({
      data:
        name === "report_fee_stats"
          ? fee(args.p_year!, args.p_year === 2026 ? 3 : 0)
          : name === "report_levy_stats"
            ? [
                {
                  id: "l1",
                  title: "لوحة",
                  status: "open",
                  opened_on: "2026-09-01",
                  days_open: 29,
                  shares: 4,
                  paid: 2,
                  unpaid: 1,
                  exempt: 1,
                  paid_pct: 66.7,
                  expected: 6000,
                  collected: 4000,
                  groups: [
                    { group_code: "B", shares: 1, paid: 0, unpaid: 1, exempt: 0, paid_pct: 0 },
                  ],
                },
              ]
            : [
                {
                  id: "d1",
                  title: "تبرع",
                  status: "open",
                  opened_on: "2026-01-01",
                  member_givers: 2,
                  outside_givers: 1,
                  givers: 3,
                  active_members: 40,
                  member_pct: 5,
                  collected: 3000,
                  target: null,
                  target_pct: null,
                },
              ],
      error: null,
    }));
    const s = await r.loadStats({ rpc } as never, 2026, now);
    expect(s.fees.overall).toEqual({
      active: 3,
      paidUp: 1,
      paidUpPct: 33.3,
      owe1: 1,
      owe2to3: 1,
      owe4plus: 0,
    });
    expect(s.fees.groups[0].groupCode).toBe("A");
    expect(s.previous).toBeNull();
    expect(s.levies[0]).toMatchObject({
      paid: 2,
      exempt: 1,
      paidPct: 66.7,
      groups: [{ groupCode: "B", unpaid: 1 }],
    });
    expect(s.donations[0]).toMatchObject({
      givers: 3,
      outsideGivers: 1,
      target: null,
      targetPct: null,
    });
    expect(rpc).toHaveBeenCalledWith("report_fee_stats", { p_year: 2025, p_as_of: r.yearAgo(now) });
    expect(JSON.stringify(s)).not.toMatch(/full_?name|member_?ref/i);
  });

  it("last year: a snapshot a year ago for the current year, none before the records", async () => {
    const rpc = vi.fn(async (name: string, args: { p_year?: number; p_as_of?: string }) => ({
      data:
        name === "report_fee_stats"
          ? {
              ...fee(args.p_year!, 3),
              as_of: args.p_as_of ?? null,
              before_records: args.p_year === 2025,
            }
          : [],
      error: null,
    }));
    const s = await r.loadStats({ rpc } as never, 2026, now);
    expect(rpc).toHaveBeenCalledWith("report_fee_stats", { p_year: 2025, p_as_of: "2025-09-30" });
    expect(s.fees).toMatchObject({ asOf: null, beforeRecords: false });
    expect(s.previous).toBeNull();
    const past = await r.loadStats({ rpc } as never, 2025, now);
    expect(rpc).toHaveBeenCalledWith("report_fee_stats", { p_year: 2024 });
    expect(past.previous).toMatchObject({ year: 2024, asOf: null, beforeRecords: false });
  });

  it("the same day a year ago", () => {
    expect(r.yearAgo(new Date("2026-09-30T23:59:00Z"))).toBe("2025-09-30");
    expect(r.yearAgo(new Date("2028-02-29T08:00:00Z"))).toBe("2027-02-28");
    expect(r.yearAgo(new Date("2027-01-01T00:00:00Z"))).toBe("2026-01-01");
  });

  it("one levy or donation by id", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    expect(await r.loadLevyStats({ rpc } as never, "x")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("report_levy_stats", { p_id: "x" });
  });
});
