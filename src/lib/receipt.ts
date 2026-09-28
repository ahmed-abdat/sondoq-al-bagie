/**
 * Proof-of-payment images are rendered only from safe sources:
 * raster data URLs, blob: previews, or https URLs on our own Supabase project (signed Storage URLs).
 * Never javascript:, SVG, other schemes or other hosts.
 */
const DATA_IMAGE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i;

export function isSafeImageDataUrl(value: string): boolean {
  return DATA_IMAGE.test(value);
}

/** Safe src for a receipt photo, or null. `supabaseUrl` is the project URL allowed for https. */
export function safeReceiptSrc(
  value: string | null | undefined,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (!value) return null;
  if (value.startsWith("data:")) return isSafeImageDataUrl(value) ? value : null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol === "blob:") return value;
  if (url.protocol !== "https:" || !supabaseUrl) return null;
  try {
    const allowed = new URL(supabaseUrl);
    return url.origin === allowed.origin && url.pathname.startsWith("/storage/v1/")
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
