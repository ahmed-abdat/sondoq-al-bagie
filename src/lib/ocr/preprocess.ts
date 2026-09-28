// Image clean-up for the SECOND pass only (always applying it made some receipts worse, see the
// benchmark): grayscale, invert dark-mode screenshots, upscale small images, stretch contrast.

/** In-place on RGBA pixels. Pure; unit tested. */
export function enhancePixels(p: Uint8ClampedArray): void {
  const n = p.length / 4;
  const gray = new Uint8ClampedArray(n);
  let sum = 0;
  for (let i = 0, j = 0; i < p.length; i += 4, j++) {
    gray[j] = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    sum += gray[j];
  }
  const invert = sum / n < 110; // dark screenshot → dark text on light background
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) hist[invert ? 255 - v : v]++;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < n * 0.01; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < n * 0.01; hi--);
  const range = Math.max(1, hi - lo);
  for (let i = 0, j = 0; i < p.length; i += 4, j++) {
    const v = ((invert ? 255 - gray[j] : gray[j]) - lo) * (255 / range);
    p[i] = p[i + 1] = p[i + 2] = v;
  }
}

/** Upscale factor so small screenshots reach ~1080 px wide (never shrink, at most 2.5×). */
export function upscaleFactor(width: number): number {
  return width > 0 && width < 900 ? Math.min(2.5, 1080 / width) : 1;
}

/** Browser only: a cleaned-up PNG of the receipt for Tesseract's second pass. */
export async function preprocessImage(image: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(image);
  const s = upscaleFactor(bmp.width);
  const canvas = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
  const ctx = canvas.getContext("2d");
  if (!ctx) return image;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  enhancePixels(data.data);
  ctx.putImageData(data, 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}
