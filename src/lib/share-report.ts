/**
 * «ملخص الصندوق»: a 1080×1350 PNG card (Instagram/WhatsApp portrait) of the fund's public
 * numbers, shared through the phone's share sheet, with a wa.me text fallback.
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
  type ShareResult,
} from "./canvas-share";
import type { ReportData } from "./data/types";
import { formatDay, monthName } from "./dates";
import { formatNumber } from "./format";
import { ASSOC_NAME, FUND_NAME } from "./share-receipt";

/** What the card draws. Build it from Lane A's ReportData with `reportSummary()`. */
export interface ReportSummaryData {
  /** e.g. «الدورة 2026» or «2026 – 2027»; optional. */
  termLabel?: string | null;
  year: number;
  /** All amounts in old ouguiya (MRO). */
  balance: number;
  collectedThisYear: number;
  spentThisYear: number;
  /** «X من N دفعوا رسوم <month>» */
  paidCount: number;
  activeCount: number;
  /** 1–12: the month the paid count is about (usually the current one). */
  month: number;
  /** Per month of `year`; missing months count as zero. */
  months: { month: number; expected: number; collected: number }[];
  /** «الأحد 5 أكتوبر 2026». */
  asOfLabel: string;
}

export const REPORT_W = 1080;
export const REPORT_H = 1350;

/* ─────────────── text & numbers (pure) ─────────────── */

/**
 * ReportData → card. «X من N» counts active members paid for the current month (as of
 * `generatedAt`); for a past year's report, December.
 */
export function reportSummary(r: ReportData): ReportSummaryData {
  const asOf = r.generatedAt;
  const nowYear = Number(asOf.slice(0, 4));
  const month = r.year < nowYear ? 12 : Number(asOf.slice(5, 7));
  const active = r.members.filter((m) => m.status === "active");
  const paid = active.filter((m) => {
    const s = m.months[month - 1];
    return s === "paid" || s === "prepaid";
  });
  return {
    termLabel: r.term?.title ?? (r.summary.termNumber ? `الدورة ${r.summary.termNumber}` : null),
    year: r.year,
    balance: r.summary.balance,
    collectedThisYear: r.summary.collectedThisYear,
    spentThisYear: r.summary.spentThisYear,
    paidCount: paid.length,
    activeCount: active.length,
    month,
    months: r.monthly.map(({ month, expected, collected }) => ({ month, expected, collected })),
    asOfLabel: formatDay(asOf, { year: true, weekday: true }),
  };
}

export function paidLine(d: Pick<ReportSummaryData, "paidCount" | "activeCount" | "month">) {
  return `${d.paidCount} من ${d.activeCount} دفعوا رسوم ${monthName(d.month)}`;
}

/** The share functions take Lane A's ReportData as is (or an already-built card). */
export type ReportSource = ReportData | ReportSummaryData;

const toCard = (d: ReportSource): ReportSummaryData => ("summary" in d ? reportSummary(d) : d);

/** Share page: `<origin>/report`. */
export function reportUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/report`;
}

export function reportFileName(year: number, month: number): string {
  return `ملخص-صندوق-الشباب-${year}-${String(month).padStart(2, "0")}.png`;
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

/* ─────────────── drawing ─────────────── */

const C = {
  forest: "#1A5F2E",
  forestDeep: "#0E3A1B",
  onGreen: "#DDEFE1",
  mist: "#CFE7D4",
  wash: "#F3F9F4",
  track: "#E4ECE6",
  ink: "#14201A",
  muted: "#4F5C55",
  gold: "#C9A227",
};

type Ctx = Pick<
  CanvasRenderingContext2D,
  | "fillRect"
  | "fillText"
  | "measureText"
  | "beginPath"
  | "arc"
  | "fill"
  | "clip"
  | "save"
  | "restore"
  | "drawImage"
  | "roundRect"
> & {
  fillStyle: CanvasRenderingContext2D["fillStyle"];
  font: string;
  textAlign: CanvasTextAlign;
  direction: CanvasDirection;
};

export interface ReportDrawOptions {
  url: string;
  fonts: CanvasFonts;
  logo?: CanvasImageSource | null;
}

export function drawReportSummary(x: Ctx, d: ReportSummaryData, o: ReportDrawOptions): void {
  const W = REPORT_W;
  const P = 72; // side padding
  const R = W - P;
  const { display: fd, body: fb } = o.fonts;
  const txt = (
    t: string,
    y: number,
    font: string,
    color = C.ink,
    xx = R,
    align: CanvasTextAlign = "right",
  ) => {
    x.direction = "rtl";
    x.font = font;
    x.fillStyle = color;
    x.textAlign = align;
    x.fillText(t, xx, y);
  };
  const box = (bx: number, by: number, bw: number, bh: number, r: number, color: string) => {
    x.fillStyle = color;
    x.beginPath();
    x.roundRect(bx, by, bw, bh, r);
    x.fill();
  };
  /** Amount + «أوقية» right-aligned at `right`. */
  const amount = (
    n: number,
    y: number,
    size: number,
    color: string,
    unitColor: string,
    right = R,
  ) => {
    const s = formatNumber(n);
    x.direction = "ltr";
    x.font = `800 ${size}px ${fd}`;
    const w = x.measureText(s).width;
    x.fillStyle = color;
    x.textAlign = "left";
    x.fillText(s, right - w, y);
    txt("أوقية", y, `600 ${Math.round(size * 0.36)}px ${fb}`, unitColor, right - w - 18);
  };

  // Background + green head
  x.fillStyle = C.wash;
  x.fillRect(0, 0, W, REPORT_H);
  x.fillStyle = C.forest;
  x.fillRect(0, 0, W, 560);

  // Brand row
  if (o.logo) {
    x.save();
    x.beginPath();
    x.arc(R - 56, 124, 60, 0, Math.PI * 2);
    x.fillStyle = "#fff";
    x.fill();
    x.clip();
    x.drawImage(o.logo, R - 116, 64, 120, 120);
    x.restore();
  }
  txt(FUND_NAME, 118, `700 44px ${fd}`, "#fff", R - 140);
  txt(d.termLabel ?? ASSOC_NAME, 168, `400 28px ${fb}`, C.onGreen, R - 140);
  txt("ملخص الصندوق", 124, `700 30px ${fd}`, C.mist, P, "left");

  // Balance
  txt("في الصندوق الآن", 300, `500 34px ${fb}`, C.onGreen);
  amount(d.balance, 440, 132, "#fff", C.onGreen);

  // Two stat cards
  const cardW = (W - P * 2 - 32) / 2;
  const cy = 520;
  box(R - cardW, cy, cardW, 170, 32, "#fff");
  box(P, cy, cardW, 170, 32, "#fff");
  txt(`جُمع في ${d.year}`, cy + 60, `500 28px ${fb}`, C.muted, R - 36);
  amount(d.collectedThisYear, cy + 132, 56, C.forest, C.muted, R - 36);
  txt(`صُرف في ${d.year}`, cy + 60, `500 28px ${fb}`, C.muted, P + cardW - 36);
  amount(d.spentThisYear, cy + 132, 56, C.ink, C.muted, P + cardW - 36);

  // Paid this month + progress
  const py = 790;
  txt(paidLine(d), py, `700 38px ${fd}`);
  const frac = d.activeCount > 0 ? Math.min(1, d.paidCount / d.activeCount) : 0;
  box(P, py + 30, W - P * 2, 20, 10, C.track);
  if (frac > 0) box(R - (W - P * 2) * frac, py + 30, (W - P * 2) * frac, 20, 10, C.forest);

  // 12-month bars (January on the right, reading order RTL)
  const by = 940;
  const bh = 230;
  txt(`ما جُمع كل شهر في ${d.year}`, by, `600 30px ${fb}`, C.muted);
  const bars = monthBars(d.months);
  const gap = 18;
  const bw = (W - P * 2 - gap * 11) / 12;
  const base = by + 40 + bh;
  bars.forEach((b, i) => {
    const bx = R - (i + 1) * bw - i * gap;
    box(bx, base - bh, bw, bh, 10, C.track);
    if (b.expected > 0) box(bx, base - bh * b.expected, bw, bh * b.expected, 10, C.mist);
    if (b.collected > 0) {
      const h = Math.max(10, bh * b.collected);
      box(bx, base - h, bw, h, 10, b.month === d.month ? C.gold : C.forest);
    }
    txt(String(b.month), base + 40, `600 24px ${fb}`, C.muted, bx + bw / 2, "center");
  });

  // Footer
  const fy = REPORT_H - 70;
  txt(`حتى ${d.asOfLabel}`, fy, `400 28px ${fb}`, C.muted);
  x.direction = "ltr";
  x.font = `600 28px ${fb}`;
  x.fillStyle = C.forest;
  x.textAlign = "left";
  x.fillText(o.url.replace(/^https?:\/\//, ""), P, fy);
}

/* ─────────────── browser ─────────────── */

export async function renderReportSummaryPng(
  d: ReportSource,
  url = reportUrl(location.origin),
): Promise<Blob> {
  const card = toCard(d);
  const [fonts, logo] = await Promise.all([
    appFonts(),
    loadImage("/icons/icon-512.png").catch(() => null),
  ]);
  // Already 1080 px wide: draw at 1×.
  return renderPng(REPORT_W, REPORT_H, 1, (ctx) =>
    drawReportSummary(ctx, card, { url, fonts, logo }),
  );
}

export type { ShareResult };

/** Share the summary card (share sheet with PNG + text; else WhatsApp text with the link). */
export async function shareReportSummary(
  d: ReportSource,
  url = reportUrl(location.origin),
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
