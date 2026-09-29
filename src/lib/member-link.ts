// A member's personal link: https://<site>/m/<token> (token: 32 random bytes, base64url = 43
// chars). Pure helpers for the installed app's «لديك رابط؟ الصقه هنا» field.

/** The token from what the member pasted: the link, the whole WhatsApp message, or the token. */
export function memberTokenFrom(input: string): string | null {
  const s = input.trim();
  const inText = /\/m\/([A-Za-z0-9_-]{4,128})(?=$|[\s?#/.,،»"')])/.exec(s);
  if (inText) return inText[1];
  return /^[A-Za-z0-9_-]{32,128}$/.test(s) ? s : null;
}

export const memberLinkPath = (token: string) => `/m/${encodeURIComponent(token)}`;

/** Readable flag set next to the httpOnly member cookie: "this device has a member link". */
export const MEMBER_FLAG_COOKIE = "bq_member_on";

export function hasMemberFlag(cookieHeader: string): boolean {
  return cookieHeader.split(/;\s*/).some((c) => c === `${MEMBER_FLAG_COOKIE}=1`);
}
