// The drawing kit of every report page (reports/draw.ts): colours and a pen for text, boxes,
// amounts, the logo and the footer on a canvas.
import type { CanvasFonts } from "../canvas-share";
import { formatNumber } from "../format";

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
