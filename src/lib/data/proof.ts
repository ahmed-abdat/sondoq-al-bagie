// Proof images (payment screenshots, expense receipts): checks shared by the upload action.
// Pure; unit tested. The bucket also enforces type (jpeg/webp/png) and size (400 KB).

export const PROOF_MAX_BYTES = 409_600;
/** Largest wallet logo accepted (m41; the `logos` bucket refuses more too). */
export const LOGO_MAX_BYTES = 204_800;
export type ProofKind = "payments" | "expenses";
export type ProofMime = "image/jpeg" | "image/png" | "image/webp";

const EXT: Record<ProofMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Real type from the first bytes (never trust the file name or the browser's type). */
export function sniffImage(bytes: Uint8Array): ProofMime | null {
  const at = (i: number, ...v: number[]) => v.every((b, k) => bytes[i + k] === b);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Object path in the `proofs` bucket: <kind>/<record id>-<hash prefix>.<ext>. The same file for
 * the same record always gets the same path, so a retried upload is harmless.
 */
export function proofPath(
  kind: ProofKind,
  recordId: string,
  hash: string,
  mime: ProofMime,
): string {
  return `${kind}/${recordId}-${hash.slice(0, 12)}.${EXT[mime]}`;
}

/** Only paths this app writes may be turned into signed URLs. */
export function isProofPath(path: string): boolean {
  return /^(payments|expenses)\/[0-9a-f-]{36}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(path);
}

/** Turn the data URL from compressImage() into bytes for FormData. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",", 2);
  const mime = /^data:([^;]+);base64$/.exec(head)?.[1] ?? "application/octet-stream";
  const bin = atob(b64 ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
