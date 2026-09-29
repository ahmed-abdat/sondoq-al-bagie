import { NextResponse, type NextRequest } from "next/server";
import { verifyMemberToken } from "@/lib/data/member";
import { clientIp, createFailLimiter } from "@/lib/fail-limiter";
import { openLink, readJar, writeJar } from "@/lib/member-cookies";

export const dynamic = "force-dynamic";

// wrong or revoked links per IP: 10 per 10 minutes (per server instance)
const failures = createFailLimiter(10, 10 * 60_000);

const go = (request: NextRequest, path: string) => {
  const res = NextResponse.redirect(new URL(path, request.url), 303);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer"); // the token never leaves in a Referer
  return res;
};

/**
 * A member's personal link (docs/MEMBER-ACCESS.md; a phone holds up to 5 profiles). Wrong,
 * revoked, or too many wrong tries from this IP → the calm «هذا الرابط لم يعد يعمل» page. Valid:
 * the first profile here → active (+ install invite); a saved one → active; another person →
 * kept aside for the choice page /m/switch. The token never reaches a page.
 * (/m/demo, /m/invalid and /m/switch are static routes of their own and win over this one.)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ip = clientIp(request.headers);
  if (failures.blocked(ip)) return go(request, "/m/invalid");

  const session = await verifyMemberToken(token);
  if (!session) {
    failures.fail(ip);
    return go(request, "/m/invalid");
  }

  const { jar, to } = openLink(readJar(request.cookies), token);
  const res = go(request, to);
  writeJar(res.cookies, jar);
  return res;
}
