import { NextResponse, type NextRequest } from "next/server";
import { isDemo } from "@/components/app/demo";
import { updateSession } from "@/lib/supabase/proxy";

// The app is for the committee only (owner, 2026-09-30; docs/COMMITTEE-ONLY-PLAN.md §5.1): every
// page needs a committee login. Open: the login itself, the first sign-in's setup and the two
// cron routes (they check their own secret). Static files never reach here (matcher below).
const OPEN = [/^\/login$/, /^\/auth(\/|$)/, /^\/committee\/setup$/, /^\/api\/(keepalive|backup)$/];
/** Former member links and receipt checks. */
const RETIRED = /^\/(m|r)(\/|$)/;
/** Cookies of the former member links: dropped wherever they still come in. */
const MEMBER_COOKIES = ["bq_member", "bq_member_saved", "bq_member_pending", "bq_member_on"];
/** Signed in: former public pages → their committee place. /report stays (behind the gate). */
const COMMITTEE_HOME: Record<string, string> = {
  "/": "/committee",
  "/login": "/committee",
  "/members": "/committee/members",
  "/accounts": "/committee",
  "/donations": "/committee",
  "/me": "/committee",
};

const isOpen = (path: string) => OPEN.some((re) => re.test(path));

/** A redirect nobody keeps (an old worker must never store it under "/"), cookies dropped. */
function redirect(request: NextRequest, to: string, next?: string, session?: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = to;
  url.search = "";
  if (next) url.searchParams.set("next", next);
  const res = NextResponse.redirect(url);
  session?.cookies.getAll().forEach((c) => res.cookies.set(c)); // keep a refreshed session
  res.headers.set("Cache-Control", "no-store");
  return dropMemberCookies(request, res);
}

function dropMemberCookies(request: NextRequest, response: NextResponse): NextResponse {
  for (const name of MEMBER_COOKIES)
    if (request.cookies.has(name)) response.cookies.set(name, "", { path: "/", maxAge: 0 });
  return response;
}

export async function proxy(request: NextRequest) {
  // Demo previews (fictional data, writes simulated in the browser): no gate, as before.
  if (isDemo()) return (await updateSession(request)).response;

  const path = request.nextUrl.pathname;
  const { response, claims } = await updateSession(request);
  if (!claims) {
    if (RETIRED.test(path)) return redirect(request, "/login"); // no `next`, no message
    if (isOpen(path)) {
      if (path === "/login") response.headers.set("Cache-Control", "no-store");
      return dropMemberCookies(request, response);
    }
    if (path.startsWith("/api/"))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return redirect(request, "/login", path.startsWith("/committee") ? path : undefined);
  }
  const home = RETIRED.test(path) ? "/committee" : COMMITTEE_HOME[path];
  if (home) return redirect(request, home, undefined, response);
  return dropMemberCookies(request, response);
}

export const config = {
  // everything but static files: build assets, images, icons, the worker, the manifest, robots
  matcher: [
    "/((?!_next/static|_next/image|icons/|wallets/|screenshots/|ocr/|favicon|logo\\.jpg|sw\\.js|swe-worker|manifest\\.webmanifest|offline\\.html|robots\\.txt).*)",
  ],
};
