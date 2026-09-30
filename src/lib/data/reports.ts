// Loaders of the 10 committee reports (docs/COMMITTEE-ONLY-PLAN.md §9), returning the types
// agreed with Lane B (./report-types). Each takes a client: pages call them through ./committee
// (the signed-in committee member's session; the database checks it is the committee). Reads
// that need the database's own rules are SQL (m29–m31: report_period, report_wallets,
// report_committee_work, member_statement, levy_shares); the rest reads committee views.
import { isMethod } from "@/lib/methods";
import type { Json } from "@/lib/supabase/database.types";
import { CATEGORY_LABELS, STATUS_LABELS } from "./labels";
import * as read from "./read";
import { loadReport } from "./report";
import type {
  AnnualReport,
  CampaignReport,
  CommitteeWorkReport,
  DonationStats,
  FeeStats,
  FeeStatsBlock,
  LevyStats,
  StatsReport,
  ExpensesReport,
  GridReport,
  HandoverReport,
  Income,
  LateReport,
  MemberStatement,
  Period,
  Spending,
  SummaryReport,
  WalletsReport,
} from "./report-types";
import type { ExpenseCategory, MembershipStatus, PaymentMethod, PaymentStatus } from "./types";

type Client = read.Client;
type Obj = Record<string, Json | undefined>;

const pad = (n: number) => String(n).padStart(2, "0");
const ym = (year: number, month: number) => `${year}-${pad(month)}`;
const obj = (v: Json | undefined): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const arr = (v: Json | undefined): Json[] => (Array.isArray(v) ? v : []);
const num = (v: Json | undefined) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const str = (v: Json | undefined) => (typeof v === "string" ? v : null);

/** First and last day of a period (a year, or one month of it). */
export function periodRange(p: Period): { from: string; to: string } {
  if (p.month) {
    const last = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
    return { from: `${p.year}-${pad(p.month)}-01`, to: `${p.year}-${pad(p.month)}-${pad(last)}` };
  }
  return { from: `${p.year}-01-01`, to: `${p.year}-12-31` };
}

/* ───────────── money over a period (report_period) ───────────── */

type PeriodMoney = {
  opening: number;
  income: Income;
  spending: Spending;
  adjustments: number;
  closing: number;
  campaignsHeld: number;
  incomeDue: { total: number; feesForOtherMonths: number; feesPaidOutside: number };
  months: { year: number; month: number; income: number; dueIncome: number; spending: number }[];
};

export function toPeriodMoney(d: Json): PeriodMoney {
  const r = obj(d);
  const inc = obj(r.income);
  const sp = obj(r.spending);
  return {
    opening: num(r.opening),
    income: {
      fees: num(inc.fees),
      levies: num(inc.levies),
      donations: num(inc.donations),
      total: num(inc.total),
    },
    spending: {
      byCategory: arr(sp.by_category).map((x) => {
        const o = obj(x);
        const category = str(o.category) as ExpenseCategory;
        return { category, label: CATEGORY_LABELS[category] ?? category, amount: num(o.amount) };
      }),
      byActivity: arr(sp.by_activity).map((x) => {
        const o = obj(x);
        return { activityId: num(o.activity_id), name: str(o.name) ?? "", amount: num(o.amount) };
      }),
      fromCampaigns: num(sp.from_campaigns),
      total: num(sp.total),
    },
    adjustments: num(r.adjustments),
    closing: num(r.closing),
    campaignsHeld: num(r.campaigns_held),
    incomeDue: {
      total: num(obj(r.income_due).total),
      feesForOtherMonths: num(obj(r.income_due).fees_for_other_months),
      feesPaidOutside: num(obj(r.income_due).fees_paid_outside),
    },
    months: arr(r.months).map((x) => {
      const o = obj(x);
      return {
        year: num(o.year),
        month: num(o.month),
        income: num(o.income),
        dueIncome: num(o.due_income),
        spending: num(o.spending),
      };
    }),
  };
}

async function periodMoney(c: Client, from: string, to: string): Promise<PeriodMoney> {
  const res = await c.rpc("report_period", { p_from: from, p_to: to });
  return toPeriodMoney(read.must("report_period", res));
}

/* ───────────── 1 · annual ───────────── */

export async function loadAnnual(
  c: Client,
  period: Period,
  now = new Date(),
): Promise<AnnualReport> {
  const r = periodRange(period);
  return { period, generatedAt: now.toISOString(), ...(await periodMoney(c, r.from, r.to)) };
}

/* ───────────── 2 · summary ───────────── */

export async function loadSummary(
  c: Client,
  period: Period,
  now = new Date(),
): Promise<SummaryReport> {
  const r = periodRange(period);
  const [money, members, months, campaigns] = await Promise.all([
    periodMoney(c, r.from, r.to),
    read.members(c),
    read.memberMonths(c, period.year),
    read.many("campaigns", await c.from("campaigns").select("kind, status")),
  ]);
  const active = members.filter((m) => m.status === "active");
  const byMember = new Map<string, string[]>();
  for (const m of months) {
    if (period.month && m.month !== period.month) continue;
    byMember.set(m.memberId, [...(byMember.get(m.memberId) ?? []), m.state]);
  }
  const paidPeriod = active.filter((m) => {
    const states = byMember.get(m.memberId) ?? [];
    if (period.month) return states.includes("paid");
    const owed = states.filter((s) => s !== "not_owed");
    return owed.length > 0 && owed.every((s) => s === "paid");
  }).length;
  return {
    period,
    generatedAt: now.toISOString(),
    opening: money.opening,
    income: money.income.total,
    spending: money.spending.total,
    closing: money.closing,
    campaignsHeld: money.campaignsHeld,
    membersActive: active.length,
    membersPaidPeriod: paidPeriod,
    membersLate: active.filter((m) => m.monthsBehind > 0).length,
    openCampaigns: campaigns.filter((x) => x.status === "open" && x.kind !== "levy").length,
    openLevies: campaigns.filter((x) => x.status === "open" && x.kind === "levy").length,
  };
}

/* ───────────── 3 · months table ───────────── */

export async function loadGrid(c: Client, year: number, now = new Date()): Promise<GridReport> {
  const r = await loadReport(c, { year }, now);
  return {
    year,
    generatedAt: now.toISOString(),
    members: r.members
      .filter((m) => m.status !== "left" && m.status !== "deceased")
      .map((m) => ({
        memberRef: m.memberRef,
        fullName: m.fullName,
        groupCode: m.groupCode,
        status: m.status,
        statusLabel: m.statusLabel,
        months: m.months,
        monthsPaid: m.monthsPaid,
        monthsBehind: m.monthsBehind,
      })),
    groupPrices: r.groupPrices,
  };
}

/* ───────────── 4 · «المتأخرات» ───────────── */

type ShareRow = {
  campaign_id: string | null;
  title: string | null;
  member_id: string | null;
  member_ref: string | null;
  full_name: string | null;
  expected: number | null;
  paid: number | null;
  left_amount: number | null;
  exempt: boolean | null;
  exempt_reason: string | null;
};

async function levyShares(c: Client, filter: { campaignId?: string } = {}): Promise<ShareRow[]> {
  let q = c
    .from("levy_shares")
    .select(
      "campaign_id, title, member_id, member_ref, full_name, expected, paid, left_amount, exempt, exempt_reason",
    );
  if (filter.campaignId) q = q.eq("campaign_id", filter.campaignId);
  return read.many("levy_shares", await q.order("member_ref"));
}

export async function loadLate(c: Client, year: number, now = new Date()): Promise<LateReport> {
  const [members, months, shares, report] = await Promise.all([
    read.members(c),
    read.memberMonths(c, year),
    levyShares(c),
    loadReport(c, { year }, now),
  ]);
  const grid = new Map(report.members.map((m) => [m.memberId, m.months]));
  const late = new Map<string, string[]>();
  for (const m of months) {
    if (m.state !== "late") continue;
    late.set(m.memberId, [...(late.get(m.memberId) ?? []), ym(m.year, m.month)]);
  }
  const levies = new Map<string, { title: string }[]>();
  for (const s of shares) {
    if (!s.member_id || s.exempt || (s.left_amount ?? 0) <= 0) continue;
    levies.set(s.member_id, [...(levies.get(s.member_id) ?? []), { title: s.title ?? "" }]);
  }
  return {
    year,
    generatedAt: now.toISOString(),
    termLabel: report.term?.title ?? null,
    members: members
      .filter((m) => m.status === "active" && (late.has(m.memberId) || levies.has(m.memberId)))
      .map((m) => {
        const lateMonths = (late.get(m.memberId) ?? []).sort();
        return {
          memberRef: m.memberRef,
          fullName: m.fullName,
          groupCode: m.groupCode,
          months: grid.get(m.memberId) ?? [],
          lateMonths,
          monthsCount: lateMonths.length,
          levies: levies.get(m.memberId) ?? [],
        };
      }),
  };
}

/* ───────────── names ───────────── */

async function committeeNames(c: Client): Promise<Map<string, string>> {
  const rows = read.many("committee", await c.from("committee").select("user_id, display_name"));
  return new Map(rows.map((r) => [r.user_id, r.display_name]));
}

async function campaignTitles(c: Client): Promise<Map<string, { title: string; kind: string }>> {
  const rows = read.many("campaigns", await c.from("campaigns").select("id, title, kind"));
  return new Map(rows.map((r) => [r.id, { title: r.title, kind: r.kind }]));
}

/* ───────────── 5 · expenses ───────────── */

export async function loadExpenses(
  c: Client,
  period: Period,
  now = new Date(),
): Promise<ExpensesReport> {
  const r = periodRange(period);
  const [rows, names, titles] = await Promise.all([
    read.paged("expenses", (from, to) =>
      c
        .from("expenses")
        .select(
          "id, spent_on, category, activity_id, note, amount, campaign_id, created_by, activity:expense_activities(name)",
        )
        .is("cancelled_at", null)
        .gte("spent_on", r.from)
        .lte("spent_on", r.to)
        .order("spent_on")
        .order("id")
        .range(from, to),
    ),
    committeeNames(c),
    campaignTitles(c),
  ]);
  const items = rows.map((e) => ({
    spentOn: e.spent_on,
    category: e.category,
    label: e.activity?.name ?? CATEGORY_LABELS[e.category],
    activityId: e.activity_id,
    activity: e.activity?.name ?? CATEGORY_LABELS[e.category],
    note: e.note,
    amount: e.amount,
    campaignTitle: e.campaign_id ? (titles.get(e.campaign_id)?.title ?? null) : null,
    recordedBy: e.created_by ? (names.get(e.created_by) ?? null) : null,
  }));
  const totals = new Map<ExpenseCategory, number>();
  for (const i of items) totals.set(i.category, (totals.get(i.category) ?? 0) + i.amount);
  const byActivity = new Map<number, { activityId: number; name: string; amount: number }>();
  for (const i of items) {
    const a = byActivity.get(i.activityId) ?? {
      activityId: i.activityId,
      name: i.activity,
      amount: 0,
    };
    a.amount += i.amount;
    byActivity.set(i.activityId, a);
  }
  return {
    period,
    generatedAt: now.toISOString(),
    items,
    byCategory: [...totals]
      .map(([category, amount]) => ({ category, label: CATEGORY_LABELS[category], amount }))
      .sort((a, b) => b.amount - a.amount),
    byActivity: [...byActivity.values()].sort((a, b) => b.amount - a.amount),
    total: items.reduce((s, i) => s + i.amount, 0),
  };
}

/* ───────────── 6 · campaign or levy ───────────── */

export async function loadCampaign(
  c: Client,
  id: string,
  now = new Date(),
): Promise<CampaignReport | null> {
  const camp = read.must(
    "campaigns",
    await c
      .from("campaigns")
      .select("id, title, kind, purpose, status, target_amount, created_at, closed_at")
      .eq("id", id)
      .maybeSingle(),
  );
  if (!camp) return null;
  const progRes = await c
    .from("campaign_progress")
    .select("collected, spent, transferred, balance")
    .eq("campaign_id", id)
    .maybeSingle();
  const progress = read.must("campaign_progress", progRes);
  const [allocs, expenses] = await Promise.all([
    read.many(
      "payment_allocations",
      await c
        .from("payment_allocations")
        .select("payment_id, member_id, donor_name, amount")
        .eq("kind", "campaign")
        .eq("campaign_id", id),
    ),
    read.many(
      "expenses",
      await c
        .from("expenses")
        .select("spent_on, note, amount")
        .eq("campaign_id", id)
        .is("cancelled_at", null)
        .order("spent_on"),
    ),
  ]);
  const paymentIds = [...new Set(allocs.map((a) => a.payment_id))];
  const memberIds = [...new Set(allocs.map((a) => a.member_id).filter((x): x is string => !!x))];
  const [payments, members] = await Promise.all([
    paymentIds.length
      ? read.many(
          "payments",
          await c
            .from("payments")
            .select("id, paid_on, payer_name, status")
            .in("id", paymentIds)
            .eq("status", "confirmed"),
        )
      : [],
    memberIds.length
      ? read.many(
          "members",
          await c.from("members").select("id, list_code, number, full_name").in("id", memberIds),
        )
      : [],
  ]);
  const pay = new Map(payments.map((p) => [p.id, p]));
  const mem = new Map(members.map((m) => [m.id, m]));
  const contributions = allocs
    .filter((a) => pay.has(a.payment_id))
    .map((a) => {
      const p = pay.get(a.payment_id)!;
      const m = a.member_id ? mem.get(a.member_id) : undefined;
      return {
        paidOn: p.paid_on,
        name: a.donor_name ?? m?.full_name ?? p.payer_name,
        memberRef: m ? `${m.list_code}-${m.number}` : null,
        amount: a.amount,
      };
    })
    .sort((a, b) => a.paidOn.localeCompare(b.paidOn));
  const kind = camp.kind === "levy" ? "levy" : "donation";
  const report: CampaignReport = {
    generatedAt: now.toISOString(),
    id: camp.id,
    title: camp.title,
    kind,
    purpose: camp.purpose,
    status: camp.status,
    targetAmount: camp.target_amount,
    createdAt: camp.created_at,
    closedAt: camp.closed_at,
    collected: progress?.collected ?? 0,
    spent: progress?.spent ?? 0,
    transferred: progress?.transferred ?? 0,
    balance: progress?.balance ?? 0,
    contributions,
    expenses: expenses.map((e) => ({ spentOn: e.spent_on, note: e.note, amount: e.amount })),
  };
  if (kind === "levy") {
    report.shares = (await levyShares(c, { campaignId: id })).map((s) => ({
      memberRef: s.member_ref ?? "",
      fullName: s.full_name ?? "",
      expected: s.expected ?? 0,
      paid: s.paid ?? 0,
      left: s.left_amount ?? 0,
      exempt: !!s.exempt,
      exemptReason: s.exempt_reason,
    }));
  }
  return report;
}

/* ───────────── 7 · member statement ───────────── */

export function toMemberStatement(d: Json, now: Date): MemberStatement {
  const r = obj(d);
  const m = obj(r.member);
  const year = num(r.year);
  const nowYm = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const byMonth = new Map(arr(r.months).map((x) => [num(obj(x).month), obj(x)]));
  const owed = obj(r.owed);
  return {
    generatedAt: now.toISOString(),
    year,
    member: {
      memberId: str(m.member_id) ?? "",
      memberRef: str(m.member_ref) ?? "",
      fullName: str(m.full_name) ?? "",
      groupCode: str(m.group_code),
      status: str(m.status) as MembershipStatus | null,
      phone: str(m.phone),
    },
    months: Array.from({ length: 12 }, (_, k) => {
      const x = byMonth.get(k + 1);
      if (!x)
        return { month: k + 1, state: "not_owed" as const, price: null, paid: false, due: false };
      const paid = x.paid === true;
      const due = x.due === true;
      const future = year * 12 + k > nowYm;
      const state =
        paid && future
          ? ("prepaid" as const)
          : paid
            ? ("paid" as const)
            : due
              ? ("late" as const)
              : str(x.status) === "exempt"
                ? ("exempt" as const)
                : str(x.status) === "active"
                  ? ("upcoming" as const)
                  : ("not_owed" as const);
      return { month: k + 1, state, price: x.price == null ? null : num(x.price), paid, due };
    }),
    payments: arr(r.payments).map((x) => {
      const p = obj(x);
      return {
        paymentId: str(p.payment_id) ?? "",
        paidOn: str(p.paid_on) ?? "",
        status: str(p.status) as PaymentStatus,
        method: str(p.method) as PaymentMethod,
        amount: num(p.amount),
        total: num(p.total),
        months: arr(p.months).map((mm) => ym(num(obj(mm).year), num(obj(mm).month))),
        campaigns: arr(p.campaigns).map((t) => String(t)),
        note: str(p.note),
        reason: str(p.reason),
        recordedBy: str(p.recorded_by_name),
        recordedAt: str(p.recorded_at) ?? "",
        confirmedBy: str(p.confirmed_by_name),
        confirmedAt: str(p.confirmed_at),
        cancelledBy: str(p.cancelled_by_name),
        cancelledAt: str(p.cancelled_at),
      };
    }),
    levies: arr(r.levies).map((x) => {
      const l = obj(x);
      return {
        title: str(l.title) ?? "",
        expected: num(l.expected),
        paid: num(l.paid),
        left: num(l.left),
        exempt: l.exempt === true,
      };
    }),
    owed: {
      monthsCount: num(owed.months_count),
      amountOwed: num(owed.amount_owed),
      levyLeft: num(owed.levy_left),
      credit: num(owed.credit),
    },
  };
}

export async function loadStatement(
  c: Client,
  memberId: string,
  year: number,
  now = new Date(),
): Promise<MemberStatement> {
  const res = await c.rpc("member_statement", { p_member_id: memberId, p_year: year });
  return toMemberStatement(read.must("member_statement", res), now);
}

/* ───────────── 8 · handover ───────────── */

export async function loadHandover(
  c: Client,
  termNumber: number,
  now = new Date(),
): Promise<HandoverReport | null> {
  const term = read.must(
    "terms",
    await c
      .from("terms")
      .select("number, title, started_on, ended_on")
      .eq("number", termNumber)
      .maybeSingle(),
  );
  if (!term) return null;
  const hRes = await c
    .from("handovers_admin")
    .select(
      "computed_balance, counted_balance, counted_lines, difference, carry_over, started_at, started_by_name, submitted_at, submitted_by_name, accepted_at, accepted_by_name, status",
    )
    .eq("from_term", termNumber)
    .neq("status", "cancelled")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const handover = read.must("handovers_admin", hRes);
  const names = await committeeNames(c);
  // the term's own days: its last day is the day before the next one started
  const to = term.ended_on
    ? new Date(Date.parse(term.ended_on) - 86_400_000).toISOString().slice(0, 10)
    : now.toISOString().slice(0, 10);
  const money = await periodMoney(c, term.started_on, to < term.started_on ? term.started_on : to);
  const counted = arr(handover?.counted_lines ?? null).map((x) => {
    const o = obj(x);
    const method = str(o.method);
    return {
      label: str(o.label) ?? "",
      method: method && isMethod(method) ? (method as PaymentMethod) : null,
      amount: num(o.amount),
    };
  });
  return {
    generatedAt: now.toISOString(),
    term: {
      number: term.number,
      title: term.title ?? `الدورة ${term.number}`,
      startedOn: term.started_on,
      endedOn: term.ended_on,
    },
    opening: money.opening,
    income: money.income,
    spending: money.spending,
    adjustments: money.adjustments,
    computedBalance: handover?.computed_balance ?? null,
    counted,
    countedTotal: handover?.counted_balance ?? null,
    difference: handover?.difference ?? null,
    startedBy: { name: handover?.started_by_name ?? null, at: handover?.started_at ?? null },
    submittedBy: { name: handover?.submitted_by_name ?? null, at: handover?.submitted_at ?? null },
    acceptedBy: { name: handover?.accepted_by_name ?? null, at: handover?.accepted_at ?? null },
    carryOver: (handover?.carry_over ?? [])
      .map((id: string) => names.get(id) ?? "")
      .filter(Boolean),
  };
}

/* ───────────── 9 · wallets ───────────── */

export async function loadWallets(
  c: Client,
  period: Period,
  now = new Date(),
): Promise<WalletsReport> {
  const r = periodRange(period);
  const [rows, types, accounts] = await Promise.all([
    read.many("report_wallets", await c.rpc("report_wallets", { p_from: r.from, p_to: r.to })),
    read.walletTypes(c),
    read.fundAccountsAdmin(c),
  ]);
  const opening = (amount: number | null, on: string | null) =>
    amount !== null && on ? { amount, on } : null;
  const wallets: WalletsReport["wallets"] = [];
  let cash: WalletsReport["cash"] = {
    in: 0,
    count: 0,
    out: 0,
    transferIn: 0,
    transferOut: 0,
    opening: null,
    balance: 0,
  };
  let paperIn = 0;
  let unspecifiedOut = 0;
  for (const w of rows) {
    const type = types.find((t) => t.id === w.wallet_type_id);
    if (!type) {
      // no wallet: the paper sheets in, expenses that never named a wallet out
      paperIn += w.in_amount;
      unspecifiedOut += w.out_amount;
      continue;
    }
    const open = opening(w.opening_balance, w.opening_on);
    if (type.kind === "cash") {
      cash = {
        in: w.in_amount,
        count: w.in_count,
        out: w.out_amount,
        transferIn: w.transfer_in,
        transferOut: w.transfer_out,
        opening: open,
        balance: w.balance ?? 0,
      };
      continue;
    }
    const acc = w.fund_account_id ? accounts.find((a) => a.id === w.fund_account_id) : undefined;
    wallets.push({
      walletTypeId: type.id,
      fundAccountId: w.fund_account_id,
      method: (w.method ?? type.legacyMethod ?? "other") as PaymentMethod,
      label: type.name,
      logoPath: type.logoPath,
      accountNumber: acc?.accountNumber ?? null,
      in: w.in_amount,
      count: w.in_count,
      out: w.out_amount,
      transferIn: w.transfer_in,
      transferOut: w.transfer_out,
      opening: open,
      // m43: every wallet and account row has a balance (0 + in − out ± moves, or from its opening)
      balance: w.balance ?? 0,
    });
  }
  return {
    period,
    generatedAt: now.toISOString(),
    wallets,
    cash,
    paperIn,
    unspecifiedOut,
    totalIn: rows.reduce((s, w) => s + w.in_amount, 0),
  };
}

/* ───────────── 10 · committee work ───────────── */

export async function loadCommitteeWork(
  c: Client,
  period: Period,
  now = new Date(),
): Promise<CommitteeWorkReport> {
  const r = periodRange(period);
  const end = `${r.to}T23:59:59.999Z`;
  const [people, payments, expenses, names] = await Promise.all([
    read.many(
      "report_committee_work",
      await c.rpc("report_committee_work", { p_from: r.from, p_to: r.to }),
    ),
    read.many(
      "payments",
      await c
        .from("payments")
        .select("payer_name, amount, cancelled_by, cancelled_at, cancel_reason")
        .eq("status", "cancelled")
        .gte("cancelled_at", r.from)
        .lte("cancelled_at", end),
    ),
    read.many(
      "expenses",
      await c
        .from("expenses")
        .select(
          "note, category, amount, cancelled_by, cancelled_at, cancel_reason, activity:expense_activities(name)",
        )
        .not("cancelled_at", "is", null)
        .gte("cancelled_at", r.from)
        .lte("cancelled_at", end),
    ),
    committeeNames(c),
  ]);
  const by = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  const cancelled = [
    ...payments.map((p) => ({
      what: p.payer_name,
      amount: p.amount,
      by: by(p.cancelled_by),
      at: p.cancelled_at ?? "",
      reason: p.cancel_reason,
    })),
    ...expenses.map((e) => ({
      what: e.note ?? e.activity?.name ?? CATEGORY_LABELS[e.category],
      amount: e.amount,
      by: by(e.cancelled_by),
      at: e.cancelled_at ?? "",
      reason: e.cancel_reason,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return {
    period,
    generatedAt: now.toISOString(),
    people: people.map((p) => ({
      name: p.display_name,
      isAdmin: p.is_admin,
      active: p.active,
      payments: { count: p.payments_count, amount: p.payments_amount },
      expenses: { count: p.expenses_count, amount: p.expenses_amount },
      cancellations: p.cancellations,
      levyExemptions: p.levy_exemptions,
      lastAt: p.last_at ?? null,
    })),
    cancelled,
  };
}

/** Status word for a member status (report tables). */
export const statusLabel = (s: MembershipStatus) => STATUS_LABELS[s];

/* ───────────── «الإحصاءات» (m32) ───────────── */

const pct = (v: Json | undefined) => Math.round(num(v) * 10) / 10;

function toFeeBlock(o: Obj): FeeStatsBlock {
  return {
    active: num(o.active),
    paidUp: num(o.paid_up),
    paidUpPct: pct(o.paid_up_pct),
    owe1: num(o.owe_1),
    owe2to3: num(o.owe_2_3),
    owe4plus: num(o.owe_4plus),
  };
}

export function toFeeStats(d: Json): FeeStats {
  const r = obj(d);
  return {
    year: num(r.year),
    refMonth: num(r.ref_month),
    asOf: str(r.as_of) ?? null,
    beforeRecords: r.before_records === true,
    overall: toFeeBlock(obj(r.overall)),
    groups: arr(r.groups).map((g) => ({
      groupCode: str(obj(g).group_code) ?? "",
      ...toFeeBlock(obj(g)),
    })),
    months: arr(r.months).map((m) => {
      const o = obj(m);
      return {
        month: num(o.month),
        active: num(o.active),
        paid: num(o.paid),
        unpaid: num(o.unpaid),
      };
    }),
  };
}

export function toLevyStats(d: Json): LevyStats[] {
  return arr(d).map((x) => {
    const o = obj(x);
    return {
      id: str(o.id) ?? "",
      title: str(o.title) ?? "",
      status: (str(o.status) ?? "open") as LevyStats["status"],
      openedOn: str(o.opened_on) ?? "",
      daysOpen: num(o.days_open),
      shares: num(o.shares),
      paid: num(o.paid),
      unpaid: num(o.unpaid),
      exempt: num(o.exempt),
      paidPct: pct(o.paid_pct),
      expected: num(o.expected),
      collected: num(o.collected),
      groups: arr(o.groups).map((g) => {
        const q = obj(g);
        return {
          groupCode: str(q.group_code) ?? "",
          shares: num(q.shares),
          paid: num(q.paid),
          unpaid: num(q.unpaid),
          exempt: num(q.exempt),
          paidPct: pct(q.paid_pct),
          expected: num(q.expected),
          collected: num(q.collected),
        };
      }),
    };
  });
}

export function toDonationStats(d: Json): DonationStats[] {
  return arr(d).map((x) => {
    const o = obj(x);
    return {
      id: str(o.id) ?? "",
      title: str(o.title) ?? "",
      status: (str(o.status) ?? "open") as DonationStats["status"],
      openedOn: str(o.opened_on) ?? "",
      memberGivers: num(o.member_givers),
      outsideGivers: num(o.outside_givers),
      givers: num(o.givers),
      activeMembers: num(o.active_members),
      memberPct: pct(o.member_pct),
      collected: num(o.collected),
      target: o.target == null ? null : num(o.target),
      targetPct: o.target_pct == null ? null : pct(o.target_pct),
    };
  });
}

async function feeStats(c: Client, year: number, asOf?: string): Promise<FeeStats> {
  const args = asOf ? { p_year: year, p_as_of: asOf } : { p_year: year };
  return toFeeStats(read.must("report_fee_stats", await c.rpc("report_fee_stats", args)));
}

/** The same day one year earlier (29 February → 28 February), as YYYY-MM-DD (UTC = Nouakchott). */
export function yearAgo(now: Date): string {
  const y = now.getUTCFullYear() - 1;
  const m = now.getUTCMonth() + 1;
  const d = Math.min(now.getUTCDate(), m === 2 ? 28 : 31);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * «الإحصاءات» for a year: fees, every levy and donation, and last year for the trend. For the
 * current year, last year is a snapshot of how it stood on the same day a year ago («في مثل هذا
 * الوقت»); none when that day is before the first recorded payment. A past year compares with the
 * whole year before it.
 */
export async function loadStats(c: Client, year: number, now = new Date()): Promise<StatsReport> {
  const current = year === now.getUTCFullYear();
  const [fees, previous, levies, donations] = await Promise.all([
    feeStats(c, year),
    feeStats(c, year - 1, current ? yearAgo(now) : undefined),
    c.rpc("report_levy_stats", {}),
    c.rpc("report_donation_stats", {}),
  ]);
  return {
    period: { year },
    generatedAt: now.toISOString(),
    fees,
    previous: previous.overall.active > 0 && !previous.beforeRecords ? previous : null,
    levies: toLevyStats(read.must("report_levy_stats", levies)),
    donations: toDonationStats(read.must("report_donation_stats", donations)),
  };
}

/** One levy's analytics (its page and report), or null. */
export async function loadLevyStats(c: Client, id: string): Promise<LevyStats | null> {
  const res = await c.rpc("report_levy_stats", { p_id: id });
  return toLevyStats(read.must("report_levy_stats", res))[0] ?? null;
}

/** One donation's analytics (its page and report), or null. */
export async function loadDonationStats(c: Client, id: string): Promise<DonationStats | null> {
  const res = await c.rpc("report_donation_stats", { p_id: id });
  return toDonationStats(read.must("report_donation_stats", res))[0] ?? null;
}
