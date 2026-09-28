/**
 * Free prefilled wa.me links (no WhatsApp API). Phones are Mauritanian (+222, 8 local digits).
 */

/** International format without "+", e.g. "22236123456". Accepts "36 12 34 56", "+222 36…", "00222…". */
export function waPhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.startsWith("222") && digits.length > 8 ? digits : `222${digits}`;
}

/** A local Mauritanian mobile number: 8 digits starting with 2, 3 or 4. */
export function isValidLocalPhone(local: string): boolean {
  return /^[234]\d{7}$/.test(local.replace(/\s/g, ""));
}

/** wa.me link with prefilled text; without a phone, WhatsApp asks whom to send it to. */
export function waLink(phone: string | undefined | null, text: string): string {
  const q = `text=${encodeURIComponent(text)}`;
  return phone ? `https://wa.me/${waPhone(phone)}?${q}` : `https://wa.me/?${q}`;
}

/** Absolute URL for links sent in messages. */
export function absoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}
