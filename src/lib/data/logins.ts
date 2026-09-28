// Committee logins without emails: an email address, or a Mauritanian phone number mapped to an
// internal address (Supabase Auth needs an email; no SMS provider is used). Pure; unit tested.
import { toWesternDigits } from "@/lib/money";

export const PHONE_DOMAIN = "phone.sondoq.invalid";

export type Login = {
  kind: "email" | "phone";
  /** what Supabase Auth stores and signs in with */
  authEmail: string;
  /** what people see and type: the email, or "+222XXXXXXXX" */
  display: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email or phone (8 local digits starting 2/3/4, with or without +222 / 00222, any digits). */
export function parseLogin(input: string): Login | null {
  const raw = toWesternDigits(String(input ?? "")).trim();
  if (raw.includes("@")) {
    const email = raw.toLowerCase();
    if (!EMAIL.test(email) || email.endsWith(`@${PHONE_DOMAIN}`)) return null;
    return { kind: "email", authEmail: email, display: email };
  }
  let digits = raw.replace(/[\s\-.()]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^[234]\d{7}$/.test(digits)) digits = `222${digits}`;
  if (!/^222[234]\d{7}$/.test(digits)) return null;
  return { kind: "phone", authEmail: `${digits}@${PHONE_DOMAIN}`, display: `+${digits}` };
}

/** "+222…" for phone accounts, the email otherwise (how the admin list shows a login). */
export function displayLogin(authEmail: string | null | undefined): string {
  if (!authEmail) return "";
  const [local, domain] = authEmail.split("@");
  return domain === PHONE_DOMAIN ? `+${local}` : authEmail;
}

// No look-alikes (0/o, 1/l/i) and lowercase only: easy to read out and type on a phone.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** 12-character password from a CSPRNG, with at least 2 digits and 2 letters. */
export function generatePassword(length = 12): string {
  for (;;) {
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    let out = "";
    for (const b of bytes) {
      if (b >= 248) continue; // 248 = 8 × 31: keeps the choice unbiased
      out += ALPHABET[b % ALPHABET.length];
      if (out.length === length) break;
    }
    if (
      out.length === length &&
      (out.match(/\d/g) ?? []).length >= 2 &&
      (out.match(/[a-z]/g) ?? []).length >= 2
    ) {
      return out;
    }
  }
}
