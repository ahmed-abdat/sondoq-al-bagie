/**
 * Sharing the fund report in the WhatsApp group.
 * - «ملخص الصندوق»: one 1080×1350 PNG card (the cover), with a wa.me text fallback.
 * - The whole report as a set of 1080×1350 PNG pages in one share, or as an A4 PDF.
 * The pages (report-pages.ts) and the PDF writer are loaded only when asked for.
 * Drawing and text are pure and testable; see canvas-share.ts for the browser part.
 */
import {
  appFonts,
  downloadPng,
  loadImage,
  renderPng,
  shareImage,
  type CanvasFonts,
  type ShareImageOptions,
  type ShareNavigator,
  type ShareResult,
} from "./canvas-share";
import type { ReportData } from "./data/types";
import { formatDay, monthName } from "./dates";
import { formatNumber } from "./format";
import { ASSOC_NAME, FUND_NAME } from "./share-receipt";

/** What the cover draws. Built from Lane A's ReportData with `reportSummary()`. */
export interface ReportSummaryData {
  /** e.g. «الدورة 2»; optional. */
  termLabel?: string | null;
  year: number;
  /** All amounts in old ouguiya (MRO). carried + moneyIn − moneyOut (+ adjustments) = balance. */
  balance: number;
  carried: number;
  moneyIn: number;
  moneyOut: number;
  /** «فرق عند التسليم», signed; already inside `balance`. */
  adjustments: number;
  collectedThisYear: number;
  spentThisYear: number;
  /** «X من N دفعوا رسوم <month>» */
  paidCount: number;
  activeCount: number;
  /** 1–12: the month the paid count is about (usually the current one). */
  month: number;
  /** Per month of `year`; missing months count as zero. */
  months: { month: number; expected: number; collected: number }[];
  /** «28 سبتمبر 2026». */
  asOfLabel: string;
  /** Paid this month per member list («المجموعة أ: 11 من 20»); the summary card shows them. */
  groups?: { label: string; paid: number; active: number }[];
}

/** What the report renderers take (Lane A's ReportData, with the monthly fee per list). */
export type ReportInput = ReportData;

export const REPORT_W = 1080;
export const REPORT_H = 1350;

/* ─────────────── text & numbers (pure) ─────────────── */

/**
 * ReportData → cover. «X من N» counts active members paid for the current month (as of
 * `generatedAt`); for a past year's report, December.
 */
export function reportSummary(r: ReportData): ReportSummaryData {
  const asOf = r.generatedAt;
  const nowYear = Number(asOf.slice(0, 4));
  const month = r.year < nowYear ? 12 : Number(asOf.slice(5, 7));
  const active = r.members.filter((m) => m.status === "active");
  const isPaid = (m: ReportData["members"][number]) =>
    m.months[month - 1] === "paid" || m.months[month - 1] === "prepaid";
  const paid = active.filter(isPaid);
  const lists = [...new Set(active.map((m) => m.memberRef.split("-")[0]))].sort();
  const s = r.summary;
  return {
    termLabel: r.term?.title ?? (s.termNumber ? `الدورة ${s.termNumber}` : null),
    year: r.year,
    balance: s.balance,
    carried: s.openingBalance,
    moneyIn: s.moneyIn + s.transfersIn,
    moneyOut: s.moneyOut,
    adjustments: s.adjustments,
    collectedThisYear: s.collectedThisYear,
    spentThisYear: s.spentThisYear,
    paidCount: paid.length,
    activeCount: active.length,
    month,
    months: r.monthly.map(({ month, expected, collected }) => ({ month, expected, collected })),
    asOfLabel: formatDay(asOf, { year: true }),
    groups: lists.map((l) => {
      const inList = active.filter((m) => m.memberRef.split("-")[0] === l);
      const label = l === "A" ? "أ" : l === "B" ? "ب" : l;
      return {
        label: `المجموعة ${label}`,
        paid: inList.filter(isPaid).length,
        active: inList.length,
      };
    }),
  };
}

/** Bar labels: «30 ألف», «7.5 ألف», «800». */
export function compactAmount(n: number): string {
  if (Math.abs(n) < 1000) return formatNumber(n);
  const k = n / 1000;
  const t = Math.abs(k) < 10 ? Math.round(k * 10) / 10 : Math.round(k);
  return `${formatNumber(t)} ألف`;
}

/** The share functions take Lane A's ReportData as is (or an already-built cover). */
export type ReportSource = ReportData | ReportSummaryData;

export const toCard = (d: ReportSource): ReportSummaryData =>
  "summary" in d ? reportSummary(d) : d;

export function paidLine(d: Pick<ReportSummaryData, "paidCount" | "activeCount" | "month">) {
  return `${d.paidCount} من ${d.activeCount} دفعوا رسوم ${monthName(d.month)}`;
}

/** «سنة 2026 · الدورة 2» */
export function yearLine(d: Pick<ReportSummaryData, "year" | "termLabel">): string {
  return [`سنة ${d.year}`, d.termLabel].filter(Boolean).join(" · ");
}

/** Share page: `<origin>/report`. */
export function reportUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/report`;
}

/**
 * The public site for links printed on shared images: the production URL (set at build time in
 * next.config.ts), never localhost or a preview; the page's own origin only as a last resort.
 */
export function publicOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_ORIGIN || location.origin;
}

export function reportFileName(year: number, month: number): string {
  return `ملخص-صندوق-الشباب-${year}-${String(month).padStart(2, "0")}.png`;
}

/** «تقرير-صندوق-الشباب-2026-09-28» from the report's date (+ «-1.png» per page, or «.pdf»). */
export function reportFileBase(iso: string): string {
  return `تقرير-صندوق-الشباب-${iso.slice(0, 10)}`;
}

export function reportShareText(src: ReportSource, url: string): string {
  const d = toCard(src);
  return [
    `*ملخص ${FUND_NAME}*`,
    d.termLabel ?? ASSOC_NAME,
    "",
    `في الصندوق الآن: ${formatNumber(d.balance)} أوقية`,
    `جُمع هذا العام: ${formatNumber(d.collectedThisYear)} أوقية`,
    `صُرف هذا العام: ${formatNumber(d.spentThisYear)} أوقية`,
    paidLine(d),
    `حتى ${d.asOfLabel}`,
    "",
    `التفاصيل: ${url}`,
  ].join("\n");
}

/**
 * 12 bars (Jan … Dec): height ∝ collected, on a common scale (the largest of expected/collected),
 * so a full month reaches the top. Returns fractions 0..1 for collected and expected.
 */
export function monthBars(
  months: ReportSummaryData["months"],
): { month: number; collected: number; expected: number }[] {
  const by = new Map(months.map((m) => [m.month, m]));
  const top = Math.max(1, ...months.map((m) => Math.max(m.expected, m.collected)));
  return Array.from({ length: 12 }, (_, i) => {
    const m = by.get(i + 1);
    return {
      month: i + 1,
      collected: m ? Math.min(1, Math.max(0, m.collected / top)) : 0,
      expected: m ? Math.min(1, Math.max(0, m.expected / top)) : 0,
    };
  });
}

/* ─────────────── drawing kit (shared with report-pages.ts) ─────────────── */

/** DESIGN.md colours. */
export const T = {
  forestDeep: "#0E3A1B",
  forest: "#1A5F2E",
  green: "#237A3B",
  greenMist: "#CFE7D4",
  greenTint: "#E7F3EA",
  greenWash: "#F3F9F4",
  gold: "#D9AA2B",
  goldTrack: "#F1EAD6",
  goldTint: "#F6EFD9",
  goldInk: "#6E5410",
  paper: "#FFFFFF",
  mist: "#F2F4F3",
  stone: "#E8ECEA",
  pebble: "#CDD5D0",
  slate: "#4F5C55",
  ink: "#14201A",
  onGreen: "#EEF5EF",
} as const;

export interface TextOpts {
  size: number;
  weight?: number;
  /** display = Alexandria (titles, every number), body = Noto Sans Arabic. */
  face?: "display" | "body";
  color?: string;
  align?: CanvasTextAlign;
  dir?: CanvasDirection;
  /** Shrink down to 82% of `size`, then cut with «…», to fit this width. */
  max?: number;
}

export type Pen = ReturnType<typeof makePen>;

export function makePen(x: CanvasRenderingContext2D, fonts: CanvasFonts) {
  const font = (size: number, weight = 400, face: TextOpts["face"] = "body") =>
    `${weight} ${size}px ${face === "display" ? fonts.display : fonts.body}`;

  /** Draws `t` and returns its width. */
  function text(t: string, px: number, y: number, o: TextOpts): number {
    let size = o.size;
    x.direction = o.dir ?? "rtl";
    x.textAlign = o.align ?? "right";
    x.fillStyle = o.color ?? T.ink;
    x.font = font(size, o.weight, o.face);
    let s = t;
    if (o.max) {
      const min = Math.round(o.size * 0.82);
      while (x.measureText(s).width > o.max && size > min) x.font = font(--size, o.weight, o.face);
      if (x.measureText(s).width > o.max) {
        while (s.length > 1 && x.measureText(`${s}…`).width > o.max) s = s.slice(0, -1);
        s = `${s.trimEnd()}…`;
      }
    }
    x.fillText(s, px, y);
    return x.measureText(s).width;
  }

  function box(
    bx: number,
    by: number,
    bw: number,
    bh: number,
    r: number | number[],
    color: string,
  ) {
    x.fillStyle = color;
    x.beginPath();
    x.roundRect(bx, by, bw, bh, r);
    x.fill();
  }

  function dot(cx: number, cy: number, r: number, color: string) {
    x.fillStyle = color;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
  }

  /** A number in Alexandria, LTR, its right edge at `right`; «أوقية» to its left if `unit`. */
  function amount(
    n: number,
    right: number,
    y: number,
    o: { size: number; color: string; weight?: number; unit?: { size: number; color: string } },
  ): number {
    const w = text(formatNumber(n), right, y, {
      size: o.size,
      weight: o.weight ?? 800,
      face: "display",
      color: o.color,
      dir: "ltr",
      align: "right",
    });
    if (!o.unit) return right - w;
    const uw = text("أوقية", right - w - 14, y, {
      size: o.unit.size,
      weight: 600,
      color: o.unit.color,
    });
    return right - w - 14 - uw;
  }

  /** Round logo on a white disc, centred at (cx, cy). */
  function logo(img: CanvasImageSource | null | undefined, cx: number, cy: number, r: number) {
    dot(cx, cy, r, T.paper);
    if (!img) return;
    x.save();
    x.beginPath();
    x.arc(cx, cy, r - 4, 0, Math.PI * 2);
    x.clip();
    x.drawImage(img, cx - r + 4, cy - r + 4, (r - 4) * 2, (r - 4) * 2);
    x.restore();
  }

  /** Page footer: «صندوق الرابطة · الصفحة 2 من 6 · حتى …» on the right, the link on the left. */
  function footer(w: number, h: number, label: string, url: string, pad = 64) {
    const y = h - 44;
    const uw = url
      ? text(url.replace(/^https?:\/\//, ""), pad, y, {
          size: 22,
          weight: 500,
          face: "display",
          color: T.forest,
          dir: "ltr",
          align: "left",
        })
      : 0;
    text(label, w - pad, y, { size: 22, color: T.slate, max: w - pad * 2 - uw - 32 });
  }

  return { x, font, text, box, dot, amount, logo, footer };
}

export interface ReportDrawOptions {
  url: string;
  fonts: CanvasFonts;
  logo?: CanvasImageSource | null;
  /** Page height: 1350 (phone) or the PDF page's. Width is always 1080. */
  height?: number;
  /** Footer text; default «صندوق الرابطة · حتى <date>». */
  footer?: string;
  /**
   * "card" (default): the summary image shared alone, ending with paid counts per list and
   * «ابحث عن اسمك». "cover": first page of the full report, ending with the 12 month bars.
   */
  variant?: "card" | "cover";
}

/** The cover / summary card: hero with the balance and how it is made, then who paid. */
export function drawReportSummary(
  x: CanvasRenderingContext2D,
  d: ReportSummaryData,
  o: ReportDrawOptions,
): void {
  const W = REPORT_W;
  const H = o.height ?? REPORT_H;
  const P = 64;
  const R = W - P;
  const p = makePen(x, o.fonts);
  const card = (o.variant ?? "card") === "card";

  x.fillStyle = T.paper;
  x.fillRect(0, 0, W, H);

  // Hero
  const heroH = 700;
  p.box(0, 0, W, heroH, [0, 0, 48, 48], T.green);
  p.logo(o.logo, R - 60, 120, 60);
  p.text(FUND_NAME, R - 144, 112, { size: 44, weight: 700, face: "display", color: T.paper });
  p.text(ASSOC_NAME, R - 144, 160, { size: 26, color: T.onGreen });
  p.text("ملخص الصندوق", P, 112, {
    size: 28,
    weight: 700,
    face: "display",
    color: T.greenMist,
    align: "left",
  });
  p.text(yearLine(d), P, 158, { size: 26, color: T.onGreen, align: "left" });

  p.text("في الصندوق الآن", R, 296, { size: 32, weight: 600, color: T.onGreen });
  p.amount(d.balance, R, 432, {
    size: 132,
    color: T.paper,
    unit: { size: 44, color: T.onGreen },
  });

  // carried + collected − spent, three columns
  const colW = (R - P) / 3;
  const stats: [string, number][] = [
    ["رصيد مرحّل", d.carried],
    ["جُمع", d.moneyIn],
    ["صُرف", d.moneyOut],
  ];
  stats.forEach(([label, n], i) => {
    const cr = R - i * colW;
    p.text(label, cr, 540, { size: 26, color: T.onGreen });
    p.amount(n, cr, 600, { size: 48, weight: 700, color: T.paper });
  });
  if (d.adjustments !== 0) {
    const kind = d.adjustments > 0 ? "زيادة" : "نقص";
    p.text(`فرق عند التسليم: ${kind} ${formatNumber(Math.abs(d.adjustments))} أوقية`, R, 656, {
      size: 24,
      color: T.greenMist,
    });
  }

  // Paid this month + progress
  const py = heroH + 104;
  p.text(paidLine(d), R, py, { size: 40, weight: 700, face: "display" });
  const bar = (y: number, h: number, paid: number, of: number) => {
    const f = of > 0 ? Math.min(1, paid / of) : 0;
    p.box(P, y, R - P, h, h / 2, T.stone);
    if (f > 0) p.box(R - (R - P) * f, y, (R - P) * f, h, h / 2, T.green);
  };
  bar(py + 32, 20, d.paidCount, d.activeCount);

  if (card) {
    // Paid per list, then where to look yourself up
    let gy = py + 150;
    for (const g of d.groups ?? []) {
      p.text(`${g.label}: ${g.paid} من ${g.active}`, R, gy, {
        size: 32,
        weight: 700,
        face: "display",
      });
      bar(gy + 24, 12, g.paid, g.active);
      gy += 96;
    }
    const cy = H - 92 - 40;
    const lw = p.text("ابحث عن اسمك:", R, cy, {
      size: 30,
      weight: 700,
      face: "display",
      color: T.forest,
    });
    p.text(o.url.replace(/^https?:\/\//, ""), R - lw - 14, cy, {
      size: 30,
      weight: 600,
      face: "display",
      color: T.forest,
      dir: "ltr",
      align: "right",
      max: R - lw - 14 - P,
    });
    p.footer(W, H, o.footer ?? `${FUND_NAME} · حتى ${d.asOfLabel}`, "", P);
    return;
  }

  // 12 month bars, January on the right (reading order)
  const ty = py + 148;
  p.text(`ما جُمع كل شهر في ${d.year}`, R, ty, { size: 28, weight: 600, color: T.slate });
  const top = ty + 64;
  const base = H - 92 - 56;
  const bh = base - top;
  const gap = 16;
  const bw = (R - P - gap * 11) / 12;
  const bars = monthBars(d.months);
  const tallest = bars.reduce((a, b) => (b.collected > a.collected ? b : a), bars[0]);
  bars.forEach((b, i) => {
    const bx = R - (i + 1) * bw - i * gap;
    const now = b.month === d.month;
    p.box(bx, top, bw, bh, 14, T.mist);
    if (b.expected > 0) p.box(bx, base - bh * b.expected, bw, bh * b.expected, 14, T.greenTint);
    const h = b.collected > 0 ? Math.max(14, bh * b.collected) : 0;
    // months after the current one (paid ahead) in a lighter green
    const later = b.month > d.month;
    if (h) p.box(bx, base - h, bw, h, 14, now ? T.forestDeep : later ? T.greenMist : T.green);
    if ((now || b === tallest) && b.collected > 0) {
      const amount = d.months.find((m) => m.month === b.month)?.collected ?? 0;
      p.text(compactAmount(amount), bx + bw / 2, base - h - 12, {
        size: 20,
        weight: 700,
        face: "display",
        color: now ? T.forestDeep : T.ink,
        align: "center",
      });
    }
    p.text(String(b.month), bx + bw / 2, base + 38, {
      size: 24,
      weight: now ? 800 : 600,
      face: "display",
      color: now ? T.forestDeep : T.slate,
      align: "center",
      dir: "ltr",
    });
  });

  p.footer(W, H, o.footer ?? `${FUND_NAME} · حتى ${d.asOfLabel}`, o.url, P);
}

/* ─────────────── browser ─────────────── */

async function drawKit(): Promise<{ fonts: CanvasFonts; logo: HTMLImageElement | null }> {
  const [fonts, logo] = await Promise.all([
    appFonts(),
    loadImage("/icons/icon-512.png").catch(() => null),
  ]);
  return { fonts, logo };
}

export async function renderReportSummaryPng(
  d: ReportSource,
  url = reportUrl(publicOrigin()),
): Promise<Blob> {
  const card = toCard(d);
  const { fonts, logo } = await drawKit();
  // Already 1080 px wide: draw at 1×.
  return renderPng(REPORT_W, REPORT_H, 1, (ctx) =>
    drawReportSummary(ctx, card, { url, fonts, logo }),
  );
}

export type { ShareResult };

/** Share the summary card (share sheet with PNG + text; else WhatsApp text with the link). */
export async function shareReportSummary(
  d: ReportSource,
  url = reportUrl(publicOrigin()),
  opts: ShareImageOptions = {},
): Promise<ShareResult> {
  const card = toCard(d);
  return shareImage(
    () => renderReportSummaryPng(card, url),
    reportFileName(card.year, card.month),
    reportShareText(card, url),
    opts,
  );
}

export async function saveReportSummaryPng(d: ReportSource): Promise<void> {
  const card = toCard(d);
  downloadPng(await renderReportSummaryPng(card), reportFileName(card.year, card.month));
}

/* ─────────────── the whole report: PNG pages / PDF ─────────────── */

type Prepared = { pages?: Promise<File[]>; pdf?: Promise<File> };
const prepared = new WeakMap<ReportInput, Prepared>();
const slot = (d: ReportInput) => {
  let s = prepared.get(d);
  if (!s) prepared.set(d, (s = {}));
  return s;
};

/** The report as 1080×1350 PNG files, one per page (rendered once per ReportInput). */
export function reportPageFiles(d: ReportInput, url = reportUrl(publicOrigin())): Promise<File[]> {
  const s = slot(d);
  s.pages ??= (async () => {
    const pages = await import("./report-pages");
    const { fonts, logo } = await drawKit();
    const base = reportFileBase(d.generatedAt);
    const blobs = await pages.renderReportPages(d, { url, fonts, logo });
    return blobs.map((b, i) => new File([b], `${base}-${i + 1}.png`, { type: "image/png" }));
  })();
  s.pages.catch(() => (s.pages = undefined));
  return s.pages;
}

/** The report as an A4 PDF (the same pages at A4 ratio, as JPEG), built on the phone. */
export function reportPdfFile(d: ReportInput, url = reportUrl(publicOrigin())): Promise<File> {
  const s = slot(d);
  s.pdf ??= (async () => {
    const [pages, { jpegsToPdf, A4_PT }] = await Promise.all([
      import("./report-pages"),
      import("./pdf"),
    ]);
    const { A4_PAGE } = pages;
    const { fonts, logo } = await drawKit();
    const scale = 1; // 1080 × 1575 px inside a 10 mm margin: about 140 dpi, under 1 MB
    const blobs = await pages.renderReportPages(d, {
      url,
      fonts,
      logo,
      size: A4_PAGE,
      scale,
      type: "image/jpeg",
      quality: 0.7,
    });
    const jpegs = await Promise.all(
      blobs.map(async (b) => ({
        jpeg: new Uint8Array(await b.arrayBuffer()),
        w: Math.round(A4_PAGE.w * scale),
        h: Math.round(A4_PAGE.h * scale),
      })),
    );
    const pdf = jpegsToPdf(jpegs, {
      title: `تقرير ${FUND_NAME} ${d.year}`,
      margin: (10 / 25.4) * 72,
      ...A4_PT,
    });
    return new File([pdf as BlobPart], `${reportFileBase(d.generatedAt)}.pdf`, {
      type: "application/pdf",
    });
  })();
  s.pdf.catch(() => (s.pdf = undefined));
  return s.pdf;
}

/** The report pages as PNG blobs (the share sheet's preview); same cache as the share. */
export async function renderReportPages(d: ReportInput, url?: string): Promise<Blob[]> {
  return reportPageFiles(d, url);
}

/** Start rendering in the background (call when the share sheet opens), so the tap shares at once. */
export function prepareReportShare(d: ReportInput, url?: string): void {
  reportPageFiles(d, url).catch(() => {});
}

async function shareFiles(
  files: File[],
  text: string,
  nav: ShareNavigator,
): Promise<ShareResult | null> {
  if (typeof nav.share !== "function" || !nav.canShare?.({ files })) return null;
  try {
    await nav.share({ files, text });
    return "shared";
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    if (e instanceof DOMException && e.name === "NotAllowedError") return "retry";
    return null;
  }
}

/**
 * Every page as PNG in one share (WhatsApp takes several images at once). If the phone cannot
 * share files: the summary card alone, else WhatsApp text with the link.
 */
export async function shareReportImages(
  d: ReportInput,
  url = reportUrl(publicOrigin()),
  opts: ShareImageOptions = {},
): Promise<ShareResult> {
  const nav = opts.nav ?? (navigator as ShareNavigator);
  if (typeof nav.share === "function" && nav.canShare) {
    const files = await reportPageFiles(d, url).catch(() => null);
    const res = files && (await shareFiles(files, reportShareText(d, url), nav));
    if (res) return res;
  }
  return shareReportSummary(d, url, opts);
}

/** Build the PDF on the phone. */
export async function buildReportPdf(d: ReportInput, url?: string): Promise<Blob> {
  return reportPdfFile(d, url);
}

/** Share the PDF through the share sheet; if files cannot be shared, download it. */
export async function shareReportPdf(
  d: ReportInput,
  url = reportUrl(publicOrigin()),
  opts: { nav?: ShareNavigator; download?: (b: Blob, name: string) => void } = {},
): Promise<ShareResult | "downloaded"> {
  const nav = opts.nav ?? (navigator as ShareNavigator);
  const file = await reportPdfFile(d, url);
  const res = await shareFiles([file], reportShareText(d, url), nav);
  if (res) return res;
  (opts.download ?? downloadPng)(file, file.name);
  return "downloaded";
}
