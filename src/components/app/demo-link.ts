import "server-only";
// Demo only: the fixture member links /m/demo and /m/demo2, and the profile cookies they write.
import { NextResponse, type NextRequest } from "next/server";
import { isDemo } from "./demo";
import {
  DEMO_PENDING_COOKIE,
  DEMO_PROFILES_COOKIE,
  openLink,
  readDemoPhone,
  type DemoPhone,
  type DemoToken,
} from "./demo-member";
import { MEMBER_COOKIE, MEMBER_COOKIE_MAX_AGE, MEMBER_MARKER_COOKIE } from "./member-types";

type Jar = {
  set(name: string, value: string, opts: Record<string, unknown>): unknown;
  delete(name: string): unknown;
};

/** Write the demo phone into cookies (the flag follows: set while a profile is active). */
export function writeDemoPhone(jar: Jar, p: DemoPhone, secure = false) {
  const base = { path: "/", sameSite: "lax", secure, maxAge: MEMBER_COOKIE_MAX_AGE };
  if (p.active) {
    jar.set(MEMBER_COOKIE, p.active, { ...base, httpOnly: true });
    jar.set(MEMBER_MARKER_COOKIE, "1", base);
    jar.set(DEMO_PROFILES_COOKIE, p.profiles.join(","), { ...base, httpOnly: true });
  } else {
    jar.delete(MEMBER_COOKIE);
    jar.delete(MEMBER_MARKER_COOKIE);
    jar.delete(DEMO_PROFILES_COOKIE);
  }
  if (p.pending) jar.set(DEMO_PENDING_COOKIE, p.pending, { ...base, httpOnly: true, maxAge: 3600 });
  else jar.delete(DEMO_PENDING_COOKIE);
}

/** GET /m/demo*: like a real personal link, for a fixture member. 404 outside demo mode. */
export function demoLink(request: NextRequest, token: DemoToken) {
  if (!isDemo()) return new NextResponse("Not found", { status: 404 });
  const phone = openLink(
    readDemoPhone((n) => request.cookies.get(n)?.value, MEMBER_COOKIE),
    token,
  );
  const res = NextResponse.redirect(
    new URL(phone.pending ? "/m/switch" : "/?welcome=1", request.url),
    303,
  );
  writeDemoPhone(res.cookies, phone, request.nextUrl.protocol === "https:");
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
