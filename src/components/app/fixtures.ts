import "server-only";
// FICTIONAL demo data (names invented, no real member data) shaped exactly like the Lane A types.
// Used only when SONDOQ_FIXTURES=1 (screenshots, dev without a seeded database). See source.ts.
import type {
  ActivityItem,
  Arrear,
  CampaignContribution,
  CampaignProgress,
  CommitteeSession,
  Expense,
  ExpenseAdmin,
  ExpenseTotal,
  FundAccountAdmin,
  FundInfo,
  FundSummary,
  MemberMonth,
  MemberStatus,
  MonthlyCollection,
  PendingPayment,
  VerifiedReceipt,
} from "@/lib/data/types";

export const FX_TODAY = new Date("2026-09-28T10:25:00Z");
const YEAR = 2026;
const DUE = 9; // September is due (after the 10-day grace)
export const FX_PRICE: Record<string, number> = { A: 1000, B: 500 };

const first = [
  "محمد",
  "أحمد",
  "سيدي",
  "الشيخ",
  "عبد الله",
  "محمد الأمين",
  "إبراهيم",
  "يحيى",
  "الحسن",
  "المختار",
  "عالي",
  "الداه",
  "باب",
  "محمدو",
  "سيدي محمد",
  "أحمدو",
  "عبد الرحمن",
  "الطالب",
];
const last = [
  "ولد أحمد",
  "ولد سيدي",
  "ولد الشيخ",
  "ولد محمد",
  "ولد عبد الله",
  "ولد المختار",
  "ولد باب",
  "ولد الحسن",
  "ولد إبراهيم",
  "ولد الطالب",
];

function seeded(n: number) {
  let s = n * 9301 + 49297;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}
const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`.slice(-36);

type Raw = { id: string; no: number; name: string; group: "A" | "B"; paid: number[] };
const RAW: Raw[] = Array.from({ length: 71 }, (_, i) => {
  const r = seeded(i + 3);
  const no = i + 1;
  // ~45% paid the whole year, ~38% nothing yet, the rest through May, June or August.
  const x = r();
  const upTo = x < 0.45 ? 12 : x < 0.83 ? 0 : [5, 6, 8][Math.floor(r() * 3)];
  return {
    id: uuid("a", no),
    no,
    name: `${first[i % first.length]} ${last[Math.floor(i / first.length + r() * 3) % last.length]}`,
    group: no <= 27 ? "A" : "B",
    paid: Array.from({ length: upTo }, (_, k) => k + 1),
  };
});

const owed = (m: Raw) =>
  Array.from({ length: DUE }, (_, k) => k + 1).filter((k) => !m.paid.includes(k));

export function fxMembers(showOwed = false): MemberStatus[] {
  return RAW.map((m) => ({
    memberId: m.id,
    number: m.no,
    fullName: m.name,
    groupCode: m.group,
    status: "active",
    monthsPaidThisYear: m.paid.length,
    monthsBehind: owed(m).length,
    statusLabel: owed(m).length ? "متأخر" : "منتظم",
    amountOwed: showOwed ? owed(m).length * FX_PRICE[m.group] : null,
  }));
}

export function fxMemberMonths(memberId?: string): MemberMonth[] {
  return RAW.filter((m) => !memberId || m.id === memberId).flatMap((m) =>
    Array.from({ length: 12 }, (_, k) => {
      const month = k + 1;
      const state: MemberMonth["state"] = m.paid.includes(month)
        ? "paid"
        : month <= DUE
          ? "late"
          : "upcoming";
      return { memberId: m.id, year: YEAR, month, state };
    }),
  );
}

export function fxMonthly(): MonthlyCollection[] {
  const expected = RAW.reduce((s, m) => s + FX_PRICE[m.group], 0);
  return Array.from({ length: 12 }, (_, k) => ({
    year: YEAR,
    month: k + 1,
    expected,
    collected: RAW.reduce((s, m) => s + (m.paid.includes(k + 1) ? FX_PRICE[m.group] : 0), 0),
  }));
}

const EXPENSES: Expense[] = [
  {
    id: uuid("e", 4),
    spentOn: "2026-09-05",
    category: "other",
    amount: 4500,
    note: "طباعة وتصوير",
    campaignId: null,
  },
  {
    id: uuid("e", 3),
    spentOn: "2026-08-20",
    category: "sports",
    amount: 28000,
    note: "كرات وأقمصة للفريق",
    campaignId: null,
  },
  {
    id: uuid("e", 2),
    spentOn: "2026-08-02",
    category: "honoring",
    amount: 35000,
    note: "تكريم الناجحين في الباكالوريا",
    campaignId: null,
  },
  {
    id: uuid("e", 1),
    spentOn: "2026-07-14",
    category: "teaching",
    amount: 60000,
    note: "دروس تقوية صيفية",
    campaignId: null,
  },
];
export const fxExpenses = () => EXPENSES;
export const fxExpensesAdmin = (): ExpenseAdmin[] =>
  EXPENSES.map((e) => ({
    ...e,
    receiptPath: null,
    createdAt: `${e.spentOn}T12:00:00Z`,
    cancelledAt: null,
    cancelReason: null,
  }));
export const fxExpenseTotals = (): ExpenseTotal[] =>
  (["teaching", "honoring", "sports", "other"] as const).map((category) => ({
    year: YEAR,
    category,
    total: EXPENSES.filter((e) => e.category === category).reduce((s, e) => s + e.amount, 0),
  }));

export function fxSummary(): FundSummary {
  const collected = fxMonthly().reduce((s, m) => s + m.collected, 0);
  const spent = EXPENSES.reduce((s, e) => s + e.amount, 0);
  const members = fxMembers();
  return {
    openingBalance: 45000,
    moneyIn: collected,
    moneyOut: spent,
    transfersIn: 0,
    balance: 45000 + collected - spent,
    collectedThisYear: collected,
    spentThisYear: spent,
    membersOk: members.filter((m) => m.monthsBehind === 0).length,
    membersBehind: members.filter((m) => m.monthsBehind > 0).length,
    lastActivityAt: "2026-09-28T09:48:00Z",
  };
}

const CAMPAIGN_ID = uuid("c", 1);
export const fxCampaigns = (): CampaignProgress[] => [
  {
    campaignId: CAMPAIGN_ID,
    title: "معدات فريق كرة القدم",
    purpose: "كرات وأقمصة وشباك لفريق القرية قبل موسم الشتاء.",
    targetAmount: 80000,
    deadline: "2026-10-31",
    status: "open",
    amountMode: "open",
    collected: 52000,
    spent: 0,
    transferred: 0,
    balance: 52000,
    participants: 31,
    participantsPaid: 31,
  },
];
export const fxContributions = (): CampaignContribution[] =>
  [
    ["محسن من القرية", 5000, "2026-09-24"],
    ["فاعل خير", 10000, "2026-09-21"],
    ["أحمدو ولد الطالب", 2000, "2026-09-19"],
    ["فاعل خير", 3000, "2026-09-15"],
    ["الداه ولد سيدي", 1000, "2026-09-12"],
    ["عالي ولد محمد", 2000, "2026-09-08"],
  ].map(([contributorName, amount, day], i) => ({
    paymentId: uuid("d", i + 1),
    campaignId: CAMPAIGN_ID,
    at: `${day}T11:00:00Z`,
    contributorName: contributorName as string,
    amount: amount as number,
  }));

type Rc = Exclude<VerifiedReceipt, { status: "not_found" }>;
const RECEIPTS: Rc[] = [
  {
    status: "valid",
    code: "BQ-7F3K-0231",
    receiptNo: "2026-0231",
    payerName: "محمد ولد أحمد",
    amount: 3000,
    method: "bankily",
    paidOn: "2026-09-28",
    confirmedAt: "2026-09-28T09:48:00Z",
    confirmedByName: "سيدي محمد",
    confirmedByRole: "treasurer",
    txnRefLast4: "0452",
    members: [
      {
        number: 1,
        fullName: "محمد ولد أحمد",
        months: [7, 8, 9].map((month) => ({ year: YEAR, month })),
      },
    ],
    campaignTitles: [],
  },
  {
    status: "valid",
    code: "BQ-2M9D-0229",
    receiptNo: "2026-0229",
    payerName: "سيدي ولد الشيخ",
    amount: 6000,
    method: "masrvi",
    paidOn: "2026-09-25",
    confirmedAt: "2026-09-25T20:14:00Z",
    confirmedByName: "سيدي محمد",
    confirmedByRole: "treasurer",
    txnRefLast4: "0931",
    members: [
      {
        number: 30,
        fullName: "سيدي ولد الشيخ",
        months: Array.from({ length: 12 }, (_, k) => ({ year: YEAR, month: k + 1 })),
      },
    ],
    campaignTitles: [],
  },
  {
    status: "cancelled",
    code: "BQ-K4TR-0227",
    receiptNo: "2026-0227",
    payerName: "يحيى ولد باب",
    amount: 500,
    method: "bankily",
    paidOn: "2026-09-20",
    confirmedAt: "2026-09-20T11:02:00Z",
    confirmedByName: "سيدي محمد",
    confirmedByRole: "treasurer",
    txnRefLast4: "1930",
    members: [{ number: 44, fullName: "يحيى ولد باب", months: [{ year: YEAR, month: 8 }] }],
    campaignTitles: [],
  },
];
export function fxReceipt(code: string): VerifiedReceipt {
  const r = RECEIPTS.find((x) => x.code.toUpperCase() === code.trim().toUpperCase());
  return r ?? { status: "not_found" };
}

export function fxActivity(): ActivityItem[] {
  const pay = RECEIPTS.filter((r) => r.status === "valid").map((r): ActivityItem => ({
    kind: "payment_confirmed",
    at: r.confirmedAt,
    paymentId: r.code,
    memberNames: r.payerName,
    months: r.members[0].months.length,
    amount: r.amount,
    method: r.method,
    receiptCode: r.code,
  }));
  const exp = EXPENSES.map((e): ActivityItem => ({
    kind: "expense",
    at: `${e.spentOn}T12:00:00Z`,
    amount: e.amount,
    category: e.category,
  }));
  return [...pay, ...exp].sort((a, b) => b.at.localeCompare(a.at));
}

const ACCOUNTS: FundAccountAdmin[] = [
  {
    id: uuid("f", 1),
    method: "bankily",
    accountNumber: "22200000011",
    holderName: "رابطة شباب البقيع",
    sortOrder: 0,
    active: true,
    note: null,
  },
  {
    id: uuid("f", 2),
    method: "masrvi",
    accountNumber: "22200000012",
    holderName: "سيدي محمد ولد أحمد",
    sortOrder: 1,
    active: true,
    note: null,
  },
  {
    id: uuid("f", 3),
    method: "sedad",
    accountNumber: "22200000013",
    holderName: "رابطة شباب البقيع",
    sortOrder: 2,
    active: false,
    note: null,
  },
];
export const fxAccountsAdmin = () => ACCOUNTS;
export const fxAccounts = () =>
  ACCOUNTS.filter((a) => a.active).map((a) => ({
    id: a.id,
    method: a.method,
    accountNumber: a.accountNumber,
    holderName: a.holderName,
    sortOrder: a.sortOrder,
    active: a.active,
  }));
export const fxInfo = (): FundInfo => ({
  whatsappContact: "+22200000000",
  graceDays: 10,
  showAmountOwed: false,
});

const pend = (
  n: number,
  payer: string,
  method: PendingPayment["method"],
  txn: string,
  by: string,
  created: string,
  covers: { no: number; months: number[] }[],
): PendingPayment => {
  const allocations = covers.flatMap((c) => {
    const m = RAW[c.no - 1];
    return c.months.map((month) => ({
      kind: "months" as const,
      memberId: m.id,
      number: m.no,
      fullName: m.name,
      year: YEAR,
      month,
      amount: FX_PRICE[m.group],
    }));
  });
  return {
    id: uuid("b", n),
    status: "pending",
    payerName: payer,
    method,
    amount: allocations.reduce((s, a) => s + a.amount, 0),
    paidOn: "2026-09-28",
    txnRef: txn,
    proofPath: `demo/${n}.webp`,
    note: null,
    createdAt: created,
    createdByName: by,
    decidedAt: null,
    decidedByName: null,
    rejectReason: null,
    cancelReason: null,
    allocations,
    receiptCode: null,
    receiptNo: null,
  };
};
export const fxPending = (): PendingPayment[] =>
  [
    pend(1, RAW[8].name, "bankily", "26092810120482917", "يحيى", "2026-09-28T10:13:00Z", [
      { no: 9, months: [7, 8, 9] },
    ]),
    pend(2, RAW[28].name, "sedad", "TR20260928391", "المختار", "2026-09-28T09:25:00Z", [
      { no: 29, months: [9] },
      { no: 31, months: [9] },
    ]),
    pend(3, RAW[47].name, "masrvi", "771204338", "يحيى", "2026-09-28T07:25:00Z", [
      {
        no: 48,
        months: Array.from({ length: 12 }, (_, k) => k + 1).filter(
          (k) => !RAW[47].paid.includes(k),
        ),
      },
    ]),
  ].filter((p) => p.allocations.length > 0);

export function fxArrears(): Arrear[] {
  return RAW.filter((m) => owed(m).length)
    .sort((a, b) => owed(b).length - owed(a).length || a.no - b.no)
    .map((m) => ({
      memberId: m.id,
      number: m.no,
      fullName: m.name,
      phone: `2224${String(1000000 + m.no).slice(1)}`,
      groupCode: m.group,
      status: "active",
      months: owed(m).map((k) => `${YEAR}-${String(k).padStart(2, "0")}`),
      monthsCount: owed(m).length,
      amountOwed: owed(m).length * FX_PRICE[m.group],
      credit: 0,
      lastRemindedAt:
        m.no % 5 === 0 ? "2026-09-25T10:00:00Z" : m.no % 7 === 0 ? "2026-09-27T09:00:00Z" : null,
    }));
}

export const fxSession = (): CommitteeSession => ({
  userId: uuid("9", 1),
  email: "demo@example.com",
  displayName: "سيدي محمد",
  role: "treasurer",
  memberId: null,
});
