import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const verify = vi.fn();
vi.mock("@/lib/data/member", () => ({ verifyMemberToken: (t: string) => verify(t) }));
const { GET } = await import("./route");

const TOKEN = "Qm9zc2EtdGVzdC10b2tlbi0wMTIzNDU2Nzg5YWJjZGVm_-x";
const call = (token: string, ip = "1.2.3.4") =>
  GET(
    new NextRequest(`https://baqie.vercel.app/m/${token}`, {
      headers: { "x-forwarded-for": ip },
    }),
    { params: Promise.resolve({ token }) },
  );

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
