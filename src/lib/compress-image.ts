/** Receipt photos: shrink in the browser to a JPEG of about 200 KB before upload (small data plans). */

/** Scale (w, h) down so the longest side is at most `max`. Pure; unit tested. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Bytes represented by a base64 data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

export async function compressImage(file: File, maxBytes = 200_000): Promise<string> {
  const img = await loadImage(file);
  let side = 1280;
  let quality = 0.78;
  for (let i = 0; i < 8; i++) {
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, side);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(img, 0, 0, width, height);
    const url = canvas.toDataURL("image/jpeg", quality);
    if (dataUrlBytes(url) <= maxBytes) return url;
    if (quality > 0.5) quality -= 0.12;
    else side = Math.round(side * 0.75);
  }
  throw new Error("too big");
}

/** Data URL → Blob, for uploading the compressed image to Storage. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head = "", b64 = ""] = dataUrl.split(",");
  const type = /^data:([^;]+)/.exec(head)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
