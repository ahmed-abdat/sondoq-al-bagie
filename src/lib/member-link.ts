// A member's personal link: https://<site>/m/<token> (token: 32 random bytes, base64url = 43
// chars). Pure helpers for the installed app's «لديك رابط؟ الصقه هنا» field.
import { MEMBER_MARKER_COOKIE } from "@/lib/data/member-types";

/** The token from what the member pasted: the link, the whole WhatsApp message, or the token. */
export function memberTokenFrom(input: string): string | null {
  const s = input.trim();
  const inText = /\/m\/([A-Za-z0-9_-]{4,128})(?=$|[\s?#/.,،»"')])/.exec(s);
  if (inText) return inText[1];
  return /^[A-Za-z0-9_-]{32,128}$/.test(s) ? s : null;
}

export const memberLinkPath = (token: string) => `/m/${encodeURIComponent(token)}`;

/** The readable marker next to the httpOnly member cookie: "this device has a member link". */
export function hasMemberFlag(cookieHeader: string): boolean {
  return cookieHeader.split(/;\s*/).some((c) => c === `${MEMBER_MARKER_COOKIE}=1`);
}
