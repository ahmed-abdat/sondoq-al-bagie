// The committee's reports (plan §9, prototype round 3) as one page model: a report is a title and
// a list of blocks; the same blocks become WhatsApp images, an A4 PDF and plain text. Pure: the
// builders (build.ts) make a ReportDoc from the data, this file splits it into pages (unit
// tested), draw.ts paints a page. Money is integers in old ouguiya (MRO), like everywhere.
import { formatDay, monthName } from "../dates";
import { formatNumber } from "../format";

export type ReportKind =
  | "annual"
  | "summary"
  | "grid"
  | "late"
  | "expenses"
  | "campaign"
  | "member"
  | "handover"
  | "wallets"
  | "work"
  | "stats";

/** A line with an amount: «المستحقات الشهرية ····· 120 000». */
export type AmountRow = { label: string; sub?: string; amount: number; sign?: "+" | "−" };

export type Block =
  /**
   * a small heading inside the page («المداخيل»). `keep`: its section (up to the next heading)
   * starts on a new page rather than split, when it fits on one page.
   */
  | { t: "heading"; text: string; keep?: boolean }
  /** label / amount lines, with an optional bold total under a rule */
  | { t: "rows"; rows: AmountRow[]; total?: { label: string; amount: number } }
  /** one short paragraph */
  | { t: "note"; text: string }
  /**
   * A bordered table. `num` marks the columns holding amounts or counts (left, LTR). The first
   * column is the wide one (a name). `foot` is a bold last row.
   */
  | {
      t: "table";
      head: string[];
      rows: string[][];
      num?: boolean[];
      foot?: string[];
      /** column widths as parts of the page width (default: the first column takes the rest) */
      widths?: number[];
    }
  /** the paper grid: names and 12 months, a plain ✓ in each paid month (owner rules) */
  | { t: "grid"; rows: { name: string; paid: boolean[] }[] }
  /** one member's 12 months as two rows of six (statement) */
  | { t: "months"; paid: boolean[] }
  /** a simple bar chart of 12 monthly amounts */
  | { t: "bars"; values: number[] }
  /** two signature lines (handover) */
  | { t: "sign"; left: string; right: string }
  /** «الإحصاءات», numbers first: one big figure («62٪»), a line under it, an optional part bar */
  | { t: "big"; value: string; lead: string; bar?: Part }
  /** two or three figures side by side (groups, owing buckets), each with an optional bar */
  | { t: "tiles"; items: { label: string; value: string; sub?: string; bar?: Part }[] }
  /**
   * how many paid each month: 12 columns (January on the right), the count above each; a month
   * not `started` shows only what is already paid in it
   */
  | { t: "counts"; months: { paid: number; of: number; started: boolean }[] };

/** A part of a whole, drawn as a bar: green = done (paid), soft grey = not yet. */
export type Part = { part: number; whole: number };

export type ReportDoc = {
  kind: ReportKind;
  /** «التقرير السنوي الكامل» */
  title: string;
  /** «سنة 2026», «الفئة أ · سنة 2026», «اختبار الدفع · سنة 2026» */
  subtitle: string;
  blocks: Block[];
  /** file names: «التقرير-السنوي-2026» → .pdf / -1.png */
  fileBase: string;
  /** false for the reports without any amount (months grid, «المتأخرات»): no units note */
  hasAmounts: boolean;
};

/** Who prepared it and when, printed at the foot of every page. */
export type DocMeta = { generatedAt: string; preparedBy: string };

export const UNITS_NOTE = "المبالغ بالأوقية القديمة";

/* ─────────────── layout (px at 1080 wide) ─────────────── */

export interface PageSize {
  w: number;
  h: number;
}
export const PHONE: PageSize = { w: 1080, h: 1350 };
/** A4 minus 10 mm on each side, at 1080 px wide (the PDF). */
export const A4: PageSize = { w: 1080, h: 1575 };

export const LAYOUT = {
  pad: 48,
  band: 168,
  gap: 28,
  foot: 96,
  heading: 70,
  row: 60,
  rowSub: 84,
  total: 72,
  noteLine: 40,
  notePad: 20,
  tableHead: 52,
  tableRow: 56,
  bars: 280,
  months: 212,
  sign: 140,
  big: 170,
  tiles: 116,
  tileSub: 34,
  tileBar: 34,
  counts: 300,
  partBar: 40,
  /** space after each block */
  after: 16,
} as const;

/** Grid rows: roomy like the report today (owner r31): 52 px in the PDF, 44 on images. */
export const gridRow = (size: PageSize) => (size.h === A4.h ? 52 : 44);

/** About how many characters of 26 px Arabic fit on one line of the page. */
const NOTE_CHARS = 64;
export const noteLines = (text: string) => Math.max(1, Math.ceil(text.length / NOTE_CHARS));

/** The height of a block (a split block measures only its own rows). */
export function blockHeight(b: Block, size: PageSize): number {
  const L = LAYOUT;
  switch (b.t) {
    case "heading":
      return L.heading;
    case "rows":
      return b.rows.reduce((s, r) => s + (r.sub ? L.rowSub : L.row), 0) + (b.total ? L.total : 0);
    case "note":
      return noteLines(b.text) * L.noteLine + L.notePad;
    case "table":
      return L.tableHead + (b.rows.length + (b.foot ? 1 : 0)) * L.tableRow;
    case "grid":
      return L.tableHead + b.rows.length * gridRow(size);
    case "months":
      return L.months;
    case "bars":
      return L.bars;
    case "sign":
      return L.sign;
    case "big":
      return L.big + (b.bar ? L.partBar : 0);
    case "tiles":
      return (
        L.tiles +
        (b.items.some((i) => i.sub) ? L.tileSub : 0) +
        (b.items.some((i) => i.bar) ? L.tileBar : 0)
      );
    case "counts":
      return L.counts;
  }
}

/** Room for blocks on one page, between the band and the footer. */
export const pageRoom = (size: PageSize) =>
  size.h - LAYOUT.band - LAYOUT.gap - LAYOUT.foot - LAYOUT.after;

/**
 * Split a block so its first part fits in `room` (rows, tables and grids split between rows and
 * repeat their header; the rest never split). Returns null if not even one row fits.
 */
function splitBlock(b: Block, room: number, size: PageSize): [Block, Block] | null {
  const L = LAYOUT;
  if (b.t === "rows") {
    let h = 0;
    let n = 0;
    for (const r of b.rows) {
      const rh = r.sub ? L.rowSub : L.row;
      if (h + rh > room) break;
      h += rh;
      n++;
    }
    if (n === 0 || n >= b.rows.length) return null;
    return [
      { t: "rows", rows: b.rows.slice(0, n) },
      { ...b, rows: b.rows.slice(n) },
    ];
  }
  if (b.t === "table" || b.t === "grid") {
    const rowH = b.t === "table" ? L.tableRow : gridRow(size);
    const n = Math.floor((room - L.tableHead) / rowH);
    if (n < 1 || n >= b.rows.length) return null;
    if (b.t === "table")
      return [
        { t: "table", head: b.head, num: b.num, widths: b.widths, rows: b.rows.slice(0, n) },
        { ...b, rows: b.rows.slice(n) },
      ];
    return [
      { t: "grid", rows: b.rows.slice(0, n) },
      { t: "grid", rows: b.rows.slice(n) },
    ];
  }
  return null;
}

/**
 * Blocks → pages. Greedy: blocks follow each other; a block that does not fit is split between
 * rows when it can, else moves to the next page; a heading never ends a page alone. Every page
 * gets at least one block (a block taller than a page is split, or drawn clipped as a last resort).
 */
export function paginate(blocks: Block[], size: PageSize): Block[][] {
  const room = pageRoom(size);
  const pages: Block[][] = [];
  let page: Block[] = [];
  let used = 0;
  const queue = [...blocks];
  const flush = () => {
    // never leave a heading alone at the bottom: carry it to the next page
    const carry: Block[] = [];
    while (page.length > 1 && page[page.length - 1].t === "heading") carry.unshift(page.pop()!);
    if (page.length) pages.push(page);
    page = carry;
    used = carry.reduce((s, b) => s + blockHeight(b, size) + LAYOUT.after, 0);
  };
  while (queue.length) {
    const b = queue.shift()!;
    const h = blockHeight(b, size);
    if (b.t === "heading" && b.keep && page.length) {
      // the whole section on the next page when it does not fit here but fits on a page
      const end = queue.findIndex((x) => x.t === "heading");
      const section = [b, ...(end < 0 ? queue : queue.slice(0, end))];
      const need = section.reduce((s, x) => s + blockHeight(x, size) + LAYOUT.after, 0);
      if (used + need > room && need <= room) {
        flush();
        queue.unshift(b);
        continue;
      }
    }
    if (used + h <= room) {
      page.push(b);
      used += h + LAYOUT.after;
      continue;
    }
    const parts = splitBlock(b, room - used, size);
    if (parts) {
      page.push(parts[0]);
      queue.unshift(parts[1]);
      flush();
      continue;
    }
    if (page.length) {
      flush();
      queue.unshift(b);
      continue;
    }
    // alone on an empty page and still too tall: split at the full room, else draw it as is
    const whole = splitBlock(b, room, size);
    if (whole) {
      page.push(whole[0]);
      queue.unshift(whole[1]);
    } else page.push(b);
    flush();
  }
  if (page.length) pages.push(page);
  return pages.length ? pages : [[{ t: "note", text: "لا شيء في هذه الفترة." }]];
}

/* ─────────────── words ─────────────── */

/**
 * A share as a whole percent, for people: never «100٪» while someone is missing and never «0٪»
 * once someone has paid (99.6 → 99, 0.4 → 1).
 */
export function percent(part: number, whole: number): string {
  if (whole <= 0) return "—";
  const raw = (100 * part) / whole;
  const v = part >= whole ? 100 : part <= 0 ? 0 : Math.min(99, Math.max(1, Math.round(raw)));
  return `${v}٪`;
}

/** «سنة 2026» or «سبتمبر 2026». */
export function periodLabel(p: { year: number; month?: number | null }): string {
  return p.month ? `${monthName(p.month)} ${p.year}` : `سنة ${p.year}`;
}

/** Months 1…12 as words: «يناير إلى سبتمبر», «مارس ويونيو», «يناير، مارس وأبريل». */
export function monthsText(months: number[]): string {
  const ms = [...new Set(months)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  if (!ms.length) return "";
  const runs: [number, number][] = [];
  for (const m of ms) {
    const last = runs[runs.length - 1];
    if (last && m === last[1] + 1) last[1] = m;
    else runs.push([m, m]);
  }
  const parts = runs.map(([a, b]) =>
    a === b
      ? monthName(a)
      : b === a + 1
        ? `${monthName(a)} و${monthName(b)}`
        : `${monthName(a)} إلى ${monthName(b)}`,
  );
  return parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join("، ")} و${parts[parts.length - 1]}`;
}

/** The footer's «أُعدّ في 30 سبتمبر 2026 · سيدي محمد». */
export function preparedLine(meta: DocMeta): string {
  const on = formatDay(meta.generatedAt.slice(0, 10), { year: true });
  return meta.preparedBy ? `أُعدّ في ${on} · ${meta.preparedBy}` : `أُعدّ في ${on}`;
}

/* ─────────────── plain text (WhatsApp) ─────────────── */

const amount = (r: AmountRow) => `${r.sign ?? ""}${formatNumber(r.amount)}`;

/** The same report as plain text for WhatsApp: no link, no receipt, amounts in MRO. */
export function docText(doc: ReportDoc, meta: DocMeta): string {
  const out: string[] = [`*${doc.title}*`, doc.subtitle, ""];
  for (const b of doc.blocks) {
    switch (b.t) {
      case "heading":
        out.push("", `*${b.text}*`);
        break;
      case "rows":
        for (const r of b.rows) out.push(`${r.label}${r.sub ? ` (${r.sub})` : ""}: ${amount(r)}`);
        if (b.total) out.push(`*${b.total.label}: ${formatNumber(b.total.amount)}*`);
        break;
      case "note":
        out.push(b.text);
        break;
      case "table": {
        // the head first, and «—» for an empty cell, so every line keeps its columns
        const line = (row: string[]) => row.map((c) => c || "—").join(" · ");
        out.push(`_${b.head.join(" · ")}_`);
        for (const row of b.rows) out.push(line(row));
        if (b.foot) out.push(`*${line(b.foot)}*`);
        break;
      }
      case "grid":
        for (const r of b.rows) {
          const paid = r.paid.flatMap((p, i) => (p ? [i + 1] : []));
          out.push(`${r.name}: ${paid.length ? `✓ ${monthsText(paid)}` : "—"}`);
        }
        break;
      case "months": {
        const paid = b.paid.flatMap((p, i) => (p ? [i + 1] : []));
        out.push(paid.length ? `الأشهر المدفوعة: ${monthsText(paid)}` : "لم يدفع أي شهر");
        break;
      }
      case "big":
        out.push(`*${b.value}* ${b.lead}`);
        break;
      case "tiles":
        for (const i of b.items) out.push(`${i.label}: ${i.value}${i.sub ? ` (${i.sub})` : ""}`);
        break;
      case "counts":
        out.push(
          b.months
            .flatMap((m, i) => (m.started || m.paid ? [`${monthName(i + 1)} ${m.paid}`] : []))
            .join("، "),
        );
        break;
      case "bars":
      case "sign":
        break; // drawn only
    }
  }
  out.push("", preparedLine(meta));
  if (doc.hasAmounts) out.push(UNITS_NOTE);
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
