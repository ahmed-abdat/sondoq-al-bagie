// Paints one page of a report (doc.ts) on a canvas, in the paper style of today's report:
// a green band with the logo, white page, soft grey-green lines, roomy rows, a plain green ✓ in
// paid months (owner grid rules: no tints, nothing marks the current month). No link, no QR.
import type { CanvasFonts } from "../canvas-share";
import { formatNumber } from "../format";
import { ASSOC_NAME } from "../brand";
import { makePen, T, type Pen } from "../share-report";
import {
  blockHeight,
  gridRow,
  lateRowHeight,
  LAYOUT,
  preparedLine,
  UNITS_NOTE,
  type Block,
  type DocMeta,
  type PageSize,
  type Part,
  type ReportDoc,
} from "./doc";

const LINE = "#B3C5B9";
const ROW_LINE = "#D4DFD7";
const EDGE = "#7F9A88";
const CORNER = 14;

export type DrawOptions = {
  fonts: CanvasFonts;
  logo?: CanvasImageSource | null;
  size: PageSize;
  meta: DocMeta;
  /** 1-based page number and count */
  no: number;
  of: number;
};

export function drawDocPage(
  x: CanvasRenderingContext2D,
  doc: ReportDoc,
  blocks: Block[],
  o: DrawOptions,
): void {
  const p = makePen(x, o.fonts);
  const { w, h } = o.size;
  x.fillStyle = T.paper;
  x.fillRect(0, 0, w, h);
  band(p, doc, o);
  let y = LAYOUT.band + LAYOUT.gap;
  for (const b of blocks) {
    drawBlock(p, b, y, o);
    y += blockHeight(b, o.size) + LAYOUT.after;
  }
  footer(p, doc, o);
}

/** The band: logo and the association on the right, the report's title and period under it. */
function band(p: Pen, doc: ReportDoc, o: DrawOptions) {
  const { w } = o.size;
  const R = w - LAYOUT.pad;
  const x = p.x;
  x.fillStyle = T.green;
  x.fillRect(0, 0, w, LAYOUT.band);
  const g = x.createLinearGradient(0, LAYOUT.band, 0, LAYOUT.band + 18);
  g.addColorStop(0, "rgba(16,40,24,0.16)");
  g.addColorStop(1, "rgba(16,40,24,0)");
  x.fillStyle = g;
  x.fillRect(0, LAYOUT.band, w, 18);
  p.logo(o.logo, R - 46, LAYOUT.band / 2, 46);
  const max = w - 2 * LAYOUT.pad - 112;
  p.text(`صندوق ${ASSOC_NAME}`, R - 112, 52, { size: 22, color: T.onGreen, max });
  p.text(doc.title, R - 112, 100, {
    size: 38,
    weight: 700,
    face: "display",
    color: T.paper,
    max,
  });
  p.text(doc.subtitle, R - 112, 140, { size: 24, color: T.greenMist, max });
}

/** «أُعدّ في … · … · الصفحة 1 من 2» on the right, «المبالغ بالأوقية القديمة» on the left. */
function footer(p: Pen, doc: ReportDoc, o: DrawOptions) {
  const { w, h } = o.size;
  const P = LAYOUT.pad;
  const y = h - 44;
  p.x.strokeStyle = ROW_LINE;
  p.x.lineWidth = 1.5;
  p.x.beginPath();
  p.x.moveTo(P, h - LAYOUT.foot + 12);
  p.x.lineTo(w - P, h - LAYOUT.foot + 12);
  p.x.stroke();
  const units = doc.hasAmounts
    ? p.text(UNITS_NOTE, P, y, { size: 22, color: T.slate, align: "left" })
    : 0;
  const page = o.of > 1 ? ` · الصفحة ${o.no} من ${o.of}` : "";
  p.text(`${preparedLine(o.meta)}${page}`, w - P, y, {
    size: 22,
    color: T.slate,
    max: w - 2 * P - units - 32,
  });
}

const num = (v: number, sign = "") => `${sign}${formatNumber(v)}`;

function drawBlock(p: Pen, b: Block, y: number, o: DrawOptions) {
  const { w } = o.size;
  const R = w - LAYOUT.pad;
  const P = LAYOUT.pad;
  const x = p.x;
  const hline = (yy: number, color = ROW_LINE, width = 1.5) => {
    x.strokeStyle = color;
    x.lineWidth = width;
    x.beginPath();
    x.moveTo(P, yy);
    x.lineTo(R, yy);
    x.stroke();
  };
  switch (b.t) {
    case "heading":
      p.text(b.text, R, y + 46, { size: 28, weight: 700, face: "display", color: T.forest });
      return;
    case "note": {
      let yy = y + 30;
      for (const line of wrap(p, b.text, R - P, 24)) {
        p.text(line, R, yy, { size: 24, color: T.slate });
        yy += LAYOUT.noteLine;
      }
      return;
    }
    case "rows": {
      let yy = y;
      for (const r of b.rows) {
        const rh = r.sub ? LAYOUT.rowSub : LAYOUT.row;
        const amt = p.text(num(r.amount, r.sign), P, yy + 40, {
          size: 27,
          weight: 600,
          face: "display",
          align: "left",
          dir: "ltr",
          color: T.ink,
        });
        p.text(r.label, R, yy + 40, { size: 26, color: T.ink, max: R - P - amt - 40 });
        if (r.sub) p.text(r.sub, R, yy + 72, { size: 20, color: T.slate, max: R - P - amt - 40 });
        yy += rh;
        hline(yy);
      }
      if (b.total) {
        hline(yy + 4, EDGE, 2.5);
        p.text(num(b.total.amount), P, yy + 50, {
          size: 30,
          weight: 700,
          face: "display",
          align: "left",
          dir: "ltr",
          color: T.forest,
        });
        p.text(b.total.label, R, yy + 50, { size: 28, weight: 700, color: T.forest });
      }
      return;
    }
    case "table":
      return drawTable(p, b, y, o);
    case "grid":
      return drawGrid(p, b, y, o);
    case "months":
      return drawMonths(p, b, y, o);
    case "bars":
      return drawBars(p, b, y, o);
    case "sign":
      p.text(b.right, R, y + 90, { size: 26, color: T.ink });
      p.text(b.left, P, y + 90, { size: 26, color: T.ink, align: "left" });
      return;
    case "big":
      p.text(b.value, R, y + 104, {
        size: 104,
        weight: 700,
        face: "display",
        color: T.forest,
        dir: "ltr",
      });
      p.text(b.lead, R, y + 154, { size: 28, color: T.ink, max: R - P });
      if (b.bar) partBar(p, b.bar, P, R, y + LAYOUT.big + 4, 22);
      return;
    case "tiles":
      return drawTiles(p, b, y, o);
    case "late":
      return drawLate(p, b, y, o);
    case "counts":
      return drawCounts(p, b, y, o);
  }
}

/**
 * A part of a whole as a bar that fills from the right: green = done, soft grey = not yet. No
 * words on it: the figures next to it say the numbers.
 */
function partBar(p: Pen, b: Part, left: number, right: number, top: number, h: number) {
  const x = p.x;
  x.fillStyle = T.stone;
  x.beginPath();
  x.roundRect(left, top, right - left, h, h / 2);
  x.fill();
  const k = b.whole > 0 ? Math.min(1, Math.max(0, b.part / b.whole)) : 0;
  if (k <= 0) return;
  const w = Math.max(h, (right - left) * k);
  x.fillStyle = T.green;
  x.beginPath();
  x.roundRect(right - w, top, w, h, h / 2);
  x.fill();
}

/**
 * «المتأخرات» rows: the name on the right; then a small green-edged box with how many months are
 * left and the months themselves; the لوحة shares owed under them. Soft lines between rows.
 */
function drawLate(p: Pen, b: Extract<Block, { t: "late" }>, y: number, o: DrawOptions) {
  const R = o.size.w - LAYOUT.pad;
  const P = LAYOUT.pad;
  const x = p.x;
  const nameW = (R - P) * 0.42;
  const box = 46;
  let yy = y;
  for (const r of b.rows) {
    const rh = lateRowHeight(r);
    p.text(r.name, R, yy + 40, { size: 26, color: T.ink, max: nameW - 16 });
    const bx = R - nameW - box; // the box's left edge
    if (r.count) {
      x.strokeStyle = T.green;
      x.lineWidth = 2;
      x.beginPath();
      x.roundRect(bx, yy + 10, box, box - 6, 8);
      x.stroke();
      p.text(String(r.count), bx + box / 2, yy + 42, {
        size: 24,
        weight: 700,
        face: "display",
        color: T.forest,
        align: "center",
        dir: "ltr",
      });
      p.text(r.when, bx - 14, yy + 40, { size: 24, color: T.ink, max: bx - 14 - P });
    }
    if (r.extra)
      p.text(r.extra, r.count ? bx - 14 : R - nameW, yy + (r.count ? 76 : 40), {
        size: r.count ? 21 : 24,
        color: r.count ? T.slate : T.ink,
        max: (r.count ? bx - 14 : R - nameW) - P,
      });
    yy += rh;
    x.strokeStyle = ROW_LINE;
    x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(P, yy);
    x.lineTo(R, yy);
    x.stroke();
  }
}

/** Two or three bordered cells: the label on top, the figure big, a small line, a bar. */
function drawTiles(p: Pen, b: Extract<Block, { t: "tiles" }>, y: number, o: DrawOptions) {
  const R = o.size.w - LAYOUT.pad;
  const P = LAYOUT.pad;
  const n = Math.max(1, b.items.length);
  const cw = (R - P) / n;
  const bottom = y + blockHeight(b, o.size);
  const x = p.x;
  x.strokeStyle = LINE;
  x.lineWidth = 1.5;
  x.beginPath();
  for (let i = 1; i < n; i++) {
    x.moveTo(R - i * cw, y);
    x.lineTo(R - i * cw, bottom);
  }
  x.stroke();
  x.lineWidth = 2;
  x.strokeStyle = EDGE;
  x.beginPath();
  x.roundRect(P, y, R - P, bottom - y, CORNER);
  x.stroke();
  b.items.forEach((it, i) => {
    const r = R - i * cw - 24;
    const l = R - (i + 1) * cw + 24;
    p.text(it.label, r, y + 40, { size: 22, weight: 700, color: T.forest, max: r - l });
    p.text(it.value, r, y + 98, {
      size: 46,
      weight: 700,
      face: "display",
      color: T.ink,
      dir: "ltr",
    });
    if (it.sub) p.text(it.sub, r, y + 134, { size: 21, color: T.slate, max: r - l });
    const subH = b.items.some((i) => i.sub) ? LAYOUT.tileSub : 0;
    if (it.bar) partBar(p, it.bar, l, r, y + LAYOUT.tiles + subH + 2, 14);
  });
}

/**
 * How many paid each month: 12 columns on a soft grey track as tall as the members, the paid part
 * green, the count above. A month not started yet: only its paid part (paid ahead), no track, or
 * nothing when nobody paid it. January on the right.
 */
function drawCounts(p: Pen, b: Extract<Block, { t: "counts" }>, y: number, o: DrawOptions) {
  const R = o.size.w - LAYOUT.pad;
  const P = LAYOUT.pad;
  const slot = (R - P) / 12;
  const top = y + 46;
  const base = y + LAYOUT.counts - 48;
  const x = p.x;
  b.months.forEach((m, i) => {
    const cx = R - (i + 0.5) * slot;
    const bw = slot * 0.56;
    // a month not started yet shows only what is already paid in it (no grey: nobody is late)
    if (m.started || m.paid > 0) {
      if (m.started) {
        x.fillStyle = T.stone;
        x.beginPath();
        x.roundRect(cx - bw / 2, top, bw, base - top, [8, 8, 0, 0]);
        x.fill();
      }
      const k = m.of > 0 ? Math.min(1, m.paid / m.of) : 0;
      const h = Math.round((base - top) * k);
      if (h > 0) {
        x.fillStyle = T.green;
        x.beginPath();
        x.roundRect(cx - bw / 2, base - h, bw, h, h >= 8 ? [8, 8, 0, 0] : 0);
        x.fill();
      }
      p.text(formatNumber(m.paid), cx, top - 12, {
        size: 22,
        weight: 700,
        face: "display",
        color: T.ink,
        align: "center",
        dir: "ltr",
      });
    }
    p.text(String(i + 1), cx, base + 34, {
      size: 20,
      color: T.slate,
      align: "center",
      face: "display",
      dir: "ltr",
    });
  });
  x.strokeStyle = LINE;
  x.lineWidth = 1.5;
  x.beginPath();
  x.moveTo(P, base);
  x.lineTo(R, base);
  x.stroke();
}

/** Break a paragraph into lines that fit `width` at `size` px. */
function wrap(p: Pen, text: string, width: number, size: number): string[] {
  p.x.font = `400 ${size}px sans-serif`;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && p.x.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Header row in the brand tint, rounded outer corners, soft inner lines. */
function frame(p: Pen, top: number, bottom: number, o: DrawOptions, vx: number[], rows: number[]) {
  const x = p.x;
  const R = o.size.w - LAYOUT.pad;
  const P = LAYOUT.pad;
  x.fillStyle = T.greenTint;
  x.beginPath();
  x.roundRect(P, top, R - P, LAYOUT.tableHead, [CORNER, CORNER, 0, 0]);
  x.fill();
  x.strokeStyle = ROW_LINE;
  x.lineWidth = 1.5;
  x.beginPath();
  for (const ry of rows) {
    x.moveTo(P, ry);
    x.lineTo(R, ry);
  }
  x.stroke();
  x.strokeStyle = LINE;
  x.beginPath();
  for (const cx of vx) {
    x.moveTo(cx, top);
    x.lineTo(cx, bottom);
  }
  x.stroke();
  x.lineWidth = 2;
  x.strokeStyle = EDGE;
  x.beginPath();
  x.roundRect(P, top, R - P, bottom - top, CORNER);
  x.stroke();
}

function drawTable(p: Pen, b: Extract<Block, { t: "table" }>, y: number, o: DrawOptions) {
  const R = o.size.w - LAYOUT.pad;
  const P = LAYOUT.pad;
  const n = b.head.length;
  const W = R - P;
  // given widths, or: the first column (a name) takes what the others leave (they share ≤ 55%)
  const other = n > 1 ? Math.min(190, Math.floor((W * 0.55) / (n - 1))) : 0;
  const widths = b.widths
    ? b.widths.map((f) => Math.round(f * W))
    : [W - other * (n - 1), ...Array<number>(Math.max(0, n - 1)).fill(other)];
  const firstW = widths[0];
  const colR = (i: number) => R - widths.slice(0, i).reduce((s, v) => s + v, 0);
  const colW = (i: number) => widths[i];
  const colC = (i: number) => colR(i) - colW(i) / 2;
  const rows = [...b.rows, ...(b.foot ? [b.foot] : [])];
  const bottom = y + LAYOUT.tableHead + rows.length * LAYOUT.tableRow;
  frame(
    p,
    y,
    bottom,
    o,
    Array.from({ length: n - 1 }, (_, i) => colR(i + 1)),
    rows.map((_, i) => y + LAYOUT.tableHead + i * LAYOUT.tableRow),
  );
  const head = { size: 22, weight: 700, color: T.forest } as const;
  b.head.forEach((t, i) =>
    i === 0
      ? p.text(t, R - 16, y + 34, { ...head, max: firstW - 24 })
      : p.text(t, colC(i), y + 34, { ...head, align: "center", max: colW(i) - 12 }),
  );
  rows.forEach((row, r) => {
    const yy = y + LAYOUT.tableHead + r * LAYOUT.tableRow + 37;
    const bold = !!b.foot && r === rows.length - 1;
    row.forEach((cell, i) => {
      if (!cell) return;
      const isNum = b.num?.[i];
      const o2 = { size: 24, weight: bold ? 700 : isNum ? 600 : 400, color: T.ink } as const;
      if (i === 0) p.text(cell, R - 16, yy, { ...o2, max: firstW - 24 });
      else if (cell === "✓") okMark(p, colC(i), yy - 8, 12);
      else
        p.text(cell, colC(i), yy, {
          ...o2,
          align: "center",
          face: isNum ? "display" : "body",
          dir: isNum ? "ltr" : "rtl",
          max: colW(i) - 12,
        });
    });
  });
}

/** The paper grid: «الاسم | 1…12», roomy rows, a ✓ in each paid month, empty otherwise. */
function drawGrid(p: Pen, b: Extract<Block, { t: "grid" }>, y: number, o: DrawOptions) {
  const R = o.size.w - LAYOUT.pad;
  const P = LAYOUT.pad;
  const cell = 40;
  const monthsR = P + 12 * cell;
  const nameR = R - 22;
  const cx = (k: number) => monthsR - (k - 0.5) * cell;
  const row = gridRow(o.size);
  const rowsTop = y + LAYOUT.tableHead;
  const bottom = rowsTop + b.rows.length * row;
  frame(
    p,
    y,
    bottom,
    o,
    Array.from({ length: 12 }, (_, i) => P + (i + 1) * cell),
    b.rows.map((_, i) => rowsTop + i * row),
  );
  const head = { size: 22, weight: 700, color: T.forest } as const;
  p.text("الاسم", nameR, y + 34, head);
  for (let k = 1; k <= 12; k++)
    p.text(String(k), cx(k), y + 34, { ...head, face: "display", align: "center", dir: "ltr" });
  b.rows.forEach((m, i) => {
    const mid = rowsTop + i * row + row / 2;
    p.text(m.name, nameR, mid + 10, { size: 28, weight: 600, max: nameR - monthsR - 16 });
    for (let k = 1; k <= 12; k++) if (m.paid[k - 1]) okMark(p, cx(k), mid, 12);
  });
}

/** One member's year: two rows of six months (names), a ✓ under each paid one. */
function drawMonths(p: Pen, b: Extract<Block, { t: "months" }>, y: number, o: DrawOptions) {
  const R = o.size.w - LAYOUT.pad;
  const P = LAYOUT.pad;
  const cw = (R - P) / 6;
  const names = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو"];
  const names2 = ["يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  [names, names2].forEach((ns, half) => {
    const top = y + half * 104;
    frame(
      p,
      top,
      top + 100,
      o,
      Array.from({ length: 5 }, (_, i) => R - (i + 1) * cw),
      [top + LAYOUT.tableHead],
    );
    ns.forEach((name, i) => {
      const c = R - (i + 0.5) * cw;
      p.text(name, c, top + 34, { size: 22, weight: 700, color: T.forest, align: "center" });
      if (b.paid[half * 6 + i]) okMark(p, c, top + LAYOUT.tableHead + 24, 12);
    });
  });
}

/** Twelve bars (January on the right, like the months grid), month numbers under them. */
function drawBars(p: Pen, b: Extract<Block, { t: "bars" }>, y: number, o: DrawOptions) {
  const R = o.size.w - LAYOUT.pad;
  const P = LAYOUT.pad;
  const slot = (R - P) / 12;
  const base = y + LAYOUT.bars - 44;
  const top = y + 12;
  const max = Math.max(...b.values, 1);
  b.values.forEach((v, i) => {
    const cx = R - (i + 0.5) * slot;
    const h = Math.round(((base - top) * Math.max(0, v)) / max);
    if (h > 0) {
      p.x.fillStyle = T.green; // the month labels below change the fill colour
      p.x.beginPath();
      p.x.roundRect(cx - slot * 0.3, base - h, slot * 0.6, h, [6, 6, 0, 0]);
      p.x.fill();
    }
    p.text(String(i + 1), cx, base + 32, {
      size: 20,
      color: T.slate,
      align: "center",
      face: "display",
      dir: "ltr",
    });
  });
  p.x.strokeStyle = LINE;
  p.x.lineWidth = 1.5;
  p.x.beginPath();
  p.x.moveTo(P, base);
  p.x.lineTo(R, base);
  p.x.stroke();
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
