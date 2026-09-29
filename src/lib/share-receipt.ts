/**
 * Receipt → PNG image (plain canvas, no dependencies) → share sheet (WhatsApp etc.).
 * Falls back to a prefilled wa.me text message when the phone cannot share files.
 * Ported from prototype «M» (variant-m.tsx). Drawing and text are split out so they are testable.
 */
import { monthName } from "./dates";
import { formatNumber, ltr } from "./format";
import { mroToMru } from "./money";
import { qrMatrix } from "./qr";
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

export const FUND_NAME = "صندوق الرابطة";
export const ASSOC_NAME = "رابطة شباب قرية البقيع";

export interface ReceiptCover {
  /** Member the months belong to (may differ from the payer, e.g. a father paying for sons). */
  name: string;
  /** memberRef «A-12» (internal key); shown as «أ 12». */
  ref?: string | null;
  year: number;
  /** 1–12 */
  months: number[];
}

type ReceiptStatus =
  | { kind: "confirmed"; by: string; role: string }
  | { kind: "pending" }
  | { kind: "cancelled"; reason?: string };

export interface ShareableReceipt {
  no: string;
  payer: string;
  covers: ReceiptCover[];
  /** Old ouguiya (MRO), as stored. */
  amountMro: number;
  /** Arabic label, e.g. «بنكيلي». */
  methodLabel: string;
  txnRef?: string | null;
  /** Human date line, e.g. «الأحد 5 أكتوبر 2026». */
  dateLabel?: string;
  code: string;
  status: ReceiptStatus;
}

/* ─────────────── text (pure) ─────────────── */

/** [7,8,9] → «من يوليو إلى سبتمبر 2026»; runs joined by «، »; all 12 → «السنة كاملة 2026». */
export function monthsInWords(months: number[], year: number): string {
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  if (sorted.length === 12) return `السنة كاملة ${year}`;
  const runs: number[][] = [];
  for (const m of sorted) {
    const last = runs.at(-1);
    if (last && m === last[last.length - 1] + 1) last.push(m);
    else runs.push([m]);
  }
  const txt = runs
    .map((r) =>
      r.length === 1 ? monthName(r[0]) : `من ${monthName(r[0])} إلى ${monthName(r[r.length - 1])}`,
    )
    .join("، ");
  return `${txt} ${year}`;
}

const LETTERS: Record<string, string> = { A: "أ", B: "ب" };

/**
 * Member number as people know it: «A-12» → «أ 12» (group letter, space, number).
 * `isolate` wraps it in RIGHT-TO-LEFT ISOLATE … POP (U+2067 … U+2069) for text sent to WhatsApp,
 * so the letter stays before the number whatever surrounds it.
 */
export function memberNumber(ref: string, isolate = false): string {
  const [list, ...rest] = ref.split("-");
  const no = rest.join("-");
  const s = no ? `${LETTERS[list.trim().toUpperCase()] ?? list} ${no}` : ref;
  return isolate ? `\u2067${s}\u2069` : s;
}

/**
 * «عن: رسوم من يوليو إلى سبتمبر 2026», naming the member when it is not (only) the payer;
 * with the member's number when known: «عن: علي (أ 12)، رسوم …».
 */
export function coverLine(
  c: ReceiptCover,
  payer: string,
  manyCovers: boolean,
  isolate = false,
): string {
  const no = c.ref ? memberNumber(c.ref, isolate) : "";
  const who = c.ref ? `${c.name} (${no})، ` : c.name !== payer || manyCovers ? `${c.name}، ` : "";
  return `عن: ${who}رسوم ${monthsInWords(c.months, c.year)}`;
}

/** «أحمد، أمين الصندوق», or just «أحمد» when the role is unknown (no stray comma). */
export function confirmedBy(s: { by: string; role: string }): string {
  return [s.by.trim(), s.role.trim()].filter(Boolean).join("، ");
}

/** Public verification page for a receipt code. */
export function verifyUrl(code: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/r/${encodeURIComponent(code)}`;
}

export function receiptFileName(no: string): string {
  return `وصل-${no.replace(/[^\p{L}\p{N}-]/gu, "")}.png`;
}

const STATUS_LINE: Record<ReceiptStatus["kind"], string> = {
  confirmed: "✓ تم الاستلام",
  pending: "بانتظار تأكيد اللجنة",
  cancelled: "✗ وصل ملغى",
};

/** WhatsApp-friendly text sent with the image (or alone when images cannot be shared). */
export function receiptShareText(r: ShareableReceipt, url: string): string {
  const many = r.covers.length > 1;
  const lines = [
    `*وصل استلام من ${FUND_NAME}*`,
    ASSOC_NAME,
    "",
    `رقم الوصل: ${ltr(r.no)}`,
    `استلمنا من: ${r.payer}`,
    `المبلغ: ${formatNumber(r.amountMro)} أوقية (${formatNumber(mroToMru(r.amountMro))} أوقية جديدة)`,
    ...r.covers.map((c) => coverLine(c, r.payer, many, true)),
    `الوسيلة: ${r.methodLabel}${r.txnRef ? ` · ${ltr(r.txnRef)}` : ""}`,
  ];
  if (r.dateLabel) lines.push(`التاريخ: ${r.dateLabel}`);
  if (r.status.kind === "confirmed") lines.push(`أكّدها: ${confirmedBy(r.status)}`);
  else lines.push(STATUS_LINE[r.status.kind]);
  // The URL stays unwrapped so WhatsApp still detects it as a link.
  lines.push(`رمز التحقق: ${ltr(r.code)}`, `للتحقق: ${url}`);
  return lines.join("\n");
}

/* ─────────────── drawing ─────────────── */

const RECEIPT_W = 720;
const RECEIPT_H = 1120;

const C = {
  green: "#237A3B",
  greenDark: "#1A5F2E",
  ink: "#14201A",
  muted: "#4F5C55",
  onGreen: "#EEF5EF",
  okBg: "#E7F3EA",
  warnBg: "#FBEFD9",
  warn: "#8A560C",
  badBg: "#F9E1DE",
  bad: "#A62A1F",
};

export interface DrawOptions {
  url: string;
  fonts: CanvasFonts;
  logo?: CanvasImageSource | null;
}

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
> & {
  fillStyle: CanvasRenderingContext2D["fillStyle"];
  font: string;
  textAlign: CanvasTextAlign;
  direction: CanvasDirection;
};

/** Draws the receipt on a RECEIPT_W × RECEIPT_H context (already scaled for pixel density). */
export function drawReceipt(x: Ctx, r: ShareableReceipt, o: DrawOptions): void {
  const W = RECEIPT_W;
  const R = W - 48;
  const { display: fd, body: fb } = o.fonts;
  const txt = (
    t: string,
    y: number,
    font: string,
    color = C.ink,
    xx = R,
    dir: CanvasDirection = "rtl",
  ) => {
    x.direction = dir;
    x.font = font;
    x.fillStyle = color;
    x.textAlign = dir === "rtl" ? "right" : "left";
    x.fillText(t, xx, y);
  };

  x.fillStyle = "#fff";
  x.fillRect(0, 0, W, RECEIPT_H);
  x.fillStyle = C.green;
  x.fillRect(0, 0, W, 150);
  if (o.logo) {
    x.save();
    x.beginPath();
    x.arc(W - 96, 75, 44, 0, Math.PI * 2);
    x.fillStyle = "#fff";
    x.fill();
    x.clip();
    x.drawImage(o.logo, W - 140, 31, 88, 88);
    x.restore();
  }
  txt(ASSOC_NAME, 66, `700 26px ${fd}`, "#fff", W - 164);
  txt(FUND_NAME, 104, `400 20px ${fb}`, C.onGreen, W - 164);

  txt("وصل استلام", 220, `700 40px ${fd}`, C.greenDark);
  txt(`№ ${r.no}`, 220, `700 26px ${fd}`, C.muted, 48, "ltr");
  txt("استلمنا من", 286, `400 20px ${fb}`, C.muted);
  txt(r.payer, 326, `700 32px ${fd}`);
  txt("مبلغًا قدره", 386, `400 20px ${fb}`, C.muted);
  const amount = formatNumber(r.amountMro);
  x.font = `700 64px ${fd}`;
  const aw = x.measureText(amount).width;
  txt(amount, 456, `700 64px ${fd}`, C.ink, R - aw, "ltr");
  txt("أوقية", 456, `600 26px ${fb}`, C.muted, R - aw - 14);

  let y = 520;
  const many = r.covers.length > 1;
  for (const c of r.covers.slice(0, 4)) {
    txt(coverLine(c, r.payer, many), y, `600 24px ${fb}`);
    y += 40;
  }
  if (r.covers.length > 4) {
    txt(`و${r.covers.length - 4} آخرون`, y, `400 22px ${fb}`, C.muted);
    y += 40;
  }
  txt(`الوسيلة: ${r.methodLabel}`, y + 6, `400 22px ${fb}`, C.muted);
  if (r.dateLabel) {
    y += 38;
    txt(r.dateLabel, y + 6, `400 22px ${fb}`, C.muted);
  }
  y += 70;

  const st = r.status;
  const [bg, fg] =
    st.kind === "confirmed"
      ? [C.okBg, C.greenDark]
      : st.kind === "pending"
        ? [C.warnBg, C.warn]
        : [C.badBg, C.bad];
  x.fillStyle = bg;
  x.fillRect(48, y, W - 96, 120);
  txt(STATUS_LINE[st.kind], y + 46, `700 28px ${fd}`, fg, R - 24);
  const sub =
    st.kind === "confirmed"
      ? `أكّدها ${confirmedBy(st)}`
      : st.kind === "cancelled"
        ? (st.reason ?? "هذا الوصل لم يعد صالحًا")
        : "يصبح الوصل نهائيًا بعد التأكيد";
  txt(sub, y + 88, `400 22px ${fb}`, C.ink, R - 24);
  y += 190;

  txt("رمز التحقق", y, `400 20px ${fb}`, C.muted);
  txt(r.code, y + 44, `700 30px ${fd}`, C.ink, R, "rtl");
  txt("امسح الرمز للتحقق من الوصل", y + 86, `400 18px ${fb}`, C.muted);

  const mx = qrMatrix(o.url);
  const n = mx.length;
  const cell = Math.floor(190 / (n + 4));
  const qx = 48;
  const qy = y - 40;
  x.fillStyle = "#fff";
  x.fillRect(qx, qy, cell * (n + 4), cell * (n + 4));
  x.fillStyle = C.ink;
  mx.forEach((row, yy) =>
    row.forEach(
      (on, xx) => on && x.fillRect(qx + (xx + 2) * cell, qy + (yy + 2) * cell, cell, cell),
    ),
  );
}

/* ─────────────── browser ─────────────── */

/** Renders the receipt to a PNG blob (2× for sharp text on phone screens). */
async function renderReceiptPng(r: ShareableReceipt, origin = location.origin): Promise<Blob> {
  const [fonts, logo] = await Promise.all([
    appFonts(),
    loadImage("/icons/icon-192.png").catch(() => null),
  ]);
  return renderPng(RECEIPT_W, RECEIPT_H, 2, (ctx) =>
    drawReceipt(ctx, r, { url: verifyUrl(r.code, origin), fonts, logo }),
  );
}

export type { ShareResult };

/**
 * Share the receipt image through the phone's share sheet (WhatsApp shows up there).
 * If files cannot be shared (older phones, desktop), open WhatsApp with the text instead.
 * `phone`: the member's number, to open their chat directly in the fallback.
 */
export async function shareReceipt(
  r: ShareableReceipt,
  opts: ShareImageOptions & { origin?: string } = {},
): Promise<ShareResult> {
  const origin = opts.origin ?? location.origin;
  const text = receiptShareText(r, verifyUrl(r.code, origin));
  return shareImage(() => renderReceiptPng(r, origin), receiptFileName(r.no), text, opts);
}

/** Save the receipt image to the phone (download). */
export async function saveReceiptPng(r: ShareableReceipt): Promise<void> {
  downloadPng(await renderReceiptPng(r), receiptFileName(r.no));
}
