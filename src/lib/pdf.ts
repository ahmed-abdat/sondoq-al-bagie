/**
 * A tiny PDF writer: one JPEG per page, full bleed. Enough for the fund report (pages are drawn on a
 * canvas), with no library to download on a cheap phone.
 */

export interface PdfImage {
  /** JPEG bytes (baseline, RGB), as from canvas.toBlob(…, "image/jpeg"). */
  jpeg: Uint8Array;
  /** Pixel size of the JPEG. */
  w: number;
  h: number;
}

/** A4 portrait in points. */
export const A4_PT = { w: 595.28, h: 841.89 } as const;

/** UTF-16BE hex string, so the title can be Arabic. */
function pdfText(s: string): string {
  let hex = "FEFF";
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, "0");
  return `<${hex.toUpperCase()}>`;
}

export function jpegsToPdf(
  pages: PdfImage[],
  /** `margin` (pt) keeps a white border so printers do not clip the page. */
  opts: { title?: string; w?: number; h?: number; margin?: number } = {},
): Uint8Array {
  if (!pages.length) throw new Error("no pages");
  const W = opts.w ?? A4_PT.w;
  const H = opts.h ?? A4_PT.h;
  const m = opts.margin ?? 0;
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === "string" ? enc.encode(b) : b;
    parts.push(bytes);
    size += bytes.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = size;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };

  // Header; the second line marks the file as binary.
  push("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // 1 catalog, 2 page tree, 3 info, then per page: page, contents, image.
  const pageNo = (i: number) => 4 + i * 3;
  const kids = pages.map((_, i) => `${pageNo(i)} 0 R`).join(" ");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  obj(3, `<< /Title ${pdfText(opts.title ?? "")} /Producer (sondoq) >>`);
  const f = (n: number) => Number(n.toFixed(2));
  pages.forEach((p, i) => {
    const n = pageNo(i);
    obj(
      n,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W)} ${f(H)}] ` +
        `/Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`,
    );
    const content = `q ${f(W - 2 * m)} 0 0 ${f(H - 2 * m)} ${f(m)} ${f(m)} cm /Im0 Do Q`;
    obj(n + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    offsets[n + 2] = size;
    push(
      `${n + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
    );
    push(p.jpeg);
    push("\nendstream\nendobj\n");
  });

  const count = 4 + pages.length * 3;
  const xref = size;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(size);
  let at = 0;
  for (const b of parts) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}
