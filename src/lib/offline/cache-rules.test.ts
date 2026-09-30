import { describe, expect, it } from "vitest";
import { isOtherSupabase, isPrivatePath, RETIRED_CACHES } from "./cache-rules";

const sb = (path: string) => new URL(`https://abcd.supabase.co${path}`);
const app = (path: string) => new URL(`https://sondoq.example${path}`);

describe("isPrivatePath", () => {
  it.each([
    "/committee",
    "/committee/pending",
    "/login",
    "/api/keepalive",
    "/r/BQ-AB12-0001",
    "/m/AbC_-123",
    "/me",
    "/me/payments",
  ])("%s is private", (p) => expect(isPrivatePath(p)).toBe(true));
  it.each([
    "/",
    "/members",
    "/members/b-12",
    "/accounts",
    "/donations",
    "/report",
    "/rules",
    "/committees-info",
    "/media",
  ])("%s is public", (p) => expect(isPrivatePath(p)).toBe(false));
});

it("isOtherSupabase matches any supabase host", () => {
  expect(isOtherSupabase(sb("/auth/v1/token"))).toBe(true);
  expect(isOtherSupabase(app("/"))).toBe(false);
});

it("the committee-only release drops the former public caches", () => {
  for (const c of ["pages-v2", "sb-public-views-v2", "warm-meta"])
    expect(RETIRED_CACHES).toContain(c);
});
