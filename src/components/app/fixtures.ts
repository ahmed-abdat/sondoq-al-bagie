import "server-only";
// FICTIONAL demo data (names invented, no real member data) shaped exactly like the Lane A types.
// Used only when SONDOQ_FIXTURES=1 (screenshots, dev without a seeded database). See source.ts.
import type {
  ActivityItem,
  Arrear,
  CampaignContribution,
  CampaignProgress,
  CommitteeAccount,
  Handover,
  Term,
  CommitteeSession,
  MemberAdmin,
  MembershipStatus,
  Expense,
  ExpenseAdmin,
  ExpenseTotal,
  FundAccountAdmin,
  FundInfo,
  FundSummary,
  BackupStatus,
  MemberMonth,
  MemberStatus,
  MonthlyCollection,
  PendingPayment,
  VerifiedReceipt,
} from "@/lib/data/types";
import type { DemoToken } from "./demo-member";
import type {
  Beneficiary,
  MemberHistoryItem,
  MemberLinkInfo,
  MemberProfile,
  MemberSession,
} from "@/lib/data/member-types";

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

type Raw = {
  id: string;
  no: number;
  name: string;
  group: "A" | "B";
  paid: number[];
  status: MembershipStatus;
  phone: string | null;
};
// Two lists, each numbered from 1: A (1000) 1–21 and B (500) 1–70 — 91 people.
const STATUS: Record<string, MembershipStatus> = {
  "A-5": "exempt",
  "B-33": "left",
  "B-60": "left",
};
/** Joined mid-year: the months before are «غير مستحق» (never offered on the record screen). */
const JOINED: Record<string, number> = { "B-12": 6 };
const RAW: Raw[] = Array.from({ length: 91 }, (_, i) => {
  const r = seeded(i + 3);
  const group: "A" | "B" = i < 21 ? "A" : "B";
  const no = group === "A" ? i + 1 : i - 20;
  const status = STATUS[`${group}-${no}`] ?? "active";
  // ~45% paid the whole year, ~38% nothing yet, the rest through May, June or August.
  const x = r();
  const upTo = x < 0.45 ? 12 : x < 0.83 ? 0 : [5, 6, 8][Math.floor(r() * 3)];
  return {
    id: uuid("a", i + 1),
    no,
    name: `${first[i % first.length]} ${last[Math.floor(i / first.length + r() * 3) % last.length]}`,
    group,
    paid:
      status !== "active"
        ? []
        : JOINED[`${group}-${no}`]
          ? [JOINED[`${group}-${no}`]]
          : Array.from({ length: upTo }, (_, k) => k + 1),
    status,
    phone: i % 6 === 5 ? null : `22240${String(10000 + i).slice(1)}`.slice(0, 11),
  };
});

const owed = (m: Raw) =>
  m.status !== "active"
    ? []
    : Array.from({ length: DUE }, (_, k) => k + 1).filter(
        (k) => !m.paid.includes(k) && k >= (JOINED[`${m.group}-${m.no}`] ?? 1),
      );

export function fxMembers(showOwed = false): MemberStatus[] {
  return RAW.map((m) => ({
    memberId: m.id,
    listCode: m.group,
    number: m.no,
    memberRef: `${m.group}-${m.no}`,
    fullName: m.name,
    groupCode: m.group,
    status: m.status,
    monthsPaidThisYear: m.paid.length,
    monthsBehind: owed(m).length,
    statusLabel: owed(m).length ? "متأخر" : "منتظم",
    amountOwed: showOwed ? owed(m).length * FX_PRICE[m.group] : null,
  }));
}

/** Late months of 2025 (fictional, 2025 price A = 800): the first member of A with nothing paid. */
export function fxPastLate(): MemberMonth[] {
  const m = RAW.find((x) => x.group === "A" && x.status === "active" && !x.paid.length);
  if (!m) return [];
  return [11, 12].map((month) => ({
    memberId: m.id,
    year: YEAR - 1,
    month,
    state: "late" as const,
    price: 800,
  }));
}

/** The weekly backup ran fine on Sunday. */
export const fxBackupStatus = (): BackupStatus => ({
  ok: true,
  lastRunAt: "2026-09-27T03:00:00Z",
  lastOkAt: "2026-09-27T03:00:00Z",
  detail: "2026/2026-09-27.json",
});

export function fxMemberMonths(memberId?: string): MemberMonth[] {
  return RAW.filter((m) => !memberId || m.id === memberId).flatMap((m) =>
    Array.from({ length: 12 }, (_, k) => {
      const month = k + 1;
      const state: MemberMonth["state"] = m.paid.includes(month)
        ? "paid"
        : m.status !== "active" || month < (JOINED[`${m.group}-${m.no}`] ?? 1)
          ? "not_owed"
          : month <= DUE
            ? "late"
            : "upcoming";
      return { memberId: m.id, year: YEAR, month, state };
    }),
  );
}

export function fxMonthly(): MonthlyCollection[] {
  const expected = RAW.filter((m) => m.status === "active").reduce(
    (s, m) => s + FX_PRICE[m.group],
    0,
  );
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
    membersActive: members.length,
    adjustments: 0,
    termNumber: 2,
    termStartedOn: "2026-01-01",
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
        listCode: "A",
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
        listCode: "B",
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
    members: [
      { listCode: "B", number: 44, fullName: "يحيى ولد باب", months: [{ year: YEAR, month: 8 }] },
    ],
    campaignTitles: [],
  },
];
/** Committee «الدفعات الأخيرة»: the fixture receipts as payments (confirmed and cancelled). */
export const fxRecent = (): PendingPayment[] =>
  RECEIPTS.map((r) => ({
    id: r.code,
    status: r.status === "valid" ? "confirmed" : "cancelled",
    payerName: r.payerName,
    method: r.method,
    amount: r.amount,
    paidOn: r.paidOn,
    txnRef: `TR${r.txnRefLast4}`,
    proofPath: null,
    note: null,
    createdAt: r.confirmedAt,
    createdByName: r.confirmedByName,
    decidedAt: r.confirmedAt,
    decidedByName: r.confirmedByName,
    rejectReason: null,
    cancelReason: r.status === "cancelled" ? "دفعة مكررة" : null,
    allocations: r.members.flatMap((m) =>
      m.months.map((x) => ({
        kind: "months" as const,
        memberId: RAW.find((w) => w.group === m.listCode && w.no === m.number)?.id ?? r.code,
        listCode: m.listCode,
        number: m.number,
        fullName: m.fullName,
        year: x.year,
        month: x.month,
        amount: Math.round(r.amount / m.months.length),
      })),
    ),
    receiptCode: r.code,
    receiptNo: r.receiptNo,
  }));

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
    const m = RAW[c.no - 1]; // c.no = index + 1 in RAW
    return c.months.map((month) => ({
      kind: "months" as const,
      memberId: m.id,
      listCode: m.group,
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
      listCode: m.group,
      number: m.no,
      memberRef: `${m.group}-${m.no}`,
      fullName: m.name,
      phone: m.phone,
      groupCode: m.group,
      status: "active",
      months: owed(m).map((k) => `${YEAR}-${String(k).padStart(2, "0")}`),
      monthsCount: owed(m).length,
      amountOwed: owed(m).length * FX_PRICE[m.group],
      // B-12 overpaid once: 2 000 of credit, enough for her late months
      credit: m.group === "B" && m.no === 12 ? 2000 : 0,
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
  canConfirm: true,
  setupPending: false,
});

const omitLabel = <T extends { statusLabel: string }>(m: T): Omit<T, "statusLabel"> => {
  const out: Partial<T> = { ...m };
  delete out.statusLabel;
  return out as Omit<T, "statusLabel">;
};
/** Committee member list (with phone). */
export const fxMembersAdmin = (): MemberAdmin[] =>
  fxMembers(true).map(({ amountOwed, ...rest }, i) => ({
    ...omitLabel(rest),
    phone: RAW[i].phone,
    note: null,
    amountOwed: amountOwed ?? 0,
    joinedMonth: JOINED[rest.memberRef]
      ? `${YEAR}-${String(JOINED[rest.memberRef]).padStart(2, "0")}-01`
      : "2020-01-01",
    // B-33 left in May with March and April unpaid
    formerDebtMonths: rest.memberRef === "B-33" ? [`${YEAR}-03`, `${YEAR}-04`] : null,
    formerDebtAmount: rest.memberRef === "B-33" ? 2 * FX_PRICE.B : null,
  }));

export const fxCommitteeAccounts = (): CommitteeAccount[] => [
  {
    userId: uuid("9", 1),
    displayName: "مستخدم تجريبي",
    role: "admin",
    active: true,
    memberId: null,
    login: "demo@example.com",
    lastSignInAt: "2026-09-28T09:00:00Z",
    createdAt: "2026-09-01T09:00:00Z",
    canDelete: false,
    // the demo user says it is not a member, so its own row has nothing to fix
    notMember: true,
    needsMemberLink: false,
  },
  {
    userId: uuid("9", 2),
    displayName: "سيدي محمد",
    role: "treasurer",
    active: true,
    memberId: RAW[2].id,
    login: "+22236123456",
    lastSignInAt: "2026-09-27T18:30:00Z",
    createdAt: "2026-09-01T09:00:00Z",
    canDelete: false,
    notMember: false,
    needsMemberLink: false,
  },
  {
    userId: uuid("9", 3),
    displayName: "يحيى",
    role: "committee",
    active: true,
    memberId: null,
    login: "+22246123457",
    lastSignInAt: null,
    createdAt: "2026-09-20T09:00:00Z",
    canDelete: true,
    notMember: false,
    needsMemberLink: false,
  },
  {
    // a deputy with no member link yet: «غير مربوط بعضو», with «ربطه بعضوية» / «ليس عضوًا»
    userId: uuid("9", 4),
    displayName: "المختار",
    role: "deputy",
    active: true,
    memberId: null,
    login: "+22226123458",
    lastSignInAt: "2026-09-26T08:10:00Z",
    createdAt: "2026-09-10T09:00:00Z",
    canDelete: false,
    notMember: false,
    needsMemberLink: true,
  },
];

export const fxTerms = (): Term[] => [
  {
    number: 2,
    title: "الدورة 2",
    startedOn: "2026-01-01",
    endedOn: null,
    openingBalance: 45000,
    closingBalance: null,
    collected: fxSummary().collectedThisYear,
    spent: fxSummary().spentThisYear,
    adjustment: 0,
  },
  {
    number: 1,
    title: "الدورة 1",
    startedOn: "2024-01-01",
    endedOn: "2025-12-31",
    openingBalance: 12000,
    closingBalance: 45000,
    collected: 168000,
    spent: 134500,
    adjustment: -500,
  },
];
export const fxHandovers = (): Handover[] => [];

/* ───────────── member link (demo: /m/demo) ───────────── */
// The demo member is A-3 (late July to September); he paid earlier for himself and once for B-6.
const ME = RAW[2];
const COUSIN = RAW[26]; // B-6
const ym = (month: number) => `${YEAR}-${String(month).padStart(2, "0")}`;
const DEMO_WHO: Record<DemoToken, Raw> = { demo: ME, demo2: COUSIN };
const DEMO_LINK: Record<DemoToken, string> = { demo: uuid("c", 1), demo2: uuid("c", 2) };
/** Demo link id → token (the switcher sends link ids). */
export const fxDemoTokenOf = (linkId: string) =>
  (Object.keys(DEMO_LINK) as DemoToken[]).find((t) => DEMO_LINK[t] === linkId) ?? null;
export function fxMemberSession(t: DemoToken = "demo"): MemberSession {
  const m = DEMO_WHO[t];
  return {
    linkId: DEMO_LINK[t],
    memberId: m.id,
    memberRef: `${m.group}-${m.no}`,
    listCode: m.group,
    number: m.no,
    fullName: m.name,
    groupCode: m.group,
    status: m.status,
    monthsBehind: owed(m).length,
    amountOwed: owed(m).length * FX_PRICE[m.group],
    lateMonths: owed(m).map(ym),
    credit: 0,
  };
}
export function fxMemberProfile(t: DemoToken, active: boolean): MemberProfile {
  const s = fxMemberSession(t);
  return {
    linkId: s.linkId,
    memberId: s.memberId,
    memberRef: s.memberRef,
    fullName: s.fullName,
    active,
  };
}
const monthsOf = (m: Raw, months: number[]) =>
  months.map((month) => ({
    kind: "months" as const,
    memberId: m.id,
    memberRef: `${m.group}-${m.no}`,
    fullName: m.name,
    year: YEAR,
    month,
    amount: FX_PRICE[m.group],
    campaignTitle: null,
  }));
export function fxMemberHistory(t: DemoToken = "demo"): MemberHistoryItem[] {
  // demo2 (B-6): the payment A-3 sent for him, seen from his side
  if (t === "demo2")
    return [
      {
        id: uuid("d", 1),
        status: "confirmed",
        amount: 1500,
        method: "bankily",
        paidOn: "2026-05-12",
        createdAt: "2026-05-12T09:00:00Z",
        decidedAt: "2026-05-12T21:15:00Z",
        receiptCode: "BQ-DEMO-M001",
        rejectReason: null,
        payerName: ME.name,
        sentByMe: false,
        forMe: true,
        allocations: monthsOf(COUSIN, [1, 2, 3]),
      },
    ];
  return [
    {
      id: uuid("d", 3),
      status: "rejected",
      amount: 1500,
      method: "bankily",
      paidOn: "2026-09-20",
      createdAt: "2026-09-20T18:10:00Z",
      decidedAt: "2026-09-21T08:02:00Z",
      receiptCode: null,
      rejectReason: "الصورة غير واضحة",
      payerName: ME.name,
      sentByMe: true,
      forMe: false,
      allocations: monthsOf(COUSIN, [7, 8, 9]),
    },
    {
      id: uuid("d", 2),
      status: "confirmed",
      amount: 6000,
      method: "masrvi",
      paidOn: "2026-06-30",
      createdAt: "2026-06-30T12:00:00Z",
      decidedAt: "2026-06-30T19:40:00Z",
      receiptCode: "BQ-DEMO-M002",
      rejectReason: null,
      payerName: ME.name,
      sentByMe: false,
      forMe: true,
      allocations: monthsOf(
        ME,
        ME.paid.filter((k) => k > 0),
      ),
    },
    {
      id: uuid("d", 1),
      status: "confirmed",
      amount: 1500,
      method: "bankily",
      paidOn: "2026-05-12",
      createdAt: "2026-05-12T09:00:00Z",
      decidedAt: "2026-05-12T21:15:00Z",
      receiptCode: "BQ-DEMO-M001",
      rejectReason: null,
      payerName: ME.name,
      sentByMe: true,
      forMe: false,
      allocations: monthsOf(COUSIN, [1, 2, 3]),
    },
  ];
}
export const fxMemberBeneficiaries = (t: DemoToken = "demo"): Beneficiary[] =>
  t === "demo"
    ? [{ memberId: COUSIN.id, memberRef: `${COUSIN.group}-${COUSIN.no}`, fullName: COUSIN.name }]
    : [];
/** Committee: members who already have a link (the demo member and two others). */
export function fxMemberLinks(): Record<string, MemberLinkInfo> {
  return Object.fromEntries(
    [
      { m: ME, createdAt: "2026-09-01T10:00:00Z", lastUsedAt: "2026-09-26T19:30:00Z" },
      { m: RAW[0], createdAt: "2026-09-02T10:00:00Z", lastUsedAt: null },
      { m: RAW[30], createdAt: "2026-09-10T10:00:00Z", lastUsedAt: "2026-09-12T08:00:00Z" },
    ].map((x) => [x.m.id, { memberId: x.m.id, createdAt: x.createdAt, lastUsedAt: x.lastUsedAt }]),
  );
}
