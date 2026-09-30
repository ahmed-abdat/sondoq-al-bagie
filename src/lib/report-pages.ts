/**
 * The fund report as a set of pages drawn on a canvas, for the WhatsApp group:
 * cover (summary), one or more pages per member list (a green ✓ in each paid month),
 * then expenses and campaigns. 1080×1350 for images; 1080×1575 for the PDF (A4 inside a 10 mm
 * margin). Loaded on demand by share-report.ts. Pagination is pure and unit tested.
 * «المتأخرات» («من عليه متأخرات فقط») is the same members grid, filtered to members who owe,
 * without money: no totals.
 */
import { renderPng, type CanvasFonts } from "./canvas-share";
import type { ReportCampaign, ReportData, ReportExpense, ReportMember } from "./data/types";
import { formatDay, monthName } from "./dates";
import { monthPaid, paidTotal } from "./report-check";
import { formatNumber } from "./format";
import { FUND_NAME } from "./brand";
import {
  drawReportSummary,
  hasReminder,
  owesFees,
  makePen,
  reportSummary,
  T,
  yearLine,
  type Pen,
  type ReportInput,
  type ReportSummaryData,
} from "./share-report";

export interface PageSize {
  w: number;
  h: number;
}
export const PHONE_PAGE: PageSize = { w: 1080, h: 1350 };
/** A4 minus 10 mm on each side (538.6 × 785.2 pt), at 1080 px wide. */
export const A4_PAGE: PageSize = { w: 1080, h: 1575 };

/** Layout (px at 1080 wide). */
export const L = {
  pad: 48,
  band: 168,
  gap: 24,
  /** the month key line «1 = يناير … 12 = ديسمبر» above the grid */
  legend: 52,
  head: 44,
  /**
   * one member row on an image page: room to read a name with weak eyes (owner, r31: the old
   * 32 px rows crowded); 20 rows on a phone page. The PDF uses rowPrint.
   */
  row: 44,
  /** one member row in the A4 PDF: 52 px ≈ 9.2 mm printed; 21 rows per page */
  rowPrint: 52,
  /** «المجموع: … أوقية» and the legend under the grid */
  total: 56,
  foot: 92,
} as const;

/* ─────────────── pagination (pure) ─────────────── */

export type Block =
  | { t: "heading"; text: string }
  | { t: "expHead" }
  | { t: "expense"; e: ReportExpense; zebra: boolean }
  | { t: "expTotal"; label: string; amount: number }
  | { t: "campaign"; c: ReportCampaign }
  | { t: "note"; text: string }
  | { t: "space" }
  | { t: "cta" };

export const BLOCK_H: Record<Block["t"], number> = {
  heading: 84,
  expHead: 48,
  expense: 80,
  expTotal: 72,
  campaign: 188,
  note: 60,
  space: 32,
  cta: 130,
};

export type ReportPage =
  | { kind: "cover" }
  | {
      kind: "members";
      list: string;
      rows: ReportMember[];
      part: number;
      parts: number;
      /** «المتأخرات»: only members who owe, no total */
      reminder?: true;
    }
  | { kind: "money"; title: string; blocks: Block[]; part: number; parts: number };

/** «A-12» → «A». */
const listOf = (m: Pick<ReportMember, "memberRef">) => m.memberRef.split("-")[0];
const listLabel = (code: string) => {
  const c = code.trim().toUpperCase();
  return c === "A" ? "أ" : c === "B" ? "ب" : code;
};
/** Left / deceased members are hidden, as on the public lists. */
const isShown = (m: Pick<ReportMember, "status">) => m.status !== "left" && m.status !== "deceased";

/** Member row height: taller in the A4 PDF, which is printed or read zoomed out. */
export const rowHeight = (size: PageSize) => (size.h === A4_PAGE.h ? L.rowPrint : L.row);

/** Rows per members page; the total line under the grid always has its room. */
export function membersPerPage(size: PageSize): number {
  return Math.floor(
    (size.h - L.band - L.gap - L.legend - L.head - L.total - L.foot) / rowHeight(size),
  );
}

/** Split into the fewest pages of at most `max`, as even as possible (45 by 20 → 15, 15, 15). */
export function chunkEven<X>(xs: X[], max: number): X[][] {
  if (!xs.length) return [];
  const parts = Math.ceil(xs.length / max);
  const per = Math.ceil(xs.length / parts);
  return Array.from({ length: parts }, (_, i) => xs.slice(i * per, (i + 1) * per)).filter(
    (c) => c.length,
  );
}

/** Campaigns worth showing: open ones, and closed ones that moved money. */
const shownCampaigns = (r: ReportData) =>
  r.campaigns.filter((c) => c.status === "open" || c.collected !== 0 || c.spent !== 0);

/** Expenses and campaigns; empty sections are left out, and nothing at all when both are. */
export function moneyBlocks(r: ReportData): Block[] {
  const out: Block[] = [];
  if (r.expenses.length) {
    out.push({ t: "heading", text: `المصاريف في ${r.year}` });
    if (!r.expensesComplete) out.push({ t: "note", text: "تظهر هنا آخر 50 مصروفًا فقط." });
    out.push({ t: "expHead" });
    r.expenses.forEach((e, i) => out.push({ t: "expense", e, zebra: i % 2 === 1 }));
    out.push({
      t: "expTotal",
      label: `مجموع المصاريف في ${r.year}`,
      amount: r.summary.spentThisYear,
    });
  }
  const campaigns = shownCampaigns(r);
  if (campaigns.length) {
    if (out.length) out.push({ t: "space" });
    out.push({ t: "heading", text: "حملات التبرع" });
    for (const c of campaigns) out.push({ t: "campaign", c });
  }
  if (out.length) out.push({ t: "space" }, { t: "cta" });
  return out;
}

/**
 * Fill pages of height `avail`. A heading (and the expense column header) stays with the block
 * after it; a page that starts inside the expense list repeats the heading and the column header.
 */
export function paginateBlocks(blocks: Block[], avail: number): Block[][] {
  const pages: Block[][] = [];
  let page: Block[] = [];
  let used = 0;
  let heading: Extract<Block, { t: "heading" }> | null = null;
  const h = (b: Block) => BLOCK_H[b.t];
  const newPage = () => {
    if (page.length) pages.push(page);
    page = [];
    used = 0;
  };
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.t === "heading") heading = b;
    // keep headings with what follows
    let need = h(b);
    for (
      let j = i;
      (blocks[j]?.t === "heading" || blocks[j]?.t === "expHead" || blocks[j]?.t === "space") &&
      blocks[j + 1];
      j++
    )
      need += h(blocks[j + 1]);
    if (used + need > avail && page.length) {
      newPage();
      if (b.t === "space") continue; // no gap at the top of a page
      if ((b.t === "expense" || b.t === "expTotal") && heading) {
        const cont: Block[] = [{ t: "heading", text: `${heading.text}، تابع` }, { t: "expHead" }];
        page.push(...cont);
        used += cont.reduce((s, c) => s + h(c), 0);
      }
    }
    page.push(b);
    used += h(b);
  }
  newPage();
  return pages;
}

export function paginateReport(r: ReportData, size: PageSize = PHONE_PAGE): ReportPage[] {
  const pages: ReportPage[] = [{ kind: "cover" }];
  const shown = r.members.filter(isShown);
  const lists = [...new Set(shown.map(listOf))].sort();
  for (const list of lists) {
    const chunks = chunkEven(
      shown.filter((m) => listOf(m) === list),
      membersPerPage(size),
    );
    chunks.forEach((rows, i) =>
      pages.push({ kind: "members", list, rows, part: i + 1, parts: chunks.length }),
    );
  }
  const avail = size.h - L.band - L.gap - L.foot - 16;
  const money = paginateBlocks(moneyBlocks(r), avail);
  const title = !r.expenses.length
    ? "حملات التبرع"
    : shownCampaigns(r).length
      ? "المصاريف والحملات"
      : "المصاريف";
  money.forEach((blocks, i) =>
    pages.push({ kind: "money", title, blocks, part: i + 1, parts: money.length }),
  );
  return pages;
}

/* ─────────────── «المتأخرات» («من عليه متأخرات فقط») ─────────────── */

export { hasReminder, owesFees };

/** The arrears pages: per group, only members who owe; groups where nobody owes are left out. */
export function paginateReminder(r: ReportData, size: PageSize = PHONE_PAGE): ReportPage[] {
  const owing = r.members.filter(owesFees);
  const pages: ReportPage[] = [];
  for (const list of [...new Set(owing.map(listOf))].sort()) {
    const chunks = chunkEven(
      owing.filter((m) => listOf(m) === list),
      membersPerPage(size),
    );
    chunks.forEach((rows, i) =>
      pages.push({
        kind: "members",
        list,
        rows,
        part: i + 1,
        parts: chunks.length,
        reminder: true,
      }),
    );
  }
  return pages;
}

/** Footer text, the same on every page: «صندوق الرابطة · الصفحة 2 من 7 · حتى …». */
export function footerLabel(no: number, of: number, asOf: string): string {
  return `${FUND_NAME} · الصفحة ${no} من ${of} · حتى ${asOf}`;
}

/* ─────────────── drawing ─────────────── */

export interface PageDrawOptions {
  url: string;
  fonts: CanvasFonts;
  logo?: CanvasImageSource | null;
  size: PageSize;
  /** 1-based page number and total, for the footer. */
  no: number;
  of: number;
}

/** Header band of the inner pages: brand on the right, the page's title and lines on the left. */
function band(
  p: Pen,
  w: number,
  card: ReportSummaryData,
  logo: PageDrawOptions["logo"],
  title: string,
  lines: string[] = [],
) {
  const R = w - L.pad;
  const x = p.x;
  x.fillStyle = T.green;
  x.fillRect(0, 0, w, L.band);
  // soft shadow under the band, like the app's sticky bar
  const g = x.createLinearGradient(0, L.band, 0, L.band + 18);
  g.addColorStop(0, "rgba(16,40,24,0.16)");
  g.addColorStop(1, "rgba(16,40,24,0)");
  x.fillStyle = g;
  x.fillRect(0, L.band, w, 18);

  p.logo(logo, R - 46, L.band / 2, 46);
  p.text(FUND_NAME, R - 112, 78, { size: 34, weight: 700, face: "display", color: T.paper });
  p.text(yearLine(card), R - 112, 120, { size: 24, color: T.onGreen });
  const max = w - 2 * L.pad - 440;
  const two = lines.length > 1;
  p.text(title, L.pad, two ? 66 : 80, {
    size: 40,
    weight: 700,
    face: "display",
    color: T.paper,
    align: "left",
    max,
  });
  lines.forEach((t, i) =>
    p.text(t, L.pad, (two ? 108 : 124) + i * 36, {
      size: i ? 22 : 24,
      color: i ? T.onGreen : T.greenMist,
      align: "left",
      max,
    }),
  );
}

/** A paid month: a plain green check, no disc (owner decision r25). `r` = half its size. */
function okMark(p: Pen, cx: number, cy: number, r: number) {
  const k = r / 12;
  const x = p.x;
  x.lineWidth = 3.4 * k;
  x.lineCap = "round";
  x.lineJoin = "round";
  x.strokeStyle = T.green;
  x.beginPath();
  x.moveTo(cx - 7.5 * k, cy + 0.5 * k);
  x.lineTo(cx - 2.5 * k, cy + 5.5 * k);
  x.lineTo(cx + 7.5 * k, cy - 5.5 * k);
  x.stroke();
}

/**
 * Member grid columns at width `w` (from the right): the name, then 12 month cells down to the
 * left margin (no number column, owner decision r25). Pure, so the fit is unit tested.
 */
export function memberCols(w: number) {
  const R = w - L.pad;
  const nameR = R - 22;
  const cell = 40;
  const badge = 12;
  const monthsR = L.pad + 12 * cell;
  return {
    nameR,
    nameW: nameR - monthsR - 16,
    cell,
    badge,
    /** centre of month k (1 = January, on the right) */
    cx: (k: number) => monthsR - (k - 0.5) * cell,
  };
}

/** «عضو واحد» «عضوان» «7 أعضاء» «20 عضوًا». */
export function membersWord(n: number) {
  if (n === 1) return "عضو واحد";
  if (n === 2) return "عضوان";
  const r = n % 100;
  if (r >= 3 && r <= 10) return `${n} أعضاء`;
  return r >= 11 ? `${n} عضوًا` : `${n} عضو`;
}

/** Table lines: a soft brand grey green (r25), the outer border a step darker; the lines between
 *  rows softer still, so the names breathe (r31). */
const LINE = "#B3C5B9";
const ROW_LINE = "#D4DFD7";
const EDGE = "#7F9A88";
const CORNER = 14;

function drawMembers(
  p: Pen,
  page: Extract<ReportPage, { kind: "members" }>,
  r: ReportInput,
  card: ReportSummaryData,
  o: PageDrawOptions,
) {
  const { w } = o.size;
  const R = w - L.pad;
  const P = L.pad;
  const all = r.members.filter((m) => isShown(m) && listOf(m) === page.list);
  const fee = (r.groupPrices as Record<string, number | undefined>)[page.list];
  const feeLine = fee ? [`الرسوم الشهرية: ${formatNumber(fee)} أوقية`] : [];
  // no current-month count here (owner decision r20): the group, its size and its fee.
  // «المتأخرات»: the title only, no amount at all, not even the fee (owner), never «متأخر N»
  if (page.reminder) band(p, w, card, o.logo, `المتأخرات · المجموعة ${listLabel(page.list)}`);
  else
    band(p, w, card, o.logo, `المجموعة ${listLabel(page.list)}`, [
      membersWord(all.length),
      ...feeLine,
    ]);

  // the month key above the grid; no second title, the band already names the fund (r25)
  const ty = L.band + L.gap + 34;
  p.text(`1 = ${monthName(1)} … 12 = ${monthName(12)}`, R, ty, { size: 20, color: T.slate });

  const { nameR, nameW, cx, badge, cell } = memberCols(w);
  const row = rowHeight(o.size);
  const hy = L.band + L.gap + L.legend;
  const rowsTop = hy + L.head;
  const rowsEnd = rowsTop + page.rows.length * row;
  // header row in the brand: green tint, forest bold (r25); the rows stay white
  const x = p.x;
  x.fillStyle = T.greenTint;
  x.beginPath();
  x.roundRect(P, hy, R - P, L.head, [CORNER, CORNER, 0, 0]);
  x.fill();
  const head = { size: 22, weight: 700, color: T.forest } as const;
  p.text("الاسم", nameR, hy + 30, head);
  for (let k = 1; k <= 12; k++)
    p.text(String(k), cx(k), hy + 30, { ...head, face: "display", align: "center", dir: "ltr" });

  // white rows like paper: the name, a ✓ in each paid month, empty otherwise
  page.rows.forEach((m, i) => {
    const mid = rowsTop + i * row + row / 2;
    p.text(m.fullName, nameR, mid + 10, { size: 28, weight: 600, max: nameW });
    for (let k = 1; k <= 12; k++) if (monthPaid(m.months[k - 1])) okMark(p, cx(k), mid, badge);
  });

  // a fully bordered table like the paper: crisp soft lines, rounded outer corners (r25)
  x.strokeStyle = ROW_LINE;
  x.lineWidth = 1.5;
  x.beginPath();
  for (let i = 0; i < page.rows.length; i++) {
    x.moveTo(P, rowsTop + i * row);
    x.lineTo(R, rowsTop + i * row);
  }
  x.stroke();
  x.strokeStyle = LINE;
  x.beginPath();
  for (const vx of Array.from({ length: 12 }, (_, i) => P + (i + 1) * cell)) {
    x.moveTo(vx, hy);
    x.lineTo(vx, rowsEnd);
  }
  x.stroke();
  x.lineWidth = 2;
  x.strokeStyle = EDGE;
  x.beginPath();
  x.roundRect(P, hy, R - P, rowsEnd - hy, CORNER);
  x.stroke();

  // under the grid: «المجموع» once (the group's last page) and the legend; «المتأخرات» has no
  // money at all (owner): the legend only
  const fy = rowsEnd + 38;
  if (!page.reminder && page.part === page.parts)
    p.text(`المجموع: ${formatNumber(paidTotal(all, r.groupPrices))} أوقية`, R, fy, {
      size: 26,
      weight: 700,
      face: "display",
    });
  const lw = p.text("مدفوع · خانة فارغة: لم يُدفع", P, fy, {
    size: 20,
    color: T.slate,
    align: "left",
  });
  okMark(p, P + lw + 16, fy - 7, 11);
}

function drawMoney(
  p: Pen,
  page: Extract<ReportPage, { kind: "money" }>,
  card: ReportSummaryData,
  o: PageDrawOptions,
) {
  const { w, h: H } = o.size;
  const R = w - L.pad;
  const P = L.pad;
  band(p, w, card, o.logo, page.title);
  const dateR = R - 8;
  const textR = R - 176;
  const amtR = P + 200; // amount column: digits right-aligned here, «أوقية» at P
  let y = L.band + L.gap;
  const money = (n: number, yy: number, size: number) => {
    p.text(formatNumber(n), amtR, yy, {
      size,
      weight: 700,
      face: "display",
      dir: "ltr",
      align: "right",
    });
    p.text("أوقية", P + 4, yy, { size: 20, color: T.slate, align: "left" });
  };
  for (const b of page.blocks) {
    const h = BLOCK_H[b.t];
    switch (b.t) {
      case "heading":
        p.text(b.text, R, y + 54, { size: 36, weight: 700, face: "display" });
        break;
      case "note":
        p.text(b.text, R, y + 38, { size: 24, color: T.slate });
        break;
      case "expHead": {
        const o2 = { size: 22, weight: 600, color: T.slate } as const;
        p.text("التاريخ", dateR, y + 32, o2);
        p.text("البيان", textR, y + 32, o2);
        p.text("المبلغ", amtR, y + 32, o2);
        break;
      }
      case "expense": {
        const e = b.e;
        if (b.zebra) p.box(P - 12, y, w - 2 * P + 24, h, 12, T.greenWash);
        p.text(formatDay(e.spentOn), dateR, y + 50, {
          size: 24,
          weight: 500,
          face: "display",
          color: T.slate,
        });
        const maxText = textR - (amtR + 32);
        if (e.note) {
          p.text(e.note, textR, y + 36, { size: 26, weight: 600, max: maxText });
          p.text(e.categoryLabel, textR, y + 66, { size: 22, color: T.slate, max: maxText });
        } else p.text(e.categoryLabel, textR, y + 50, { size: 26, weight: 600, max: maxText });
        money(e.amount, y + 50, 28);
        break;
      }
      case "expTotal":
        p.box(P - 12, y + 10, w - 2 * P + 24, 2, 0, T.stone);
        p.text(b.label, R, y + 56, { size: 28, weight: 700, face: "display" });
        money(b.amount, y + 56, 28);
        break;
      case "campaign": {
        const c = b.c;
        const open = c.status === "open";
        const label = open ? "مفتوحة" : "مغلقة";
        p.x.font = p.font(22, 600);
        const pw = p.x.measureText(label).width + 28;
        p.box(P, y + 18, pw, 36, 18, open ? T.greenTint : T.mist);
        p.text(label, P + pw - 14, y + 44, {
          size: 22,
          weight: 600,
          color: open ? T.forest : T.slate,
        });
        p.text(c.title, R, y + 48, {
          size: 30,
          weight: 700,
          face: "display",
          max: R - P - pw - 32,
        });
        if (c.targetAmount) {
          const f = Math.min(1, Math.max(0, c.collected / c.targetAmount));
          p.box(P, y + 76, R - P, 12, 6, T.goldTrack);
          if (f > 0) p.box(R - (R - P) * f, y + 76, (R - P) * f, 12, 6, T.gold);
        }
        p.text(
          c.targetAmount
            ? `جُمع ${formatNumber(c.collected)} من ${formatNumber(c.targetAmount)} أوقية`
            : `جُمع ${formatNumber(c.collected)} أوقية`,
          R,
          y + 128,
          { size: 26, weight: 600, face: "display" },
        );
        p.text(
          `صُرف ${formatNumber(c.spent)} · الباقي ${formatNumber(c.balance)} أوقية`,
          R,
          y + 164,
          { size: 24, color: T.slate },
        );
        break;
      }
      case "cta": {
        // at the foot of the page, so a short page still ends well
        const cy = Math.max(y, H - L.foot - h);
        p.box(P - 12, cy, w - 2 * P + 24, h - 16, 24, T.greenTint);
        p.text("ابحث عن اسمك وتحقّق من أشهرك", R - 16, cy + 50, {
          size: 30,
          weight: 700,
          face: "display",
          color: T.forestDeep,
        });
        p.text(o.url.replace(/^https?:\/\//, ""), R - 16, cy + 94, {
          size: 28,
          weight: 600,
          face: "display",
          color: T.forest,
          dir: "ltr",
          align: "right",
        });
        break;
      }
    }
    y += h;
  }
}

/** Draws one page (exported for the tests that read what is drawn). */
export function drawReportPage(
  x: CanvasRenderingContext2D,
  page: ReportPage,
  r: ReportInput,
  o: PageDrawOptions,
): void {
  const card = reportSummary(r);
  const footer = footerLabel(o.no, o.of, card.asOfLabel);
  if (page.kind === "cover") {
    drawReportSummary(x, card, {
      url: o.url,
      fonts: o.fonts,
      logo: o.logo,
      height: o.size.h,
      footer,
      variant: "cover",
    });
    return;
  }
  const p = makePen(x, o.fonts);
  x.fillStyle = T.paper;
  x.fillRect(0, 0, o.size.w, o.size.h);
  if (page.kind === "members") drawMembers(p, page, r, card, o);
  else drawMoney(p, page, card, o);
  // the last page's «ابحث عن اسمك» panel already shows the link
  const cta = page.kind === "money" && page.blocks.some((b) => b.t === "cta");
  p.footer(o.size.w, o.size.h, footer, cta ? "" : o.url, L.pad);
}

/* ─────────────── browser ─────────────── */

export async function renderReportPages(
  r: ReportInput,
  o: {
    url: string;
    fonts: CanvasFonts;
    logo?: CanvasImageSource | null;
    size?: PageSize;
    scale?: number;
    type?: "image/png" | "image/jpeg";
    quality?: number;
    /** «المتأخرات» («من عليه متأخرات فقط») instead of the full report */
    reminder?: boolean;
  },
): Promise<Blob[]> {
  const size = o.size ?? PHONE_PAGE;
  const pages = o.reminder ? paginateReminder(r, size) : paginateReport(r, size);
  const out: Blob[] = [];
  for (const [i, page] of pages.entries()) {
    out.push(
      await renderPng(
        size.w,
        size.h,
        o.scale ?? 1,
        (ctx) =>
          drawReportPage(ctx, page, r, {
            url: o.url,
            fonts: o.fonts,
            logo: o.logo,
            size,
            no: i + 1,
            of: pages.length,
          }),
        o.type,
        o.quality,
      ),
    );
  }
  return out;
}
