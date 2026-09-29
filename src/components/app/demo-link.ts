import "server-only";
// Demo only: the fixture member links /m/demo and /m/demo2, through the same cookie rules as the
// real /m/<token> route (src/lib/member-cookies.ts).
import { NextResponse, type NextRequest } from "next/server";
import { openLink, readJar, writeJar } from "@/lib/member-cookies";
import { isDemo } from "./demo";
import type { DemoToken } from "./demo-member";

/** GET /m/demo*: like a real personal link, for a fixture member. 404 outside demo mode. */
export function demoLink(request: NextRequest, token: DemoToken) {
  if (!isDemo()) return new NextResponse("Not found", { status: 404 });
  const { jar, to } = openLink(readJar(request.cookies), token);
  const res = NextResponse.redirect(new URL(to, request.url), 303);
  writeJar(res.cookies, jar);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
