import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

// The session check is faked: `signedIn` decides whether the request carries committee claims.
let signedIn = false;
vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: async (request: NextRequest) => ({
    response: NextResponse.next({ request }),
    claims: signedIn ? { sub: "u1" } : null,
  }),
}));

const req = (path: string, cookies: Record<string, string> = {}) => {
  const r = new NextRequest(new URL(path, "https://baqie.vercel.app"));
  for (const [k, v] of Object.entries(cookies)) r.cookies.set(k, v);
  return r;
};
const target = (res: Response) => {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname + new URL(loc).search : null;
};

describe("proxy: the committee-only gate", () => {
  beforeEach(() => {
    signedIn = false;
    vi.stubEnv("SONDOQ_FIXTURES", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("signed out: every former public page → the login, a redirect nobody keeps", async () => {
    for (const p of ["/", "/members", "/accounts", "/donations", "/report", "/me"]) {
      const res = await proxy(req(p));
      expect(res.status, p).toBe(307);
      expect(target(res), p).toBe("/login");
      expect(res.headers.get("cache-control"), p).toBe("no-store");
    }
  });

  it("signed out: committee pages keep where they were going", async () => {
    expect(target(await proxy(req("/committee/payments")))).toBe(
      "/login?next=%2Fcommittee%2Fpayments",
    );
  });

  it("member links and receipt checks → the login, no `next`, the old cookies dropped", async () => {
    const res = await proxy(req("/m/abc", { bq_member: "x", bq_member_on: "1" }));
    expect(target(res)).toBe("/login");
    expect(res.headers.get("set-cookie")).toMatch(/bq_member=;.*Max-Age=0/i);
    expect(target(await proxy(req("/r/BQ-ABCD-1234")))).toBe("/login");
  });

  it("the login (never stored), the first sign-in setup and the cron routes stay open", async () => {
    for (const p of ["/login", "/committee/setup", "/api/keepalive", "/api/backup", "/api/audit"]) {
      const res = await proxy(req(p));
      expect(res.headers.get("location"), p).toBeNull();
      expect(res.status, p).toBe(200);
    }
    expect((await proxy(req("/login"))).headers.get("cache-control")).toBe("no-store");
  });

  it("signed out: any other API answers 401 instead of a login page", async () => {
    expect((await proxy(req("/api/anything"))).status).toBe(401);
  });

  it("signed in: former public pages → their committee place; the report stays", async () => {
    signedIn = true;
    const to: Record<string, string> = {
      "/": "/committee",
      "/login": "/committee",
      "/members": "/committee/members",
      "/accounts": "/committee",
      "/donations": "/committee",
      "/me": "/committee",
      "/m/abc": "/committee",
      "/r/BQ-ABCD-1234": "/committee",
    };
    for (const [from, dest] of Object.entries(to)) {
      const res = await proxy(req(from));
      expect(target(res), from).toBe(dest);
      expect(res.headers.get("cache-control"), from).toBe("no-store");
    }
    for (const p of ["/report", "/committee", "/committee/members"])
      expect((await proxy(req(p))).headers.get("location"), p).toBeNull();
  });

  it("demo previews (fixtures, not production) skip the gate as before", async () => {
    vi.stubEnv("SONDOQ_FIXTURES", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await proxy(req("/members"))).headers.get("location")).toBeNull();
    vi.stubEnv("VERCEL_ENV", "production"); // never in production, even with the flag
    expect(target(await proxy(req("/members")))).toBe("/login");
  });
});
