/**
 * The fund report as a set of pages drawn on a canvas, for the WhatsApp group:
 * cover (summary), one or more pages per member list (12 month marks per member),
 * then expenses and campaigns. 1080×1350 for images; 1080×1575 for the PDF (A4 inside a 10 mm
 * margin). Loaded on demand by share-report.ts. Pagination is pure and unit tested.
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
  legend: 60,
  head: 52,
  /** one member row height everywhere */
  row: 44,
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
  | { kind: "members"; list: string; rows: ReportMember[]; part: number; parts: number }
  | { kind: "money"; title: string; blocks: Block[]; part: number; parts: number };

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

export function membersPerPage(size: PageSize): number {
  return Math.floor((size.h - L.band - L.gap - L.legend - L.head - L.foot) / L.row);
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
export const shownCampaigns = (r: ReportData) =>
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

/** Footer text, the same on every page: «صندوق الرابطة · الصفحة 2 من 7 · حتى …». */
export function footerLabel(no: number, of: number, asOf: string): string {
  return `${FUND_NAME} · الصفحة ${no} من ${of} · حتى ${asOf}`;
}

/** The status pill of a member row. */
export function statusPill(m: Pick<ReportMember, "status" | "statusLabel" | "monthsBehind">): {
  text: string;
  tone: "ok" | "late" | "exempt" | "other";
} {
  if (m.status === "exempt") return { text: "معفى", tone: "exempt" };
  if (m.status !== "active") return { text: m.statusLabel, tone: "other" };
  return m.monthsBehind > 0
    ? { text: `متأخر ${m.monthsBehind}`, tone: "late" }
    : { text: "منتظم", tone: "ok" };
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

/** The month mark: ● paid (early or not, the same), ○ late; anything else stays empty. */
function mark(p: Pen, s: ReportMonthState | "none" | undefined, cx: number, cy: number) {
  const x = p.x;
  const r = 12;
  if (isPaid(s as ReportMonthState)) return p.dot(cx, cy, r, T.green);
  if (s === "late") {
    x.lineWidth = 3;
    x.strokeStyle = T.slate;
    x.beginPath();
    x.arc(cx, cy, r - 1.5, 0, Math.PI * 2);
    x.stroke();
  }
  // not due yet, not owed, exempt: empty cell
}

const PILL = {
  ok: { bg: T.greenTint, ink: T.forest },
  late: { bg: T.mist, ink: T.slate },
  exempt: { bg: T.goldTint, ink: T.goldInk },
  other: { bg: T.mist, ink: T.slate },
} as const;

function checkIcon(p: Pen, cx: number, cy: number, color: string) {
  const x = p.x;
  x.lineWidth = 3;
  x.lineCap = "round";
  x.lineJoin = "round";
  x.strokeStyle = color;
  x.beginPath();
  x.moveTo(cx - 7, cy);
  x.lineTo(cx - 2, cy + 5);
  x.lineTo(cx + 8, cy - 6);
  x.stroke();
}

function clockIcon(p: Pen, cx: number, cy: number, color: string) {
  const x = p.x;
  x.lineWidth = 2.5;
  x.lineCap = "round";
  x.strokeStyle = color;
  x.beginPath();
  x.arc(cx, cy, 8, 0, Math.PI * 2);
  x.stroke();
  x.beginPath();
  x.moveTo(cx, cy - 4.5);
  x.lineTo(cx, cy);
  x.lineTo(cx + 3.5, cy + 2.5);
  x.stroke();
}

/** A 40 px pill with its right edge at `right`; returns its width. */
function pill(
  p: Pen,
  right: number,
  mid: number,
  text: string,
  tone: keyof typeof PILL,
  maxW: number,
): number {
  const c = PILL[tone];
  const icon = tone === "ok" || tone === "late";
  p.x.font = p.font(26, 600);
  const inner =
    (icon ? 26 : 0) + Math.min(p.x.measureText(text).width, maxW - 28 - (icon ? 26 : 0));
  const pw = inner + 28;
  p.box(right - pw, mid - 20, pw, 40, 20, c.bg);
  let tx = right - 14;
  if (tone === "ok") checkIcon(p, tx - 9, mid, c.ink);
  if (tone === "late") clockIcon(p, tx - 9, mid, c.ink);
  if (icon) tx -= 26;
  p.text(text, tx, mid + 9, {
    size: 26,
    weight: 600,
    color: c.ink,
    max: maxW - 28 - (icon ? 26 : 0),
  });
  return pw;
}

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
  const active = all.filter((m) => m.status === "active");
  const paid = active.filter((m) => isPaid(m.months[card.month - 1])).length;
  const fee = (r.groupPrices as Record<string, number | undefined>)[page.list];
  band(p, w, card, o.logo, `المجموعة ${listLabel(page.list)}`, [
    `${paid} من ${active.length} دفعوا رسوم ${monthName(card.month)}`,
    ...(fee ? [`الرسوم الشهرية: ${formatNumber(fee)} أوقية`] : []),
  ]);

  // Legend: marks on the right, the month numbers' key on the left
  let lx = R;
  const ly = L.band + L.gap + 36;
  const items: [ReportMonthState, string][] = [
    ["paid", "مدفوع"],
    ["late", "متأخر"],
  ];
  for (const [s, label] of items) {
    mark(p, s, lx - 12, ly - 9);
    lx -= 34;
    lx -= p.text(label, lx, ly, { size: 24, color: T.slate }) + 36;
  }
  p.text(`1 = ${monthName(1)} … 12 = ${monthName(12)}`, P, ly, {
    size: 20,
    color: T.slate,
    align: "left",
  });

  // Columns (from the right): ref, name, 12 months, status
  const refW = 76;
  const cRef = R - refW / 2;
  const nameR = R - refW - 12;
  const mW = 34;
  const stW = 172;
  const mR = P + stW + 12 + 12 * mW;
  const nameW = nameR - mR - 14;
  const cx = (k: number) => mR - (k - 0.5) * mW;
  const stR = P + stW;
  const now = card.month;
  const row = L.row;

  const hy = L.band + L.gap + L.legend;
  const rowsTop = hy + L.head;
  // current month column
  p.box(cx(now) - mW / 2 + 1, hy + 6, mW - 2, L.head - 6 + page.rows.length * row, 10, T.greenTint);
  const head = { size: 22, weight: 600, color: T.slate } as const;
  p.text("رقم", cRef, hy + 34, { ...head, align: "center" });
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
      p.box(P - 12, y, w - 2 * P + 24, row, 12, T.greenWash);
      // keep the current-month column visible over the zebra
      p.box(cx(now) - mW / 2 + 1, y, mW - 2, row, 0, T.greenTint);
    }
    // the page is one group («المجموعة أ»): the number alone
    p.text(numberOf(m), cRef, mid + 8, {
      size: 24,
      weight: 600,
      face: "display",
      color: T.slate,
      align: "center",
      dir: "ltr",
    });
    p.text(m.fullName, nameR, mid + 11, { size: 30, weight: 600, max: nameW });
    const exempt = m.status === "exempt";
    for (let k = 1; k <= 12; k++) mark(p, exempt ? "none" : m.months[k - 1], cx(k), mid);
    const s = statusPill(m);
    pill(p, stR, mid, s.text, s.tone, stW);
  });
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
