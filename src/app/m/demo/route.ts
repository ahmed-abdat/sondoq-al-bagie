import { NextResponse, type NextRequest } from "next/server";
import { isDemo } from "@/components/app/demo";
import {
  DEMO_MEMBER_TOKEN,
  MEMBER_COOKIE,
  MEMBER_MARKER_COOKIE,
} from "@/components/app/member-types";

// Demo only (fixtures, never production): opens the app as the fixture member, like a real
// personal link would. The real /m/<token> route (Lane B) has no demo branch.
export async function GET(request: NextRequest) {
  if (!isDemo()) return new NextResponse("Not found", { status: 404 });
  const res = NextResponse.redirect(new URL("/?welcome=1", request.url), 303);
  const base = {
    path: "/",
    sameSite: "lax" as const,
    secure: request.nextUrl.protocol === "https:",
    maxAge: 60 * 60 * 24 * 365,
  };
  res.cookies.set(MEMBER_COOKIE, DEMO_MEMBER_TOKEN, { ...base, httpOnly: true });
  res.cookies.set(MEMBER_MARKER_COOKIE, "1", base);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
