// A committee report (doc.ts) as WhatsApp images, an A4 PDF or plain text, built on the phone.
// The same share flow as the report today: the files are rendered in the background as soon as
// the report is shown (prepareReportDoc), so the tap shares at once inside the browser's
// "user activation" window. No link, no QR.
import {
  appFonts,
  downloadPng,
  loadImage,
  renderPng,
  type ShareNavigator,
  type ShareResult,
} from "../canvas-share";
import { A4_PT, jpegsToPdf } from "../pdf";
import { waLink } from "../whatsapp";
import { A4, docText, paginate, PHONE, type DocMeta, type PageSize, type ReportDoc } from "./doc";
import { drawDocPage } from "./draw";

export type { ShareResult };

async function kit() {
  const [fonts, logo] = await Promise.all([
    appFonts(),
    loadImage("/icons/icon-512.png").catch(() => null),
  ]);
  return { fonts, logo };
}

/** Every page of the report as a Blob (PNG for images, JPEG for the PDF). */
export async function renderDocPages(
  doc: ReportDoc,
  meta: DocMeta,
  size: PageSize = PHONE,
  type: "image/png" | "image/jpeg" = "image/png",
): Promise<Blob[]> {
  const { fonts, logo } = await kit();
  const pages = paginate(doc.blocks, size);
  const out: Blob[] = [];
  for (const [i, blocks] of pages.entries())
    out.push(
      await renderPng(
        size.w,
        size.h,
        1,
        (ctx) =>
          drawDocPage(ctx, doc, blocks, { fonts, logo, size, meta, no: i + 1, of: pages.length }),
        type,
        type === "image/jpeg" ? 0.7 : undefined,
      ),
    );
  return out;
}

type Prepared = { images?: Promise<File[]>; pdf?: Promise<File> };
const prepared = new WeakMap<ReportDoc, Prepared>();
const slot = (d: ReportDoc) => {
  let s = prepared.get(d);
  if (!s) prepared.set(d, (s = {}));
  return s;
};

/** 1080×1350 PNG pages: «التقرير-السنوي-2026-1.png» … */
export function docImages(doc: ReportDoc, meta: DocMeta): Promise<File[]> {
  const s = slot(doc);
  s.images ??= renderDocPages(doc, meta).then((blobs) =>
    blobs.map((b, i) => new File([b], `${doc.fileBase}-${i + 1}.png`, { type: "image/png" })),
  );
  s.images.catch(() => (s.images = undefined));
  return s.images;
}

/** One A4 PDF (pages as JPEG inside a 10 mm margin, about 140 dpi): «التقرير-السنوي-2026.pdf». */
export function docPdf(doc: ReportDoc, meta: DocMeta): Promise<File> {
  const s = slot(doc);
  s.pdf ??= renderDocPages(doc, meta, A4, "image/jpeg").then(async (blobs) => {
    const jpegs = await Promise.all(
      blobs.map(async (b) => ({ jpeg: new Uint8Array(await b.arrayBuffer()), w: A4.w, h: A4.h })),
    );
    const pdf = jpegsToPdf(jpegs, { title: doc.title, margin: (10 / 25.4) * 72, ...A4_PT });
    return new File([pdf as BlobPart], `${doc.fileBase}.pdf`, { type: "application/pdf" });
  });
  s.pdf.catch(() => (s.pdf = undefined));
  return s.pdf;
}

/** Start rendering the images in the background (when the report is shown). */
export function prepareReportDoc(doc: ReportDoc, meta: DocMeta): void {
  docImages(doc, meta).catch(() => {});
}

async function shareFiles(files: File[], text: string, nav: ShareNavigator) {
  if (typeof nav.share !== "function" || !nav.canShare?.({ files })) return null;
  try {
    await nav.share({ files, text });
    return "shared" as const;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "cancelled" as const;
    if (e instanceof DOMException && e.name === "NotAllowedError") return "retry" as const;
    return null;
  }
}

type Opts = { nav?: ShareNavigator; open?: (url: string) => void };

/**
 * Every page as PNG in one share (WhatsApp takes several images at once), with the title as the
 * message. A phone that cannot share files: WhatsApp opens with the report as text.
 */
export async function shareDocImages(
  doc: ReportDoc,
  meta: DocMeta,
  opts: Opts = {},
): Promise<ShareResult> {
  const nav = opts.nav ?? (navigator as ShareNavigator);
  if (typeof nav.share === "function" && nav.canShare) {
    const files = await docImages(doc, meta).catch(() => null);
    const res = files && (await shareFiles(files, `${doc.title} · ${doc.subtitle}`, nav));
    if (res) return res;
  }
  (opts.open ?? ((u: string) => window.open(u, "_blank", "noopener")))(
    waLink(null, docText(doc, meta)),
  );
  return "whatsapp";
}

/** The PDF through the share sheet; if files cannot be shared, it is downloaded. */
export async function shareDocPdf(
  doc: ReportDoc,
  meta: DocMeta,
  opts: { nav?: ShareNavigator; download?: (b: Blob, name: string) => void } = {},
): Promise<ShareResult | "downloaded"> {
  const nav = opts.nav ?? (navigator as ShareNavigator);
  const file = await docPdf(doc, meta);
  const res = await shareFiles([file], `${doc.title} · ${doc.subtitle}`, nav);
  if (res) return res;
  (opts.download ?? downloadPng)(file, file.name);
  return "downloaded";
}

export { docText };
