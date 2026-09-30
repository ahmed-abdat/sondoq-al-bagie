/**
 * Shared plumbing for "draw a report page on a canvas → a PNG" (fonts, images, render, download).
 * Sharing the pages is in reports/share.ts.
 */

export interface CanvasFonts {
  display: string;
  body: string;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

/** Arabic letters, digits and Latin code characters: all must be loaded before drawing. */
const FONT_SAMPLE = "وصل 0123456789 BQ-№";

/** App fonts (next/font CSS variables on <html>), loaded before drawing so Arabic shapes right. */
export async function appFonts(): Promise<CanvasFonts> {
  const cs = getComputedStyle(document.documentElement);
  const body = cs.getPropertyValue("--font-body").trim() || "Tahoma, sans-serif";
  const display = cs.getPropertyValue("--font-display-face").trim() || body;
  try {
    await Promise.all([
      ...["600", "700", "800"].map((w) => document.fonts.load(`${w} 30px ${display}`, FONT_SAMPLE)),
      ...["400", "600", "700"].map((w) => document.fonts.load(`${w} 20px ${body}`, FONT_SAMPLE)),
    ]);
  } catch {
    /* fall back to whatever is available */
  }
  return { display, body };
}

/** Creates a canvas of `w × h` CSS px at `scale`, lets `draw` paint it, returns a PNG (or JPEG) blob. */
export async function renderPng(
  w: number,
  h: number,
  scale: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  type: "image/png" | "image/jpeg" = "image/png",
  quality?: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.scale(scale, scale);
  draw(ctx);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality),
  );
}

/**
 * "retry": the share sheet refused because the tap was too long ago (slow render on an old phone);
 * the files are ready now, so a second tap shares at once.
 */
export type ShareResult = "shared" | "whatsapp" | "cancelled" | "retry";

export type ShareNavigator = Pick<Navigator, "share"> & {
  canShare?: (data: ShareData) => boolean;
};

/** Save a file to the phone (download). */
export function downloadPng(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
