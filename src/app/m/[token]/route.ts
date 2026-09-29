import { NextResponse, type NextRequest } from "next/server";
import { verifyMemberToken } from "@/lib/data/member";
import {
  MEMBER_COOKIE,
  MEMBER_COOKIE_MAX_AGE,
  MEMBER_MARKER_COOKIE,
} from "@/lib/data/member-types";
import { clientIp, createFailLimiter } from "@/lib/fail-limiter";

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
 * A member's personal link (docs/MEMBER-ACCESS.md). Valid → the httpOnly key cookie plus the
 * readable marker, then home (?welcome=1 invites to install). Wrong, revoked, or too many wrong
 * tries from this IP → the calm «هذا الرابط لم يعد يعمل» page. The token never reaches a page.
 * (/m/demo and /m/invalid are static routes of their own and win over this one.)
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

  const res = go(request, "/?welcome=1");
  const cookie = {
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: MEMBER_COOKIE_MAX_AGE,
  };
  res.cookies.set(MEMBER_COOKIE, token, { ...cookie, httpOnly: true });
  res.cookies.set(MEMBER_MARKER_COOKIE, "1", cookie);
  return res;
}
