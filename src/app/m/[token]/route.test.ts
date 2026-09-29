import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const verify = vi.fn();
vi.mock("@/lib/data/member", () => ({ verifyMemberToken: (t: string) => verify(t) }));
const { GET } = await import("./route");

const TOKEN = "Qm9zc2EtdGVzdC10b2tlbi0wMTIzNDU2Nzg5YWJjZGVm_-x";
const call = (token: string, ip = "1.2.3.4", cookies: Record<string, string> = {}) => {
  const req = new NextRequest(`https://baqie.vercel.app/m/${token}`, {
    headers: { "x-forwarded-for": ip },
  });
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  return GET(req, { params: Promise.resolve({ token }) });
};

beforeEach(() => verify.mockReset());

it("valid link: both cookies, then home with the install invite", async () => {
  verify.mockResolvedValue({ memberId: "m1" });
  const res = await call(TOKEN);
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe("https://baqie.vercel.app/?welcome=1");
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  const key = res.cookies.get("bq_member")!;
  expect(key).toMatchObject({
    value: TOKEN,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
  expect(key.maxAge).toBe(60 * 60 * 24 * 365);
  const marker = res.cookies.get("bq_member_on")!;
  expect(marker).toMatchObject({ value: "1", secure: true, sameSite: "lax", path: "/" });
  expect(marker.httpOnly).toBeFalsy();
});

it("wrong or revoked link: the calm page, no cookie", async () => {
  verify.mockResolvedValue(null);
  const res = await call("nope-nope-nope", "9.9.9.9");
  expect(res.headers.get("location")).toBe("https://baqie.vercel.app/m/invalid");
  expect(res.cookies.get("bq_member")).toBeUndefined();
});

it("too many wrong tries from one IP: stops checking for a while", async () => {
  verify.mockResolvedValue(null);
  for (let i = 0; i < 10; i++) await call(`wrong-${i}-xxxx`, "7.7.7.7");
  verify.mockResolvedValue({ memberId: "m1" });
  const res = await call(TOKEN, "7.7.7.7");
  expect(res.headers.get("location")).toBe("https://baqie.vercel.app/m/invalid");
  expect(verify).toHaveBeenCalledTimes(10);
  // another IP is not affected
  expect((await call(TOKEN, "8.8.8.8")).headers.get("location")).toContain("/?welcome=1");
});

it("a second person's link on the same phone: kept aside, the choice page", async () => {
  verify.mockResolvedValue({ memberId: "m2" });
  const other = "B".repeat(43);
  const res = await call(other, "1.1.1.1", {
    bq_member: TOKEN,
    bq_member_saved: JSON.stringify([TOKEN]),
  });
  expect(res.headers.get("location")).toBe("https://baqie.vercel.app/m/switch");
  expect(res.cookies.get("bq_member_pending")).toMatchObject({ value: other, maxAge: 600 });
  expect(res.cookies.get("bq_member")?.value).toBe(TOKEN); // still the first person
});

it("a profile already saved here: back to it, home", async () => {
  verify.mockResolvedValue({ memberId: "m1" });
  const other = "B".repeat(43);
  const res = await call(TOKEN, "1.1.1.1", {
    bq_member: other,
    bq_member_saved: JSON.stringify([other, TOKEN]),
  });
  expect(res.headers.get("location")).toBe("https://baqie.vercel.app/");
  expect(res.cookies.get("bq_member")?.value).toBe(TOKEN);
  expect(JSON.parse(res.cookies.get("bq_member_saved")!.value)).toEqual([TOKEN, other]);
});
