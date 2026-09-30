// The 10 committee reports (plan §9, prototype round 3): Lane A's data (report-types.ts) →
// a ReportDoc (doc.ts). Pure and unit tested. Words kept simple; «المتأخرات» without amounts;
// no receipt, no QR, no link.
import type {
  AnnualReport,
  CampaignReport,
  CommitteeWorkReport,
  DonationStats,
  ExpensesReport,
  FeeStats,
  GridReport,
  HandoverReport,
  LateReport,
  LevyStats,
  MemberStatement,
  Period,
  StatsReport,
  SummaryReport,
  WalletsReport,
} from "../data/report-types";
import { formatDay, monthName } from "../dates";
import { formatNumber } from "../format";
import { monthPaid } from "../report-check";
import {
  monthsText,
  percent,
  periodLabel,
  type AmountRow,
  type Block,
  type ReportDoc,
} from "./doc";

/* ─────────────── small helpers ─────────────── */

const fmt = formatNumber;
/**
 * An amount inside an Arabic sentence, kept left to right: its thin-space groups would otherwise
 * be reordered by the right-to-left text around it («000 1» for «1 000»).
 */
const amt = (v: number) => `\u2066${fmt(v)}\u2069`;
const day = (iso: string) => formatDay(iso.slice(0, 10), { year: true });
/** «لوحة العيد» as it is, «ترميم المسجد» → «لوحة ترميم المسجد»: never «لوحة لوحة». */
const levyName = (title: string) => (title.startsWith("لوحة") ? title : `لوحة ${title}`);
/** «A-12» → «أ 12» (group letters as on paper). */
export function refLabel(ref: string): string {
  const [g, n] = ref.split("-");
  const letter = g === "A" ? "أ" : g === "B" ? "ب" : g;
  return n ? `${letter} ${n}` : ref;
}
const groupLabel = (code: string | null) =>
  code === "A" ? "الفئة أ" : code === "B" ? "الفئة ب" : "بلا فئة";
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
const rowsOf = (list: [string, number][], total?: [string, number]): Block => ({
  t: "rows",
  rows: list.map(([label, amount]) => ({ label, amount })),
  total: total && { label: total[0], amount: total[1] },
});
const incomeRows = (i: AnnualReport["income"]): [string, number][] => [
  ["المستحقات الشهرية", i.fees],
  ...(i.levies ? ([["اللوحات", i.levies]] as [string, number][]) : []),
  ...(i.donations ? ([["التبرعات", i.donations]] as [string, number][]) : []),
];
/** The income rows, then (m44) the part typed in from the paper sheets, when there is one. */
const incomeBlocks = (i: AnnualReport["income"]): Block[] => [
  rowsOf(incomeRows(i), ["مجموع المداخيل", i.total]),
  ...(i.paper
    ? [{ t: "note", text: `منها ${amt(i.paper)} من الأوراق (أُدخلت من الدفاتر).` } as Block]
    : []),
];
const spendingBlocks = (s: AnnualReport["spending"]): Block[] => [
  s.byActivity.length
    ? rowsOf(
        s.byActivity.map((c) => [c.name, c.amount]),
        ["مجموع المصاريف", s.total],
      )
    : { t: "note", text: "لا مصاريف." },
  ...(s.fromCampaigns
    ? [{ t: "note", text: `منها ${amt(s.fromCampaigns)} من أموال التبرعات واللوحات.` } as Block]
    : []),
];

/**
 * The closing of a period. The total adds up (opening + in − out) and holds the money of the
 * تبرعات and لوحات not spent yet; home's «في الصندوق» is the fund alone. So when campaigns hold
 * money the total is split, and «منها في الصندوق» is the same number as home (accuracy, §12).
 */
function closingBlocks(closing: number, held: number, label: string, total: string): Block[] {
  if (!held) return [{ t: "rows", rows: [], total: { label, amount: closing } }];
  return [
    { t: "rows", rows: [], total: { label: total, amount: closing }, keepNext: true },
    rowsOf([
      ["منها في الصندوق", closing - held],
      ["منها لدى التبرعات واللوحات", held],
    ]),
  ];
}

/**
 * The end of a period in words: «آخر السنة» once it is over, «حتى 30 سبتمبر 2026» while it runs
 * (the report is a snapshot of today, never money still to come).
 */
function endWord(p: AnnualReport["period"], generatedAt: string): string {
  const edge = p.month ? "الشهر" : "السنة";
  const last = p.month
    ? `${p.year}-${String(p.month).padStart(2, "0")}-${String(new Date(Date.UTC(p.year, p.month, 0)).getUTCDate()).padStart(2, "0")}`
    : `${p.year}-12-31`;
  const today = generatedAt.slice(0, 10);
  return today < last ? `حتى ${day(today)}` : `آخر ${edge}`;
}

/* ─────────────── 1 · the full annual (or monthly) report ─────────────── */

export function buildAnnual(d: AnnualReport): ReportDoc {
  const yearly = !d.period.month;
  const edge = yearly ? "السنة" : "الشهر";
  const blocks: Block[] = [
    rowsOf([[`رصيد أول ${edge}`, d.opening]]),
    { t: "heading", text: "المداخيل" },
    ...incomeBlocks(d.income),
    { t: "heading", text: "المصاريف" },
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
  blocks.push(
    ...closingBlocks(
      d.closing,
      d.campaignsHeld,
      `الرصيد ${endWord(d.period, d.generatedAt)}`,
      `المجموع ${endWord(d.period, d.generatedAt)}`,
    ),
  );
  if (yearly && d.months.length) {
    // owner: a month's fees count in the month they pay for (مستحقات يناير in January, whatever
    // day they were recorded); levies and donations by their date; expenses by their date
    const due = d.incomeDue;
    const notes: string[] = [];
    if (due.feesForOtherMonths)
      notes.push(`لا يظهر هنا ${amt(due.feesForOtherMonths)} دُفعت هذه السنة لمستحقات سنة أخرى.`);
    if (due.feesPaidOutside)
      notes.push(`ويظهر هنا ${amt(due.feesPaidOutside)} لمستحقات هذه السنة دُفعت في سنة أخرى.`);
    blocks.push(
      { t: "heading", text: "المداخيل حسب الشهر المستحق", keep: true },
      { t: "bars", values: monthlyValues(d.months, "dueIncome") },
      {
        t: "table",
        head: ["الشهر", "المداخيل", "المصاريف"],
        num: [false, true, true],
        widths: [0.4, 0.3, 0.3],
        rows: d.months.map((m) => [
          monthName(m.month),
          m.dueIncome ? fmt(m.dueIncome) : "",
          m.spending ? fmt(m.spending) : "",
        ]),
        foot: ["المجموع", fmt(due.total), fmt(d.spending.total)],
      },
      ...(notes.length ? [{ t: "note", text: notes.join(" ") } as Block] : []),
    );
  }
  return {
    kind: "annual",
    title: yearly ? "التقرير السنوي الكامل" : "التقرير الشهري الكامل",
    subtitle: periodLabel(d.period),
    message: "تقرير الصندوق: المداخيل والمصاريف والرصيد. للسؤال تواصل مع اللجنة.",
    blocks,
    fileBase: `${yearly ? "التقرير-السنوي" : "التقرير-الشهري"}-${periodSlug(d.period)}`,
    hasAmounts: true,
  };
}

function monthlyValues(
  ms: AnnualReport["months"],
  k: "income" | "dueIncome" | "spending",
): number[] {
  const v = Array<number>(12).fill(0);
  for (const m of ms) if (m.month >= 1 && m.month <= 12) v[m.month - 1] += m[k];
  return v;
}

/* ─────────────── 2 · summary ─────────────── */

export function buildSummary(d: SummaryReport): ReportDoc {
  const yearly = !d.period.month;
  const edge = yearly ? "السنة" : "الشهر";
  const paid = yearly
    ? `دفع مستحقات السنة كاملة ${membersWord(d.membersPaidPeriod)} من ${d.membersActive}.`
    : `دفع مستحقات شهر ${monthName(d.period.month!)} ${membersWord(d.membersPaidPeriod)} من ${d.membersActive}.`;
  return {
    kind: "summary",
    title: "الملخص",
    subtitle: periodLabel(d.period),
    message: "ملخص الصندوق: المداخيل والمصاريف والرصيد. للسؤال تواصل مع اللجنة.",
    blocks: [
      {
        t: "rows",
        rows: [
          { label: `في الصندوق أول ${edge}`, amount: d.opening },
          { label: "المداخيل", amount: d.income, sign: "+" },
          { label: "المصاريف", amount: d.spending, sign: "−" },
        ],
        ...(d.campaignsHeld
          ? {}
          : {
              total: { label: `في الصندوق ${endWord(d.period, d.generatedAt)}`, amount: d.closing },
            }),
      },
      ...(d.campaignsHeld
        ? closingBlocks(
            d.closing,
            d.campaignsHeld,
            "",
            `المجموع ${endWord(d.period, d.generatedAt)}`,
          )
        : []),
      ...(d.incomePaper
        ? [
            {
              t: "note" as const,
              text: `المداخيل: منها ${amt(d.incomePaper)} من الأوراق (أُدخلت من الدفاتر).`,
            },
          ]
        : []),
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
        text: `${groupLabel(g)} · ${membersWord(list.length)}${fee ? ` · المستحقات الشهرية: ${amt(fee)} أوقية` : ""}`,
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
    message: "الأشهر المدفوعة لكل عضو. إن رأيت خطأ في اسمك تواصل مع اللجنة.",
    blocks,
    fileBase: `جدول-الأشهر-${d.year}`,
    hasAmounts: Object.values(d.groupPrices).some(Boolean),
  };
}

/* ─────────────── 4 · «المتأخرات» (no amounts at all) ─────────────── */

/** «عليه متأخرات من سنة 2025: فلان، فلان.» for months owed from an earlier year. */
function earlierYears(rows: LateReport["members"], year: number): Block[] {
  const byYear = new Map<string, string[]>();
  for (const m of rows)
    for (const y of new Set(m.lateMonths.map((ym) => ym.slice(0, 4)).filter((y) => +y < year)))
      byYear.set(y, [...(byYear.get(y) ?? []), m.fullName]);
  return [...byYear.keys()]
    .sort()
    .map((y) => ({ t: "note", text: `عليهم متأخرات من سنة ${y}: ${byYear.get(y)!.join("، ")}.` }));
}

/**
 * «المتأخرات» (owner, paper grid): one page per الفئة («المتأخرات · الفئة أ» in the band), the
 * NAMES of who owes (no number, no count, no amount), 12 month columns: ✓ paid, empty not paid,
 * «—» a month he does not owe (exempt, before joining, away) so it never looks unpaid. A لوحة
 * share still owed: one line under the grid. The text: the names per الفئة, nothing else.
 */
export function buildLate(d: LateReport): ReportDoc {
  const list = d.members.filter((m) => m.lateMonths.length > 0 || m.levies.length > 0);
  const groups = [...new Set(list.map((m) => m.groupCode ?? ""))].sort();
  const blocks: Block[] = [];
  for (const g of groups) {
    const rows = list.filter((m) => (m.groupCode ?? "") === g);
    const cells = rows.map((m) => ({
      name: m.fullName,
      paid: Array.from({ length: 12 }, (_, k) => monthPaid(m.months[k])),
      none: Array.from({ length: 12 }, (_, k) => m.months[k] === "not_owed"),
    }));
    const anyNone = cells.some((c) => c.none.some(Boolean));
    const levyTitles = [...new Set(rows.flatMap((m) => m.levies.map((l) => l.title)))];
    blocks.push(
      { t: "heading", text: g ? groupLabel(g) : "بلا فئة", section: true },
      // compact rows: a الفئة of ~28 names fits one phone page (owner: one page per الفئة)
      { t: "grid", namesOnly: true, dense: true, rows: cells },
      {
        t: "note",
        text: `1 = يناير … 12 = ديسمبر · ✓ مدفوع · فارغ: لم يُدفع${anyNone ? " · —: غير مستحق عليه" : ""}`,
      },
      // months of an earlier year are not in this year's grid: name them so no row looks paid up
      ...earlierYears(rows, d.year),
      // a لوحة share still owed: the names, or one short line when everyone listed owes it
      ...levyTitles.map((title): Block => {
        const who = rows.filter((m) => m.levies.some((l) => l.title === title));
        return {
          t: "note",
          text: `لم يدفع نصيب ${title}: ${
            who.length === rows.length && rows.length > 1
              ? `كل من في هذه القائمة (${membersWord(who.length)})`
              : who.map((m) => m.fullName).join("، ")
          }.`,
        };
      }),
    );
  }
  if (!blocks.length) blocks.push({ t: "note", text: "لا أحد عليه متأخرات الآن." });
  return {
    kind: "late",
    title: "المتأخرات",
    subtitle: [`سنة ${d.year}`, d.termLabel].filter(Boolean).join(" · "),
    message: "هذه الأسماء عليها متأخرات لم تُدفع بعد. للدفع أو السؤال تواصل مع اللجنة.",
    blocks,
    fileBase: `المتأخرات-${d.year}`,
    hasAmounts: false,
  };
}

/* ─────────────── 5 · expenses ─────────────── */

export function buildExpenses(d: ExpensesReport): ReportDoc {
  const blocks: Block[] = [];
  if (!d.items.length) blocks.push({ t: "note", text: "لا مصاريف في هذه الفترة." });
  else {
    blocks.push(
      { t: "heading", text: "حسب النشاط" },
      rowsOf(
        d.byActivity.map((c) => [c.name, c.amount]),
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
    message: "مصاريف الصندوق حسب النشاط وحسب الشهر. للسؤال تواصل مع اللجنة.",
    blocks,
    fileBase: `المصاريف-${periodSlug(d.period)}`,
    hasAmounts: true,
  };
}

/* ─────────────── 6 · a campaign or a لوحة (its whole life) ─────────────── */

/**
 * `stats`: the campaign's «الإحصاءات» (counts and percentages, plan §10), drawn first, numbers
 * first; the levy's own «دفع … ولم يدفع بعد …» line is then left out (the figures say it).
 */
export function buildCampaign(d: CampaignReport, stats?: LevyStats | DonationStats): ReportDoc {
  const since = `من ${day(d.createdAt)} ${d.closedAt ? `إلى ${day(d.closedAt)}` : "إلى اليوم"}`;
  const blocks: Block[] = [];
  if (d.purpose) blocks.push({ t: "note", text: d.purpose });
  if (stats)
    blocks.push(...("shares" in stats ? levyStatBlocks(stats) : donationStatBlocks(stats)));
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
      ...(stats
        ? []
        : [
            {
              t: "note",
              text: `دفع ${membersWord(paid.length)}، ولم يدفع بعد ${due.length - paid.length}${exempt ? `، ومعفى ${exempt}` : ""}.`,
            } as Block,
          ]),
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
      ...(d.spent ? [{ label: "المصاريف", amount: d.spent, sign: "−" as const }] : []),
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
        { t: "heading", text: "المصاريف منه" },
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
    message:
      d.kind === "levy"
        ? "من دفع نصيبه ومن لم يدفع بعد. للدفع أو السؤال تواصل مع اللجنة."
        : "ما جُمع ومن ساهم. شكرًا لكل من ساهم.",
    blocks,
    fileBase: `${what}-${slug(d.title)}`,
    hasAmounts: true,
  };
}

/* ─────────────── 11 · «الإحصاءات»: counts and percentages, never names ─────────────── */

/** «يوم واحد» «يومين» «5 أيام» «12 يومًا». */
export function daysWord(n: number): string {
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومين";
  const r = n % 100;
  if (r >= 3 && r <= 10) return `${n} أيام`;
  return r >= 11 ? `${n} يومًا` : `${n} يوم`;
}

/** «20 من 40»: part of a whole, as a small line under a figure. */
const ofText = (part: number, whole: number) => `${fmt(part)} من ${fmt(whole)}`;

function feeStatBlocks(f: FeeStats, previous: FeeStats | null): Block[] {
  const o = f.overall;
  const upTo = f.refMonth >= 12 ? "السنة كاملة" : `حتى ${monthName(f.refMonth)}`;
  const owing = o.owe1 + o.owe2to3 + o.owe4plus;
  const blocks: Block[] = [
    { t: "heading", text: `المستحقات الشهرية ${f.year}` },
    {
      t: "big",
      value: percent(o.paidUp, o.active),
      lead: `دفعوا ${upTo}: ${fmt(o.paidUp)} من ${membersWord(o.active)}.`,
      bar: { part: o.paidUp, whole: o.active },
    },
  ];
  if (f.groups.length > 1)
    blocks.push({
      t: "tiles",
      items: f.groups.map((g) => ({
        label: groupLabel(g.groupCode),
        value: percent(g.paidUp, g.active),
        sub: ofText(g.paidUp, g.active),
        bar: { part: g.paidUp, whole: g.active },
      })),
    });
  blocks.push(
    { t: "heading", text: "كم عضوًا دفع كل شهر", keep: true },
    {
      t: "counts",
      months: f.months.map((m) => ({
        paid: m.paid,
        of: m.active,
        started: m.month <= f.refMonth,
      })),
    },
    { t: "heading", text: "من عليه متأخرات", keep: true },
    owing
      ? {
          t: "tiles",
          items: [
            { label: "شهر واحد", value: fmt(o.owe1) },
            { label: "شهران أو 3", value: fmt(o.owe2to3) },
            { label: "4 أشهر أو أكثر", value: fmt(o.owe4plus) },
          ],
        }
      : { t: "note", text: "لا أحد عليه متأخرات." },
  );
  // last year as it stood on the same day (asOf), or the whole year before a past year; nothing
  // when that day is before the first recorded payment (Lane A m34, lead: no full-year fallback)
  if (previous && !previous.beforeRecords) {
    const when = previous.asOf ? "في مثل هذا الوقت" : "كاملة";
    blocks.push({
      t: "note",
      text: `السنة الماضية ${when}: ${percent(previous.overall.paidUp, previous.overall.active)} دفعوا.`,
    });
  }
  return blocks;
}

function levyStatBlocks(l: LevyStats, title?: string): Block[] {
  const due = l.shares - l.exempt;
  const lead =
    l.status === "open" ? `دفعوا نصيبهم. فُتحت قبل ${daysWord(l.daysOpen)}.` : "دفعوا نصيبهم.";
  return [
    ...(title ? [{ t: "heading", text: title, keep: true } as Block] : []),
    { t: "big", value: percent(l.paid, due), lead, bar: { part: l.paid, whole: due } },
    {
      t: "tiles",
      items: [
        { label: "دفعوا", value: fmt(l.paid) },
        { label: "لم يدفعوا بعد", value: fmt(l.unpaid) },
        {
          label: l.exempt === 1 ? "معفى" : l.exempt === 2 ? "معفيّان" : "معفون",
          value: fmt(l.exempt),
        },
      ],
    },
    // in the campaign report the amounts follow in their own lines
    ...(title
      ? [{ t: "note", text: `جُمع ${amt(l.collected)} من ${amt(l.expected)} أوقية.` } as Block]
      : []),
    ...(l.groups.length > 1
      ? [
          {
            t: "tiles",
            items: l.groups.map((g) => ({
              label: groupLabel(g.groupCode),
              value: percent(g.paid, g.shares - g.exempt),
              sub: ofText(g.paid, g.shares - g.exempt),
              bar: { part: g.paid, whole: g.shares - g.exempt },
            })),
          } as Block,
          {
            t: "note",
            text: l.groups
              .map(
                (g) =>
                  `${groupLabel(g.groupCode)}: جُمع ${amt(g.collected)} من ${amt(g.expected)} أوقية.`,
              )
              .join(" "),
          } as Block,
        ]
      : []),
  ];
}

function donationStatBlocks(d: DonationStats, title?: string): Block[] {
  const target = d.target && d.target > 0 ? d.target : null;
  return [
    ...(title ? [{ t: "heading", text: title, keep: true } as Block] : []),
    {
      t: "big",
      value: fmt(d.collected),
      lead: target
        ? `أوقية جُمعت من هدف ${amt(target)} (${percent(d.collected, target)}).`
        : "أوقية جُمعت.",
      ...(target ? { bar: { part: d.collected, whole: target } } : {}),
    },
    {
      t: "tiles",
      items: [
        { label: "تبرّعوا", value: fmt(d.givers) },
        { label: "من الأعضاء", value: fmt(d.memberGivers) },
        { label: "من خارج الرابطة", value: fmt(d.outsideGivers) },
      ],
    },
    {
      t: "note",
      text: `تبرّع ${percent(d.memberGivers, d.activeMembers)} من أعضاء الرابطة.`,
    },
  ];
}

/** The year's «الإحصاءات»: fees (with last year), then every لوحة and تبرع. */
export function buildStats(d: StatsReport): ReportDoc {
  const f = d.fees;
  return {
    kind: "stats",
    title: "الإحصاءات",
    message: "أرقام بلا أسماء: من دفع المستحقات، واللوحات والتبرعات. للسؤال تواصل مع اللجنة.",
    subtitle: f.refMonth >= 12 ? `سنة ${f.year}` : `سنة ${f.year} · حتى ${monthName(f.refMonth)}`,
    blocks: [
      ...feeStatBlocks(f, d.previous),
      ...d.levies.flatMap((l) => levyStatBlocks(l, levyName(l.title))),
      ...d.donations.flatMap((x) => donationStatBlocks(x, `تبرع: ${x.title}`)),
    ],
    fileBase: `الإحصاءات-${d.period.year}`,
    hasAmounts: d.levies.length + d.donations.length > 0,
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
      ...(ms.length ? [`مستحقات ${monthsText(ms)}`] : p.months.length ? ["مستحقات"] : []),
      ...p.campaigns,
    ];
    return parts.join(" · ") || "دفعة";
  };
  const blocks: Block[] = [
    {
      t: "note",
      // no paper number in what is shared (the name says who): only the الفئة and its fee
      text: [
        groupLabel(m.groupCode),
        ...(price ? [`المستحقات الشهرية: ${amt(price)} أوقية`] : []),
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
              // e.g. «يختلف عن الصورة: الباقي نقدًا», the reason given when it was recorded
              p.note?.trim() || null,
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
      ? [
          {
            label: late.length ? `مستحقات ${monthsText(late)}` : "مستحقات",
            amount: d.owed.amountOwed,
          },
        ]
      : []),
    ...d.levies
      .filter((l) => !l.exempt && l.left > 0)
      .map((l) => ({ label: levyName(l.title), amount: l.left })),
  ];
  if (owed.length) blocks.push({ t: "heading", text: "ما عليه" }, { t: "rows", rows: owed });
  if (d.owed.credit > 0)
    blocks.push({ t: "note", text: `له رصيد ${amt(d.owed.credit)} يُحسب من أشهره القادمة.` });
  return {
    kind: "member",
    title: "كشف عضو",
    subtitle: `${m.fullName} · سنة ${d.year}`,
    message: "أشهره المدفوعة ودفعاته في هذه السنة. للسؤال تواصل مع اللجنة.",
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
        { label: "المداخيل في الدورة", amount: d.income.total, sign: "+" },
        { label: "المصاريف في الدورة", amount: d.spending.total, sign: "−" },
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
    { t: "heading", text: "المداخيل" },
    ...incomeBlocks(d.income),
    { t: "heading", text: "المصاريف" },
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
    message: "للجنة: ما تتسلّمه اللجنة الجديدة.",
    subtitle: `${name} · من ${day(t.startedOn)} ${t.endedOn ? `إلى ${day(t.endedOn)}` : "إلى اليوم"}`,
    blocks,
    fileBase: `التسليم-الدورة-${t.number}`,
    hasAmounts: true,
  };
}

/* ─────────────── 9 · per wallet ─────────────── */

/**
 * Each wallet account and the cash (m43): what came in and went out in the period (داخل / خارج),
 * money moved between a wallet and the cash («تحويل», never income or spending) and «الرصيد», what
 * each holds at the period's end (wallets start at 0 unless «المسؤول» set an opening). The paper
 * sheets and expenses that name no wallet have their own rows; their money is in the cash.
 */
export function buildWallets(d: WalletsReport): ReportDoc {
  const cash = d.cash;
  const all = [...d.wallets, cash];
  const withOut = all.some((w) => w.out) || !!d.unspecifiedOut;
  const net = (w: { transferIn: number; transferOut: number }) => w.transferIn - w.transferOut;
  const withMoves = all.some((w) => w.transferIn || w.transferOut);
  const head = [
    "المحفظة",
    "الدفعات",
    "داخل",
    ...(withOut ? ["خارج"] : []),
    ...(withMoves ? ["تحويل"] : []),
    "الرصيد",
  ];
  const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? fmt(n) : "");
  const line = (
    label: string,
    count: string,
    inn: string,
    out?: number,
    move?: number,
    bal?: number,
  ) => [
    label,
    count,
    inn,
    ...(withOut ? [out ? fmt(out) : ""] : []),
    ...(withMoves ? [move ? signed(move) : ""] : []),
    bal !== undefined ? fmt(bal) : "",
  ];
  const rows = [
    ...d.wallets.map((w) =>
      line(
        w.accountNumber ? `${w.label} ${w.accountNumber}` : w.label,
        fmt(w.count),
        fmt(w.in),
        w.out,
        net(w),
        w.balance,
      ),
    ),
    line("نقدًا", fmt(cash.count), fmt(cash.in), cash.out, net(cash), cash.balance),
    ...(d.paperIn ? [line("بلا محفظة (الأوراق)", "", fmt(d.paperIn))] : []),
    ...(d.unspecifiedOut ? [line("مصاريف بلا محفظة", "", "", d.unspecifiedOut)] : []),
  ];
  const count = all.reduce((s, w) => s + w.count, 0);
  const outTotal = all.reduce((s, w) => s + (w.out ?? 0), 0) + (d.unspecifiedOut ?? 0);
  const held = all.reduce((s, w) => s + w.balance, 0);
  const openings = all.filter((w) => w.opening);
  const widths = [0.28, 0.11, 0.15, ...(withOut ? [0.15] : []), ...(withMoves ? [0.15] : []), 0.16];
  const loose = [d.paperIn ? "الأوراق" : "", d.unspecifiedOut ? "المصاريف بلا محفظة" : ""]
    .filter(Boolean)
    .join(" و");
  return {
    kind: "wallets",
    title: "المبالغ حسب المحفظة",
    subtitle: periodLabel(d.period),
    message: "للجنة: الحركة والرصيد في كل محفظة، لمطابقتها.",
    blocks: [
      { t: "heading", text: "الحركة في الفترة والرصيد" },
      {
        t: "table",
        head,
        num: head.map((_, i) => i > 0),
        widths: widths.map((w) => w / widths.reduce((x, y) => x + y, 0)),
        rows,
        foot: [
          "المجموع",
          fmt(count),
          fmt(d.totalIn),
          ...(withOut ? [fmt(outTotal)] : []),
          ...(withMoves ? [""] : []),
          fmt(held),
        ],
      },
      {
        t: "note",
        text: "«الرصيد»: ما في المحفظة آخر الفترة، قارنه بما في هاتفك.",
      },
      ...(withMoves
        ? [
            {
              t: "note" as const,
              text: "«تحويل»: نقل بين محفظة والنقد، ليس من المداخيل ولا المصاريف.",
            },
          ]
        : []),
      ...(loose ? [{ t: "note" as const, text: `${loose} داخلة في رصيد النقد.` }] : []),
      ...(openings.length
        ? [
            {
              t: "note" as const,
              text: `رصيد افتتاحي: ${openings
                .map(
                  (w) =>
                    `${"label" in w ? w.label : "نقدًا"} ${fmt(w.opening!.amount)} من ${day(w.opening!.on)}`,
                )
                .join("، ")}.`,
            },
          ]
        : []),
      {
        t: "note",
        text: "مجموع الأرصدة: ما في الصندوق وما لدى التبرعات واللوحات.",
      },
    ],
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
    message: "للجنة: ما سجّله كل عضو في اللجنة وما ألغاه.",
    blocks,
    fileBase: `عمل-اللجنة-${periodSlug(d.period)}`,
    hasAmounts: true,
  };
}
