// The 10 committee reports (plan §9, prototype round 3): Lane A's data (report-types.ts) →
// a ReportDoc (doc.ts). Pure and unit tested. Words kept simple; «المتأخرات» without amounts;
// no receipt, no QR, no link.
import type {
  AnnualReport,
  CampaignReport,
  CommitteeWorkReport,
  ExpensesReport,
  GridReport,
  HandoverReport,
  LateReport,
  MemberStatement,
  Period,
  SummaryReport,
  WalletsReport,
} from "../data/report-types";
import { formatDay, monthName } from "../dates";
import { formatNumber } from "../format";
import { monthPaid } from "../report-check";
import { monthsText, periodLabel, type AmountRow, type Block, type ReportDoc } from "./doc";

/* ─────────────── small helpers ─────────────── */

const fmt = formatNumber;
/**
 * An amount inside an Arabic sentence, kept left to right: its thin-space groups would otherwise
 * be reordered by the right-to-left text around it («000 1» for «1 000»).
 */
const amt = (v: number) => `\u2066${fmt(v)}\u2069`;
const day = (iso: string) => formatDay(iso.slice(0, 10), { year: true });
/** «A-12» → «أ 12» (group letters as on paper). */
export function refLabel(ref: string): string {
  const [g, n] = ref.split("-");
  const letter = g === "A" ? "أ" : g === "B" ? "ب" : g;
  return n ? `${letter} ${n}` : ref;
}
const groupLabel = (code: string | null) =>
  code === "A" ? "المجموعة أ" : code === "B" ? "المجموعة ب" : "بلا مجموعة";
/** «عضو واحد» «عضوان» «7 أعضاء» «20 عضوًا». */
export function membersWord(n: number): string {
  if (n === 1) return "عضو واحد";
  if (n === 2) return "عضوان";
  const r = n % 100;
  if (r >= 3 && r <= 10) return `${n} أعضاء`;
  return r >= 11 ? `${n} عضوًا` : `${n} عضو`;
}
const periodSlug = (p: Period) =>
  p.month ? `${p.year}-${String(p.month).padStart(2, "0")}` : `${p.year}`;
/** A safe file name part: Arabic and Latin letters, digits, dashes. */
const slug = (s: string) =>
  s
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
/** 'YYYY-MM'[] → words; several years: «2025: نوفمبر وديسمبر؛ 2026: يناير». */
function ymText(yms: string[]): string {
  const byYear = new Map<number, number[]>();
  for (const ym of yms) {
    const [y, m] = ym.split("-").map(Number);
    if (!y || !m) continue;
    byYear.set(y, [...(byYear.get(y) ?? []), m]);
  }
  const years = [...byYear.keys()].sort();
  if (years.length === 1) return monthsText(byYear.get(years[0])!);
  return years.map((y) => `${y}: ${monthsText(byYear.get(y)!)}`).join("؛ ");
}
const rowsOf = (list: [string, number][], total?: [string, number]): Block => ({
  t: "rows",
  rows: list.map(([label, amount]) => ({ label, amount })),
  total: total && { label: total[0], amount: total[1] },
});
const incomeRows = (i: AnnualReport["income"]): [string, number][] => [
  ["الرسوم الشهرية", i.fees],
  ...(i.levies ? ([["اللوحات", i.levies]] as [string, number][]) : []),
  ...(i.donations ? ([["التبرعات", i.donations]] as [string, number][]) : []),
];
const spendingBlocks = (s: AnnualReport["spending"]): Block[] => [
  s.byCategory.length
    ? rowsOf(
        s.byCategory.map((c) => [c.label, c.amount]),
        ["مجموع ما صُرف", s.total],
      )
    : { t: "note", text: "لم يُصرف شيء." },
  ...(s.fromCampaigns
    ? [{ t: "note", text: `منها ${amt(s.fromCampaigns)} من أموال التبرعات واللوحات.` } as Block]
    : []),
];

/* ─────────────── 1 · the full annual (or monthly) report ─────────────── */

export function buildAnnual(d: AnnualReport): ReportDoc {
  const yearly = !d.period.month;
  const edge = yearly ? "السنة" : "الشهر";
  const blocks: Block[] = [
    rowsOf([[`رصيد أول ${edge}`, d.opening]]),
    { t: "heading", text: "ما دخل" },
    rowsOf(incomeRows(d.income), ["مجموع ما دخل", d.income.total]),
    { t: "heading", text: "ما صُرف" },
    ...spendingBlocks(d.spending),
  ];
  if (d.adjustments)
    blocks.push({
      t: "rows",
      rows: [
        {
          label: "تصحيحات",
          amount: Math.abs(d.adjustments),
          sign: d.adjustments < 0 ? "−" : "+",
        },
      ],
    });
  blocks.push({ t: "rows", rows: [], total: { label: `رصيد آخر ${edge}`, amount: d.closing } });
  if (d.campaignsHeld)
    blocks.push({
      t: "note",
      text: `منها ${amt(d.campaignsHeld)} لدى التبرعات واللوحات، لم تُصرف بعد.`,
    });
  if (yearly && d.months.length) {
    blocks.push(
      { t: "heading", text: "ما دخل كل شهر" },
      { t: "bars", values: monthlyValues(d.months, "income") },
      { t: "heading", text: "شهرًا بشهر" },
      {
        t: "table",
        head: ["الشهر", "دخل", "صُرف"],
        num: [false, true, true],
        widths: [0.4, 0.3, 0.3],
        rows: d.months.map((m) => [
          monthName(m.month),
          m.income ? fmt(m.income) : "",
          m.spending ? fmt(m.spending) : "",
        ]),
        foot: ["المجموع", fmt(d.income.total), fmt(d.spending.total)],
      },
    );
  }
  return {
    kind: "annual",
    title: yearly ? "التقرير السنوي الكامل" : "التقرير الشهري الكامل",
    subtitle: periodLabel(d.period),
    blocks,
    fileBase: `${yearly ? "التقرير-السنوي" : "التقرير-الشهري"}-${periodSlug(d.period)}`,
    hasAmounts: true,
  };
}

function monthlyValues(ms: AnnualReport["months"], k: "income" | "spending"): number[] {
  const v = Array<number>(12).fill(0);
  for (const m of ms) if (m.month >= 1 && m.month <= 12) v[m.month - 1] += m[k];
  return v;
}

/* ─────────────── 2 · summary ─────────────── */

export function buildSummary(d: SummaryReport): ReportDoc {
  const yearly = !d.period.month;
  const edge = yearly ? "السنة" : "الشهر";
  const paid = yearly
    ? `دفع رسوم السنة كاملة ${membersWord(d.membersPaidPeriod)} من ${d.membersActive}.`
    : `دفع رسوم ${monthName(d.period.month!)} ${membersWord(d.membersPaidPeriod)} من ${d.membersActive}.`;
  return {
    kind: "summary",
    title: "الملخص",
    subtitle: periodLabel(d.period),
    blocks: [
      {
        t: "rows",
        rows: [
          { label: `في الصندوق أول ${edge}`, amount: d.opening },
          { label: "دخل", amount: d.income, sign: "+" },
          { label: "صُرف", amount: d.spending, sign: "−" },
        ],
        total: { label: `في الصندوق آخر ${edge}`, amount: d.closing },
      },
      { t: "note", text: paid },
    ],
    fileBase: `الملخص-${periodSlug(d.period)}`,
    hasAmounts: true,
  };
}

/* ─────────────── 3 · the months table (a whole year) ─────────────── */

export function buildGrid(d: GridReport): ReportDoc {
  const blocks: Block[] = [];
  const groups = [...new Set(d.members.map((m) => m.groupCode))].sort((a, b) =>
    String(a ?? "~").localeCompare(String(b ?? "~")),
  );
  for (const g of groups) {
    const list = d.members.filter((m) => m.groupCode === g);
    const fee = g === "A" || g === "B" ? d.groupPrices[g] : 0;
    blocks.push(
      {
        t: "heading",
        text: `${groupLabel(g)} · ${membersWord(list.length)}${fee ? ` · الرسوم الشهرية ${amt(fee)}` : ""}`,
      },
      {
        t: "grid",
        rows: list.map((m) => ({
          name: m.fullName,
          paid: Array.from({ length: 12 }, (_, k) => monthPaid(m.months[k])),
        })),
      },
    );
  }
  if (!blocks.length) blocks.push({ t: "note", text: "لا أعضاء." });
  blocks.push({ t: "note", text: "✓ مدفوع · خانة فارغة: لم يُدفع" });
  return {
    kind: "grid",
    title: "جدول الأشهر",
    subtitle: `سنة ${d.year}`,
    blocks,
    fileBase: `جدول-الأشهر-${d.year}`,
    hasAmounts: Object.values(d.groupPrices).some(Boolean),
  };
}

/* ─────────────── 4 · «المتأخرات» (no amounts at all) ─────────────── */

export function buildLate(d: LateReport): ReportDoc {
  const list = d.members.filter((m) => m.monthsCount > 0 || m.levies.length > 0);
  const anyLevy = list.some((m) => m.levies.length);
  const blocks: Block[] = list.length
    ? [
        {
          t: "table",
          head: anyLevy ? ["الاسم", "الأشهر الباقية", "لوحة"] : ["الاسم", "الأشهر الباقية"],
          widths: anyLevy ? [0.46, 0.42, 0.12] : [0.5, 0.5],
          rows: list.map((m) => [
            `${refLabel(m.memberRef)} · ${m.fullName}`,
            ymText(m.lateMonths),
            ...(anyLevy ? [m.levies.length ? "✓" : ""] : []),
          ]),
        },
        ...(anyLevy
          ? [{ t: "note", text: "«لوحة» تعني أن عليه نصيبًا من لوحة لم يُدفع." } as Block]
          : []),
      ]
    : [{ t: "note", text: "لا أحد عليه متأخرات الآن." }];
  return {
    kind: "late",
    title: "المتأخرات",
    subtitle: `سنة ${d.year}`,
    blocks,
    fileBase: `المتأخرات-${d.year}`,
    hasAmounts: false,
  };
}

/* ─────────────── 5 · expenses ─────────────── */

export function buildExpenses(d: ExpensesReport): ReportDoc {
  const blocks: Block[] = [];
  if (!d.items.length) blocks.push({ t: "note", text: "لم يُصرف شيء في هذه الفترة." });
  else {
    blocks.push(
      { t: "heading", text: "حسب النوع" },
      rowsOf(
        d.byCategory.map((c) => [c.label, c.amount]),
        ["المجموع", d.total],
      ),
    );
    const months = [...new Set(d.items.map((e) => e.spentOn.slice(0, 7)))].sort().reverse();
    for (const ym of months) {
      const items = d.items.filter((e) => e.spentOn.startsWith(ym));
      blocks.push(
        { t: "heading", text: `${monthName(Number(ym.slice(5, 7)))} ${ym.slice(0, 4)}` },
        {
          t: "rows",
          rows: items.map((e): AmountRow => ({
            label: e.note || e.label,
            sub: [day(e.spentOn), e.note ? e.label : null, e.campaignTitle]
              .filter(Boolean)
              .join(" · "),
            amount: e.amount,
          })),
        },
      );
    }
  }
  return {
    kind: "expenses",
    title: "المصاريف",
    subtitle: periodLabel(d.period),
    blocks,
    fileBase: `المصاريف-${periodSlug(d.period)}`,
    hasAmounts: true,
  };
}

/* ─────────────── 6 · a campaign or a لوحة (its whole life) ─────────────── */

export function buildCampaign(d: CampaignReport): ReportDoc {
  const since = `من ${day(d.createdAt)} ${d.closedAt ? `إلى ${day(d.closedAt)}` : "إلى اليوم"}`;
  const blocks: Block[] = [];
  if (d.purpose) blocks.push({ t: "note", text: d.purpose });
  if (d.kind === "levy") {
    const shares = d.shares ?? [];
    const due = shares.filter((s) => !s.exempt);
    const paid = due.filter((s) => s.left <= 0);
    const exempt = shares.length - due.length;
    const per = due[0]?.expected ?? 0;
    blocks.push(
      rowsOf(
        [
          ["على كل عضو", per],
          ["جُمع", d.collected],
        ],
        ["بقي على الأعضاء", due.reduce((s, x) => s + Math.max(0, x.left), 0)],
      ),
      {
        t: "note",
        text: `دفع ${membersWord(paid.length)}، ولم يدفع بعد ${due.length - paid.length}${exempt ? `، ومعفى ${exempt}` : ""}.`,
      },
      {
        t: "table",
        head: ["الاسم", "دفع"],
        widths: [0.68, 0.32],
        rows: shares.map((s) => [
          `${refLabel(s.memberRef)} · ${s.fullName}`,
          s.exempt ? "معفى" : s.left <= 0 ? "✓" : "لم يدفع بعد",
        ]),
      },
    );
  } else {
    const money: AmountRow[] = [
      ...(d.targetAmount ? [{ label: "الهدف", amount: d.targetAmount }] : []),
      { label: "جُمع", amount: d.collected },
      ...(d.spent ? [{ label: "صُرف", amount: d.spent, sign: "−" as const }] : []),
      ...(d.transferred
        ? [{ label: "نُقل إلى الصندوق", amount: d.transferred, sign: "−" as const }]
        : []),
    ];
    blocks.push(
      { t: "rows", rows: money, total: { label: "بقي في التبرع", amount: d.balance } },
      { t: "heading", text: `من ساهم (${d.contributions.length})` },
      d.contributions.length
        ? {
            t: "rows",
            rows: d.contributions.map((c) => ({
              label: c.name,
              sub: day(c.paidOn),
              amount: c.amount,
            })),
          }
        : { t: "note", text: "لا مساهمات بعد." },
    );
    if (d.expenses.length)
      blocks.push(
        { t: "heading", text: "ما صُرف منه" },
        {
          t: "rows",
          rows: d.expenses.map((e) => ({
            label: e.note || "مصروف",
            sub: day(e.spentOn),
            amount: e.amount,
          })),
        },
      );
  }
  const what = d.kind === "levy" ? "لوحة" : "تبرع";
  return {
    kind: "campaign",
    title: d.kind === "levy" ? "تقرير لوحة" : "تقرير تبرع",
    subtitle: `${d.title} · ${since}`,
    blocks,
    fileBase: `${what}-${slug(d.title)}`,
    hasAmounts: true,
  };
}

/* ─────────────── 7 · a member's year ─────────────── */

export function buildStatement(d: MemberStatement): ReportDoc {
  const m = d.member;
  const price = d.months.find((x) => x.price)?.price ?? null;
  const late = d.months.filter((x) => x.state === "late").map((x) => x.month);
  const pays = d.payments.filter((p) => p.status === "confirmed" || p.status === "pending");
  const inYear = (yms: string[]) =>
    yms.filter((ym) => ym.startsWith(`${d.year}-`)).map((ym) => Number(ym.slice(5, 7)));
  const what = (p: MemberStatement["payments"][number]) => {
    const ms = inYear(p.months);
    const parts = [
      ...(ms.length ? [`رسوم ${monthsText(ms)}`] : p.months.length ? ["رسوم"] : []),
      ...p.campaigns,
    ];
    return parts.join(" · ") || "دفعة";
  };
  const blocks: Block[] = [
    {
      t: "note",
      text: [
        `رقم ${refLabel(m.memberRef)}`,
        groupLabel(m.groupCode),
        ...(price ? [`الرسوم الشهرية ${amt(price)}`] : []),
      ].join(" · "),
    },
    {
      t: "months",
      paid: Array.from({ length: 12 }, (_, k) => !!d.months.find((x) => x.month === k + 1)?.paid),
    },
    { t: "heading", text: "الدفعات" },
    pays.length
      ? {
          t: "rows",
          rows: pays.map((p) => ({
            label: what(p),
            sub: [
              day(p.paidOn),
              p.recordedBy ? `سجّلها ${p.recordedBy}` : null,
              p.status === "pending" ? "بانتظار التأكيد" : null,
            ]
              .filter(Boolean)
              .join(" · "),
            amount: p.amount,
          })),
        }
      : { t: "note", text: "لا دفعات في هذه السنة." },
  ];
  const owed: AmountRow[] = [
    ...(d.owed.amountOwed > 0
      ? [{ label: late.length ? `رسوم ${monthsText(late)}` : "رسوم", amount: d.owed.amountOwed }]
      : []),
    ...d.levies
      .filter((l) => !l.exempt && l.left > 0)
      .map((l) => ({ label: `لوحة ${l.title}`, amount: l.left })),
  ];
  if (owed.length) blocks.push({ t: "heading", text: "ما عليه" }, { t: "rows", rows: owed });
  if (d.owed.credit > 0)
    blocks.push({ t: "note", text: `له رصيد ${amt(d.owed.credit)} يُحسب من أشهره القادمة.` });
  return {
    kind: "member",
    title: "كشف عضو",
    subtitle: `${m.fullName} · سنة ${d.year}`,
    blocks,
    fileBase: `كشف-${slug(m.fullName)}-${d.year}`,
    hasAmounts: true,
  };
}

/* ─────────────── 8 · handover of a term ─────────────── */

export function buildHandover(d: HandoverReport): ReportDoc {
  const t = d.term;
  const name = t.title || `الدورة ${t.number}`;
  const balance =
    d.computedBalance ?? d.opening + d.income.total - d.spending.total + d.adjustments;
  const blocks: Block[] = [
    {
      t: "rows",
      rows: [
        { label: "رصيد أول الدورة", amount: d.opening },
        { label: "دخل في الدورة", amount: d.income.total, sign: "+" },
        { label: "صُرف في الدورة", amount: d.spending.total, sign: "−" },
        ...(d.adjustments
          ? [
              {
                label: "تصحيحات",
                amount: Math.abs(d.adjustments),
                sign: (d.adjustments < 0 ? "−" : "+") as "−" | "+",
              },
            ]
          : []),
      ],
      total: { label: "الرصيد الذي يُسلَّم", amount: balance },
    },
    { t: "heading", text: "ما دخل" },
    rowsOf(incomeRows(d.income), ["مجموع ما دخل", d.income.total]),
    { t: "heading", text: "ما صُرف" },
    ...spendingBlocks(d.spending),
  ];
  if (d.counted.length) {
    blocks.push(
      { t: "heading", text: "أين المال؟" },
      rowsOf(
        d.counted.map((c) => [c.label, c.amount]),
        d.countedTotal !== null ? ["المجموع المعدود", d.countedTotal] : undefined,
      ),
    );
    if (d.difference)
      blocks.push({
        t: "note",
        text: `الفرق بين المعدود والمحسوب: ${d.difference > 0 ? "زيادة" : "نقص"} ${amt(Math.abs(d.difference))}.`,
      });
  }
  if (d.carryOver.length)
    blocks.push(
      { t: "heading", text: "ما يبقى للجنة الجديدة" },
      ...d.carryOver.map((c): Block => ({ t: "note", text: `• ${c}` })),
    );
  blocks.push({
    t: "sign",
    right: `سلّم: ${d.submittedBy.name ?? "………………"}`,
    left: `استلم: ${d.acceptedBy.name ?? "………………"}`,
  });
  return {
    kind: "handover",
    title: "تقرير التسليم",
    subtitle: `${name} · من ${day(t.startedOn)} ${t.endedOn ? `إلى ${day(t.endedOn)}` : "إلى اليوم"}`,
    blocks,
    fileBase: `التسليم-الدورة-${t.number}`,
    hasAmounts: true,
  };
}

/* ─────────────── 9 · per wallet ─────────────── */

export function buildWallets(d: WalletsReport): ReportDoc {
  const withOut = d.wallets.some((w) => w.out !== undefined);
  const withBal = d.wallets.some((w) => w.balance !== undefined);
  const head = [
    "المحفظة",
    "الدفعات",
    "دخل",
    ...(withOut ? ["خرج"] : []),
    ...(withBal ? ["الرصيد"] : []),
  ];
  const line = (label: string, count: number, inn: number, out?: number, bal?: number) => [
    label,
    fmt(count),
    fmt(inn),
    ...(withOut ? [out ? fmt(out) : ""] : []),
    ...(withBal ? [bal !== undefined ? fmt(bal) : ""] : []),
  ];
  const rows = [
    ...d.wallets.map((w) =>
      line(
        w.accountNumber ? `${w.label} ${w.accountNumber}` : w.label,
        w.count,
        w.in,
        w.out,
        w.balance,
      ),
    ),
    ...(d.cash.count || d.cash.in ? [line("نقدًا", d.cash.count, d.cash.in)] : []),
  ];
  const count = d.wallets.reduce((s, w) => s + w.count, 0) + d.cash.count;
  return {
    kind: "wallets",
    title: "المبالغ حسب المحفظة",
    subtitle: periodLabel(d.period),
    blocks: rows.length
      ? [
          {
            t: "table",
            head,
            num: head.map((_, i) => i > 0),
            rows,
            foot: [
              "المجموع",
              fmt(count),
              fmt(d.totalIn),
              ...(withOut ? [fmt(d.wallets.reduce((s, w) => s + (w.out ?? 0), 0))] : []),
              ...(withBal ? [fmt(d.wallets.reduce((s, w) => s + (w.balance ?? 0), 0))] : []),
            ],
          },
          {
            t: "note",
            text: withBal
              ? "قارن «الرصيد» برصيد كل محفظة في هاتفك. النقد يعدّه من يحمله."
              : "قارن ما دخل بسجل كل محفظة في هاتفك. النقد يعدّه من يحمله.",
          },
        ]
      : [{ t: "note", text: "لم يدخل شيء في هذه الفترة." }],
    fileBase: `المحافظ-${periodSlug(d.period)}`,
    hasAmounts: true,
  };
}

/* ─────────────── 10 · committee work ─────────────── */

export function buildWork(d: CommitteeWorkReport): ReportDoc {
  const people = d.people.filter(
    (p) => p.active || p.payments.count || p.expenses.count || p.cancellations,
  );
  const blocks: Block[] = [
    people.length
      ? {
          t: "table",
          head: ["العضو", "دفعات", "مبلغها", "مصاريف", "ألغى"],
          num: [false, true, true, true, true],
          widths: [0.36, 0.14, 0.22, 0.14, 0.14],
          rows: people.map((p) => [
            p.name,
            p.payments.count ? fmt(p.payments.count) : "",
            p.payments.amount ? fmt(p.payments.amount) : "",
            p.expenses.count ? fmt(p.expenses.count) : "",
            p.cancellations ? fmt(p.cancellations) : "",
          ]),
        }
      : { t: "note", text: "لم يُسجَّل شيء في هذه الفترة." },
  ];
  if (d.cancelled?.length)
    blocks.push(
      { t: "heading", text: "ما أُلغي" },
      {
        t: "rows",
        rows: d.cancelled.map((c) => ({
          label: c.what,
          sub: [c.by ? `ألغاه ${c.by}` : null, day(c.at), c.reason].filter(Boolean).join(" · "),
          amount: c.amount,
        })),
      },
    );
  return {
    kind: "work",
    title: "عمل اللجنة",
    subtitle: periodLabel(d.period),
    blocks,
    fileBase: `عمل-اللجنة-${periodSlug(d.period)}`,
    hasAmounts: true,
  };
}
