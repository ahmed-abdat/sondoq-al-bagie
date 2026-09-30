import "server-only";
// Demo only: the committee app's data from the fictional fixtures plus a few invented campaigns,
// levies and log lines. Read only by source.ts (demo mode, never on production).
import * as fx from "./fixtures";
import { toMemberRows } from "@/lib/data/member-lists";
import { METHOD_LABELS, methodLogo, type Method } from "@/lib/methods";
import type { WalletType } from "@/lib/data/types";
import { walletLogo } from "./wallet-logo";

/** «المحافظ» for the screens: list order, each with its active accounts. */
export const toWallets = (
  types: WalletType[],
  accounts: {
    id: string;
    method?: Method;
    accountNumber: string;
    holderName: string;
    active: boolean;
    walletTypeId?: number;
  }[],
): PWallet[] =>
  // before m41 is on the database: one wallet per method of the accounts (id < 0 = not sent)
  !types.length
    ? [
        ...new Map(
          accounts.filter((a) => a.active).map((a) => [a.method ?? "other", a] as const),
        ).keys(),
      ]
        .map((m, i): PWallet => ({
          id: -(i + 1),
          name: METHOD_LABELS[m],
          logo: methodLogo(m),
          kind: "wallet",
          active: true,
          method: m,
          accounts: [],
        }))
        .concat({
          id: -99,
          name: "نقدًا",
          logo: null,
          kind: "cash",
          active: true,
          method: "cash",
          accounts: [],
        })
    : [...types]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map((w) => ({
          id: w.id,
          name: w.name,
          logo: walletLogo(w),
          kind: w.kind,
          active: w.active,
          method: (w.legacyMethod ?? "other") as Method,
          accounts: accounts
            .filter((a) => a.active && a.walletTypeId === w.id)
            .map((a) => ({ id: a.id, number: a.accountNumber, holder: a.holderName })),
        }));

/** Active first (the expense sheet's choices), each group in list order. */
export const toActivities = (
  a: { id: number; name: string; sortOrder: number; active: boolean }[],
) =>
  [...a]
    .sort((x, y) => Number(y.active) - Number(x.active) || x.sortOrder - y.sortOrder || x.id - y.id)
    .map(({ id, name, active }) => ({ id, name, active }));

import type { MemberStatement } from "@/lib/data/report-types";
import { allStats, demoStatsReport, statsFromReport } from "@/components/admin/stats";
import type {
  PCampaign,
  PData,
  PExpense,
  PLevy,
  PLog,
  PMember,
  POp,
  PPayment,
  PWallet,
} from "@/components/admin/types";

// plan §8: one committee level; «مسؤول» only manages committee accounts
const ROLE: Record<string, string> = {
  admin: "المسؤول",
  treasurer: "عضو اللجنة",
  deputy: "عضو اللجنة",
  committee: "عضو اللجنة",
};

export function demoAdminData(): PData {
  const year = 2026;
  const due = 9;
  const admin = fx.fxMembersAdmin();
  const months = fx.fxMemberMonths();
  const arrears = new Map(fx.fxArrears().map((a) => [a.memberId, a]));
  const rows = new Map(
    toMemberRows(fx.fxMembers(), months, year, {
      pastLate: fx.fxPastLate(),
      groupPrices: fx.FX_PRICE,
    }).map((r) => [r.memberId, r]),
  );
  const members: PMember[] = admin.map((m) => {
    const mine = months.filter((x) => x.memberId === m.memberId);
    return {
      id: m.memberId,
      ref: m.memberRef,
      group: m.listCode as "A" | "B",
      feeGroup: { code: m.groupCode, name: m.groupCode === "A" ? "أ" : "ب" },
      no: m.number,
      name: m.fullName,
      phone: m.phone,
      status: m.status,
      fee: fx.FX_PRICE[m.listCode],
      paid: mine.filter((x) => x.state === "paid").map((x) => x.month),
      owed: mine.filter((x) => x.state === "late").map((x) => x.month),
      notOwed: mine.filter((x) => x.state === "not_owed").map((x) => x.month),
      pastLate: rows.get(m.memberId)?.pastLate ?? [],
      prices: rows.get(m.memberId)?.prices,
      lastReminded: arrears.get(m.memberId)?.lastRemindedAt ?? null,
    };
  });
  const byId = new Map(members.map((m) => [m.id, m]));

  const toPay = (p: ReturnType<typeof fx.fxPending>[number]): PPayment => {
    const lines = new Map<string, { ref: string; name: string; months: number[] }>();
    for (const a of p.allocations) {
      if (a.kind !== "months") continue;
      const ref = `${a.listCode}-${a.number}`;
      const l = lines.get(ref) ?? { ref, name: a.fullName, months: [] };
      l.months.push(a.month);
      lines.set(ref, l);
    }
    return {
      id: p.id,
      kind: "fees",
      status:
        p.status === "pending" ? "pending" : p.status === "cancelled" ? "cancelled" : "confirmed",
      payer: p.payerName,
      method: p.method as Method,
      amount: p.amount,
      at: p.createdAt,
      by: p.createdByName ?? "",
      txn: p.txnRef,
      receiptNo: p.receiptNo,
      lines: [...lines.values()],
    };
  };
  const pending = fx.fxPending().map(toPay);
  const recent = fx.fxRecent().map(toPay);

  const c1 = fx.fxCampaigns()[0];
  const giftsC1 = fx.fxContributions().map((g, i) => ({
    name: g.contributorName,
    ref: i === 2 ? "B-2" : i === 4 ? "B-14" : i === 5 ? "A-18" : null,
    amount: g.amount,
    at: g.at,
    method: (["bankily", "cash", "masrvi", "bankily", "sedad", "cash"] as Method[])[i],
  }));
  const campaigns: PCampaign[] = [
    {
      id: "c1",
      title: c1.title,
      purpose: c1.purpose ?? "",
      target: c1.targetAmount ?? 80000,
      startedOn: "2026-09-01",
      deadline: c1.deadline,
      status: "open",
      collected: c1.collected,
      spent: 0,
      gifts: [
        ...giftsC1,
        {
          name: "أبناء القرية في نواكشوط",
          ref: null,
          amount: 25000,
          at: "2026-09-04T10:00:00Z",
          method: "bankily",
        },
        {
          name: "محمد ولد أحمد",
          ref: "A-1",
          amount: 4000,
          at: "2026-09-02T10:00:00Z",
          method: "cash",
        },
      ],
      spends: [],
    },
    {
      id: "c2",
      title: "ترميم مصلى القرية",
      purpose: "سقف جديد وطلاء للمصلى قبل موسم الأمطار القادم.",
      target: 150000,
      startedOn: "2026-08-15",
      deadline: "2026-12-15",
      status: "open",
      collected: 64000,
      spent: 22000,
      gifts: [
        {
          name: "فاعل خير",
          ref: null,
          amount: 30000,
          at: "2026-09-20T10:00:00Z",
          method: "bankily",
        },
        {
          name: "إبراهيم ولد الحسن",
          ref: "A-7",
          amount: 5000,
          at: "2026-09-11T10:00:00Z",
          method: "masrvi",
        },
        {
          name: "جماعة المسجد",
          ref: null,
          amount: 20000,
          at: "2026-08-30T10:00:00Z",
          method: "cash",
        },
        {
          name: "سيدي ولد الشيخ",
          ref: "B-30",
          amount: 9000,
          at: "2026-08-18T10:00:00Z",
          method: "sedad",
        },
      ],
      spends: [{ note: "إسمنت ورمل", amount: 22000, at: "2026-09-18T10:00:00Z" }],
    },
    {
      id: "c3",
      title: "حقائب مدرسية 2026",
      purpose: "حقيبة وأدوات لكل تلميذ من أبناء القرية.",
      target: 40000,
      startedOn: "2026-08-01",
      deadline: "2026-09-10",
      status: "closed",
      closedOn: "2026-09-12",
      collected: 43500,
      spent: 41000,
      gifts: [
        {
          name: "فاعل خير",
          ref: null,
          amount: 20000,
          at: "2026-08-20T10:00:00Z",
          method: "bankily",
        },
        {
          name: "أحمد ولد سيدي",
          ref: "A-2",
          amount: 3500,
          at: "2026-08-12T10:00:00Z",
          method: "cash",
        },
        {
          name: "أبناء القرية في نواذيبو",
          ref: null,
          amount: 20000,
          at: "2026-08-05T10:00:00Z",
          method: "masrvi",
        },
      ],
      spends: [{ note: "60 حقيبة وأدوات", amount: 41000, at: "2026-09-05T10:00:00Z" }],
    },
  ];

  const byRef = new Map(members.map((m) => [m.ref, m]));
  for (const c of campaigns)
    for (const g of c.gifts) if (g.ref) g.name = byRef.get(g.ref)?.name ?? g.name;

  const acts = fx.fxActivities();
  const nameOf = (id: number) => acts.find((a) => a.id === id)?.name ?? "";
  const expenses: PExpense[] = [
    ...fx.fxExpensesAdmin().map((e, i) => ({
      id: e.id,
      at: e.spentOn,
      category: e.category,
      activity: nameOf(fx.FX_ACTIVITY_OF[e.category]),
      note: e.note ?? "",
      amount: e.amount,
      campaign: null,
      wallet: i % 3 === 2 ? "نقدًا" : i % 3 === 1 ? "مصرفي" : "بنكيلي",
      by: i % 2 ? "يحيى" : "سيدي محمد",
    })),
    {
      id: "e-c2",
      at: "2026-09-18",
      category: "other",
      activity: "أخرى",
      note: "إسمنت ورمل للمصلى",
      amount: 22000,
      campaign: "c2",
      wallet: "نقدًا",
      by: "سيدي محمد",
    },
    {
      id: "e-c3",
      at: "2026-09-05",
      category: "other",
      activity: "التدريس المحظري",
      note: "60 حقيبة وأدوات",
      amount: 41000,
      campaign: "c3",
      wallet: "بنكيلي",
      by: "يحيى",
    },
  ].sort((a, b) => b.at.localeCompare(a.at)) as PExpense[];

  const ops: POp[] = [
    ...recent
      .filter((p) => p.status === "confirmed")
      .map((p): POp => ({
        t: "pay",
        id: p.id,
        at: p.at,
        title: p.payer,
        sub: "مستحقات",
        amount: p.amount,
      })),
    ...expenses.map((e): POp => ({
      t: "exp",
      id: e.id,
      at: `${e.at}T12:00:00Z`,
      title: e.note,
      sub: e.campaign ? "مصروف تبرع" : "مصروف",
      amount: e.amount,
    })),
    ...campaigns.flatMap((c) =>
      c.gifts.slice(0, 2).map((g, i): POp => ({
        t: "gift",
        id: `${c.id}-${i}`,
        at: g.at,
        title: g.name,
        sub: `مساهمة · ${c.title}`,
        amount: g.amount,
      })),
    ),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const monthlyRaw = fx.fxMonthly();
  const monthly = monthlyRaw.map((m) => ({
    month: m.month,
    collected: m.month <= due ? m.collected : 0,
    expected: m.expected,
    spent: expenses
      .filter((e) => Number(e.at.slice(5, 7)) === m.month && !e.campaign)
      .reduce((s, e) => s + e.amount, 0),
  }));
  const active = members.filter((m) => m.status === "active");
  const levies: PLevy[] = [
    {
      id: "l1",
      title: "علاج الأخ الداه ولد سيدي",
      purpose: "مساهمة الرابطة في عملية جراحية في نواكشوط.",
      perMember: 2000,
      scope: "كل الأعضاء",
      createdOn: "2026-09-10",
      createdBy: "سيدي محمد",
      status: "open",
      refs: active.map((m) => m.ref),
      paidRefs: active
        .filter((m, i) => i % 3 !== 1 && m.paid.length > 0 && i !== 7)
        .map((m) => m.ref),
      // a member exempted by «مسؤول», and one with his own share
      exemptRefs: active.filter((_, i) => i === 7).map((m) => m.ref),
      amounts: Object.fromEntries(active.filter((_, i) => i === 10).map((m) => [m.ref, 1000])),
    },
    {
      id: "l2",
      title: "تنظيف مقبرة القرية",
      purpose: "أجرة العمال والشاحنة.",
      perMember: 500,
      scope: "الفئة أ",
      createdOn: "2026-06-01",
      createdBy: "المختار",
      status: "closed",
      refs: active.filter((m) => m.group === "A").map((m) => m.ref),
      paidRefs: active.filter((m) => m.group === "A" && m.ref !== "A-4").map((m) => m.ref),
    },
  ];
  const log: PLog[] = [
    {
      who: "يحيى",
      what: `سجّل دفعة ${pending[0]?.payer ?? ""}: 3 000 أوقية، بنكيلي`,
      at: "2026-09-28T10:13:00Z",
      kind: "pay",
    },
    {
      who: "سيدي محمد",
      what: "سجّل دفعة محمد ولد أحمد: 3 000 أوقية، بنكيلي",
      at: "2026-09-28T09:48:00Z",
      kind: "pay",
    },
    {
      who: "المختار",
      what: `سجّل دفعة ${pending[1]?.payer ?? ""} نقدًا: 1 000 أوقية`,
      at: "2026-09-28T09:25:00Z",
      kind: "pay",
    },
    {
      who: "سيدي محمد",
      what: "ألغى دفعة يحيى ولد باب (500 أوقية). السبب: سُجّلت مرتين",
      at: "2026-09-27T18:40:00Z",
      kind: "no",
    },
    {
      who: "يحيى",
      what: "سجّل مساهمة محسن من القرية (5 000 أوقية) في معدات فريق كرة القدم",
      at: "2026-09-24T11:00:00Z",
      kind: "gift",
    },
    {
      who: "سيدي محمد",
      what: "سجّل مصروف إسمنت ورمل للمصلى (22 000 أوقية)",
      at: "2026-09-18T10:00:00Z",
      kind: "exp",
    },
    {
      who: "المختار",
      what: "غيّر رقم هاتف أحمدو ولد الطالب",
      at: "2026-09-15T08:30:00Z",
      kind: "edit",
    },
    {
      who: "سيدي محمد",
      what: "أنشأ لوحة «علاج الأخ الداه ولد سيدي» (2 000 أوقية على كل عضو)",
      at: "2026-09-10T09:00:00Z",
      kind: "levy",
    },
  ];

  const s = fx.fxSummary();
  const session = fx.fxSession();
  void byId;
  const base: Omit<PData, "stats"> = {
    terms: fx.fxTerms().map(({ number, title, startedOn, endedOn }) => ({
      number,
      title,
      startedOn,
      endedOn,
    })),
    today: "2026-09-28",
    year,
    due,
    me: { name: session.displayName, role: ROLE[session.role], admin: true },
    balance: s.balance,
    opening: s.openingBalance,
    collectedYear: s.collectedThisYear,
    spentYear: s.spentThisYear,
    monthIn: 38500,
    monthOut: 4500,
    monthly,
    members,
    pending,
    recent,
    ops,
    campaigns,
    expenses,
    accounts: fx.fxAccountsAdmin().map((a) => ({
      id: a.id,
      method: a.method as Method,
      number: a.accountNumber,
      holder: a.holderName,
      active: a.active,
    })),
    users: fx.fxCommitteeAccounts().map((u) => ({
      name: u.displayName,
      role: ROLE[u.role],
      login: u.login,
      last: u.lastSignInAt,
    })),
    prices: fx.FX_PRICE,
    levies,
    activities: toActivities(acts),
    wallets: toWallets(fx.fxWalletTypes(), fx.fxAccountsAdmin()),
    log,
  };
  // the same path as production: the «الإحصاءات» report, then the screens' shape
  const counted = allStats(base);
  return { ...base, stats: statsFromReport(demoStatsReport(base, 55), base.due, counted.owing) };
}

/** Demo «كشف حساب» of one member, built from the same fictional months as the committee app. */
export function demoStatement(memberId: string, year: number): MemberStatement | null {
  const d = demoAdminData();
  const m = d.members.find((x) => x.id === memberId);
  if (!m) return null;
  const key = (k: number) => `${year}-${String(k).padStart(2, "0")}`;
  const runs: number[][] = [];
  for (const k of [...m.paid].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && last.length < 3 && last.at(-1) === k - 1) last.push(k);
    else runs.push([k]);
  }
  const payments: MemberStatement["payments"] = runs.map((ms, i) => {
    const on = `${key(ms[0])}-05`;
    return {
      paymentId: `demo-${m.ref}-${i}`,
      paidOn: on,
      status: "confirmed",
      method: i % 2 ? "cash" : "bankily",
      amount: ms.length * m.fee,
      total: ms.length * m.fee,
      months: ms.map(key),
      campaigns: [],
      note: i === 0 && m.ref === "A-1" ? "يختلف عن الصورة: الباقي يُدفع نقدًا" : null,
      reason: null,
      recordedBy: i % 2 ? "يحيى" : "سيدي محمد",
      recordedAt: `${on}T10:00:00Z`,
      confirmedBy: i % 2 ? "يحيى" : "سيدي محمد",
      confirmedAt: `${on}T10:00:00Z`,
      cancelledBy: null,
      cancelledAt: null,
    };
  });
  const levies = d.levies
    .filter((l) => l.refs.includes(m.ref))
    .map((l) => {
      const expected = l.amounts?.[m.ref] ?? l.perMember;
      const exempt = !!l.exemptRefs?.includes(m.ref);
      const paid = l.paidRefs.includes(m.ref) ? expected : 0;
      return { title: l.title, expected, paid, left: exempt ? 0 : expected - paid, exempt };
    });
  return {
    generatedAt: `${d.today}T12:00:00Z`,
    year,
    member: {
      memberId: m.id,
      memberRef: m.ref,
      fullName: m.name,
      groupCode: m.group,
      status: m.status,
      phone: m.phone,
    },
    months: Array.from({ length: 12 }, (_, i) => {
      const k = i + 1;
      const state = m.paid.includes(k)
        ? "paid"
        : m.owed.includes(k)
          ? "late"
          : m.notOwed.includes(k)
            ? "not_owed"
            : "upcoming";
      return { month: k, state, price: m.fee, paid: state === "paid", due: k <= d.due };
    }),
    payments,
    levies,
    owed: {
      monthsCount: m.owed.length + m.pastLate.length,
      amountOwed: m.owed.length * m.fee + m.pastLate.length * m.fee,
      levyLeft: levies.reduce((s, l) => s + l.left, 0),
      credit: 0,
    },
  };
}

/** Demo «الإحصاءات» report: the same numbers as the demo screens. */
export const demoStats = () => {
  const d = demoAdminData();
  const { stats: _s, ...base } = d;
  void _s;
  return demoStatsReport(base, 55);
};
