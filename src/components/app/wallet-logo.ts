// A wallet's logo («المحافظ», m41): the one «المسؤول» uploaded (public `logos` bucket), else the
// app's own picture for the wallets it knows, else none. Works on the server and in the browser.
import { methodLogo, type Method } from "@/lib/methods";

export function walletLogo(w: { logoPath: string | null; legacyMethod: Method | null }) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (w.logoPath && base) return `${base}/storage/v1/object/public/logos/${w.logoPath}`;
  return w.legacyMethod ? methodLogo(w.legacyMethod) : null;
}
