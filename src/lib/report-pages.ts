/**
 * The fund report as a set of pages drawn on a canvas, for the WhatsApp group:
 * cover (summary), one or more pages per member list (12 month dots per member),
 * then expenses and campaigns. 1080×1350 for images, 1080×1527 (A4 ratio) for the PDF.
 * Loaded on demand by share-report.ts. Pagination is pure and unit tested.
 */
import { renderPng, type CanvasFonts } from "./canvas-share";
import type {
  ReportCampaign,
  ReportData,
  ReportExpense,
  ReportMember,
  ReportMonthState,
} from "./data/types";
import { formatDay, monthName } from "./dates";
import { formatNumber } from "./format";
import { FUND_NAME } from "./share-receipt";
import {
  drawReportSummary,
  makePen,
  reportSummary,
  T,
  yearLine,
  type Pen,
  type ReportSummaryData,
} from "./share-report";

export interface PageSize {
  w: number;
  h: number;
}
export const PHONE_PAGE: PageSize = { w: 1080, h: 1350 };
export const A4_PAGE: PageSize = { w: 1080, h: 1527 };

/** Layout (px at 1080 wide). */
export const L = {
  pad: 48,
  band: 168,
  gap: 24,
  legend: 60,
  head: 52,
  /** member rows: at least this tall (so a page holds 23 on a phone, 27 on A4), at most `rowMax` */
  row: 41,
  rowMax: 52,
  foot: 92,
} as const;

/* ─────────────── pagination (pure) ─────────────── */

export type Block =
  | { t: "heading"; text: string; aside?: string }
  | { t: "expHead" }
  | { t: "expense"; e: ReportExpense; zebra: boolean }
  | { t: "campaign"; c: ReportCampaign }
  | { t: "note"; text: string }
  | { t: "space" };

export const BLOCK_H: Record<Block["t"], number> = {
  heading: 84,
  expHead: 48,
  expense: 80,
  campaign: 188,
  note: 60,
  space: 32,
};

export type ReportPage =
  | { kind: "cover" }
  | { kind: "members"; list: string; rows: ReportMember[]; part: number; parts: number }
  | { kind: "money"; blocks: Block[]; part: number; parts: number };

/** «A-12» → «A». */
export const listOf = (m: Pick<ReportMember, "memberRef">) => m.memberRef.split("-")[0];
/** «A-12» → «12». */
export const numberOf = (m: Pick<ReportMember, "memberRef">) =>
  m.memberRef.split("-").slice(1).join("-") || m.memberRef;
export const listLabel = (code: string) => {
  const c = code.trim().toUpperCase();
  return c === "A" ? "أ" : c === "B" ? "ب" : code;
};
/** Left / deceased members are hidden, as on the public lists. */
export const isShown = (m: Pick<ReportMember, "status">) =>
  m.status !== "left" && m.status !== "deceased";

const rowsSpace = (size: PageSize) => size.h - L.band - L.gap - L.legend - L.head - L.foot;

export function membersPerPage(size: PageSize): number {
  return Math.floor(rowsSpace(size) / L.row);
}

/** Row height for `n` rows: fill the page, within [row, rowMax]. */
export function rowHeight(size: PageSize, n: number): number {
  return Math.max(L.row, Math.min(L.rowMax, Math.floor(rowsSpace(size) / Math.max(1, n))));
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

export function moneyBlocks(r: ReportData): Block[] {
  const out: Block[] = [
    {
      t: "heading",
      text: `المصاريف في ${r.year}`,
      aside: `المجموع ${formatNumber(r.summary.spentThisYear)} أوقية`,
    },
  ];
  if (!r.expensesComplete) out.push({ t: "note", text: "تظهر هنا آخر 50 مصروفًا فقط." });
  if (!r.expenses.length) out.push({ t: "note", text: "لم يُصرف شيء هذا العام." });
  else {
    out.push({ t: "expHead" });
    r.expenses.forEach((e, i) => out.push({ t: "expense", e, zebra: i % 2 === 1 }));
  }
  if (r.campaigns.length) {
    out.push({ t: "space" }, { t: "heading", text: "حملات التبرع" });
    for (const c of r.campaigns) out.push({ t: "campaign", c });
  }
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
  let heading: Block | null = null;
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
      (blocks[j]?.t === "heading" || blocks[j]?.t === "expHead") && blocks[j + 1];
      j++
    )
      need += h(blocks[j + 1]);
    if (used + need > avail && page.length) {
      newPage();
      if (b.t === "expense" && heading) {
        const cont: Block[] = [
          { ...heading, text: `${heading.text}، تابع` } as Block,
          { t: "expHead" },
        ];
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
  money.forEach((blocks, i) =>
    pages.push({ kind: "money", blocks, part: i + 1, parts: money.length }),
  );
  return pages;
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

const isPaid = (s: ReportMonthState | undefined) => s === "paid" || s === "prepaid";

/** Header band of the inner pages: brand on the right, the page's title on the left. */
function band(
  p: Pen,
  w: number,
  card: ReportSummaryData,
  logo: PageDrawOptions["logo"],
  title: string,
  sub?: string,
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
  p.text(title, L.pad, 80, {
    size: 40,
    weight: 700,
    face: "display",
    color: T.paper,
    align: "left",
    max: w / 2 - L.pad - 40,
  });
  if (sub)
    p.text(sub, L.pad, 124, {
      size: 24,
      color: T.greenMist,
      align: "left",
      max: w / 2 - L.pad - 40,
    });
}

/** The month mark: ● paid (early or not, the same), ○ late, · not due yet. */
function mark(p: Pen, s: ReportMonthState | undefined, cx: number, cy: number) {
  const x = p.x;
  const r = 12;
  if (isPaid(s)) return p.dot(cx, cy, r, T.green);
  if (s === "late") {
    x.lineWidth = 3;
    x.strokeStyle = T.slate;
    x.beginPath();
    x.arc(cx, cy, r - 1.5, 0, Math.PI * 2);
    x.stroke();
    return;
  }
  p.dot(cx, cy, 4, T.pebble);
}

function drawMembers(
  p: Pen,
  page: Extract<ReportPage, { kind: "members" }>,
  r: ReportData,
  card: ReportSummaryData,
  o: PageDrawOptions,
) {
  const { w } = o.size;
  const R = w - L.pad;
  const all = r.members.filter((m) => isShown(m) && listOf(m) === page.list);
  const active = all.filter((m) => m.status === "active");
  const paid = active.filter((m) => isPaid(m.months[card.month - 1])).length;
  const paidText = `${paid} من ${active.length} دفعوا رسوم ${monthName(card.month)}`;
  band(
    p,
    w,
    card,
    o.logo,
    `المجموعة ${listLabel(page.list)}`,
    page.parts > 1 ? `الجزء ${page.part} من ${page.parts} · ${paidText}` : paidText,
  );
  const row = rowHeight(o.size, page.rows.length);

  // Legend
  let lx = R;
  const ly = L.band + L.gap + 34;
  const items: [ReportMonthState, string][] = [
    ["paid", "مدفوع"],
    ["late", "متأخر"],
    ["upcoming", "لم يحن بعد"],
  ];
  for (const [s, label] of items) {
    mark(p, s, lx - 12, ly - 9);
    lx -= 34;
    lx -= p.text(label, lx, ly, { size: 24, color: T.slate }) + 36;
  }

  // Columns (from the right): number, name, 12 months, status
  const cNo = R - 30;
  const nameR = R - 72;
  const nameW = 312;
  const mR = nameR - nameW - 16;
  const mW = 36;
  const cx = (k: number) => mR - (k - 0.5) * mW;
  const stR = mR - 12 * mW - 12;
  const now = card.month;

  const hy = L.band + L.gap + L.legend;
  const rowsTop = hy + L.head;
  // current month column
  p.box(cx(now) - mW / 2 + 2, hy + 6, mW - 4, L.head - 6 + page.rows.length * row, 10, T.greenTint);
  const head = { size: 22, weight: 600, color: T.slate } as const;
  p.text("رقم", cNo, hy + 34, { ...head, align: "center" });
  p.text("الاسم", nameR, hy + 34, head);
  for (let k = 1; k <= 12; k++)
    p.text(String(k), cx(k), hy + 34, {
      ...head,
      face: "display",
      weight: k === now ? 800 : 600,
      color: k === now ? T.forestDeep : T.slate,
      align: "center",
      dir: "ltr",
    });
  p.text("الحالة", stR, hy + 34, head);

  page.rows.forEach((m, i) => {
    const y = rowsTop + i * row;
    const mid = y + row / 2;
    if (i % 2 === 1) {
      p.x.globalAlpha = 0.9;
      p.box(L.pad - 12, y, w - 2 * L.pad + 24, row, 12, T.greenWash);
      p.x.globalAlpha = 1;
      // keep the current-month column visible over the zebra
      p.box(cx(now) - mW / 2 + 2, y, mW - 4, row, 0, T.greenTint);
    }
    p.text(numberOf(m), cNo, mid + 9, {
      size: 26,
      weight: 600,
      face: "display",
      color: T.slate,
      align: "center",
      dir: "ltr",
    });
    p.text(m.fullName, nameR, mid + 9, { size: 26, weight: 600, max: nameW });
    for (let k = 1; k <= 12; k++) mark(p, m.months[k - 1], cx(k), mid);
    const ok = m.status === "active" && m.monthsBehind === 0;
    const label = m.statusLabel;
    p.x.font = p.font(22, 600);
    const tw = Math.min(p.x.measureText(label).width, stR - L.pad - 28);
    p.box(stR - tw - 28, mid - 17, tw + 28, 34, 17, ok ? T.greenTint : T.mist);
    p.text(label, stR - 14, mid + 8, {
      size: 22,
      weight: 600,
      color: ok ? T.forest : T.slate,
      max: stR - L.pad - 28,
    });
  });
}

function drawMoney(
  p: Pen,
  page: Extract<ReportPage, { kind: "money" }>,
  card: ReportSummaryData,
  o: PageDrawOptions,
) {
  const { w } = o.size;
  const R = w - L.pad;
  const P = L.pad;
  band(
    p,
    w,
    card,
    o.logo,
    "المصاريف والحملات",
    page.parts > 1 ? `${page.part} من ${page.parts}` : undefined,
  );
  const dateR = R - 8;
  const textR = R - 180;
  let y = L.band + L.gap;
  for (const b of page.blocks) {
    const h = BLOCK_H[b.t];
    switch (b.t) {
      case "heading":
        p.text(b.text, R, y + 54, { size: 36, weight: 700, face: "display" });
        if (b.aside)
          p.text(b.aside, P, y + 54, { size: 24, weight: 600, color: T.slate, align: "left" });
        break;
      case "note":
        p.text(b.text, R, y + 38, { size: 24, color: T.slate });
        break;
      case "expHead": {
        const o2 = { size: 22, weight: 600, color: T.slate } as const;
        p.text("التاريخ", dateR, y + 32, o2);
        p.text("البيان", textR, y + 32, o2);
        p.text("المبلغ بالأوقية", P + 8, y + 32, { ...o2, align: "left" });
        break;
      }
      case "expense": {
        const e = b.e;
        if (b.zebra) p.box(P - 12, y, w - 2 * P + 24, h, 12, T.greenWash);
        p.text(formatDay(e.spentOn), dateR, y + 50, {
          size: 26,
          weight: 600,
          face: "display",
          color: T.slate,
        });
        const maxText = textR - (P + 240);
        if (e.note) {
          p.text(e.note, textR, y + 36, { size: 26, weight: 600, max: maxText });
          p.text(e.categoryLabel, textR, y + 66, { size: 22, color: T.slate, max: maxText });
        } else p.text(e.categoryLabel, textR, y + 50, { size: 26, weight: 600, max: maxText });
        p.text(formatNumber(e.amount), P + 8, y + 50, {
          size: 28,
          weight: 700,
          face: "display",
          dir: "ltr",
          align: "left",
        });
        break;
      }
      case "campaign": {
        const c = b.c;
        const open = c.status === "open";
        const pill = open ? "مفتوحة" : "مغلقة";
        p.x.font = p.font(22, 600);
        const pw = p.x.measureText(pill).width + 28;
        p.box(P, y + 18, pw, 36, 18, open ? T.greenTint : T.mist);
        p.text(pill, P + pw - 14, y + 44, {
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
    }
    y += h;
  }
}

export function drawReportPage(
  x: CanvasRenderingContext2D,
  page: ReportPage,
  r: ReportData,
  o: PageDrawOptions,
): void {
  const card = reportSummary(r);
  const footer = `${FUND_NAME} · الصفحة ${o.no} من ${o.of} · حتى ${card.asOfLabel}`;
  if (page.kind === "cover") {
    drawReportSummary(x, card, {
      url: o.url,
      fonts: o.fonts,
      logo: o.logo,
      height: o.size.h,
      footer,
    });
    return;
  }
  const p = makePen(x, o.fonts);
  x.fillStyle = T.paper;
  x.fillRect(0, 0, o.size.w, o.size.h);
  if (page.kind === "members") drawMembers(p, page, r, card, o);
  else drawMoney(p, page, card, o);
  p.footer(o.size.w, o.size.h, footer, o.url, L.pad);
}

/* ─────────────── browser ─────────────── */

export async function renderReportPages(
  r: ReportData,
  o: {
    url: string;
    fonts: CanvasFonts;
    logo?: CanvasImageSource | null;
    size?: PageSize;
    scale?: number;
    type?: "image/png" | "image/jpeg";
    quality?: number;
  },
): Promise<Blob[]> {
  const size = o.size ?? PHONE_PAGE;
  const pages = paginateReport(r, size);
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
