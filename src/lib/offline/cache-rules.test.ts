import { describe, expect, it } from "vitest";
import { isOtherSupabase, isPrivatePath, isPublicPage, isPublicViewRead } from "./cache-rules";

const sb = (path: string) => new URL(`https://abcd.supabase.co${path}`);
const app = (path: string) => new URL(`https://sondoq.example${path}`);

describe("isPublicViewRead", () => {
  it("allows GET of public views", () => {
    expect(isPublicViewRead(sb("/rest/v1/fund_summary?select=*"), "GET")).toBe(true);
    expect(isPublicViewRead(sb("/rest/v1/member_status"), "GET")).toBe(true);
    expect(isPublicViewRead(sb("/rest/v1/fund_accounts_public"), "GET")).toBe(true);
    expect(isPublicViewRead(sb("/rest/v1/fund_info"), "GET")).toBe(true);
    expect(isPublicViewRead(sb("/rest/v1/campaign_contributions"), "GET")).toBe(true);
    expect(isPublicViewRead(sb("/rest/v1/group_prices_public"), "GET")).toBe(true);
    expect(isPublicViewRead(sb("/rest/v1/terms_public"), "GET")).toBe(true);
  });
  it("rejects writes, private views, tables, rpc, auth, storage", () => {
    expect(isPublicViewRead(sb("/rest/v1/fund_summary"), "POST")).toBe(false);
    expect(isPublicViewRead(sb("/rest/v1/arrears"), "GET")).toBe(false);
    expect(isPublicViewRead(sb("/rest/v1/payments"), "GET")).toBe(false);
    expect(isPublicViewRead(sb("/rest/v1/rpc/verify_receipt"), "GET")).toBe(false);
    expect(isPublicViewRead(sb("/rest/v1/rpc/verify_receipt"), "POST")).toBe(false);
    expect(isPublicViewRead(sb("/auth/v1/user"), "GET")).toBe(false);
    expect(isPublicViewRead(sb("/storage/v1/object/proofs/x.jpg"), "GET")).toBe(false);
  });
  it("rejects other hosts", () => {
    expect(isPublicViewRead(app("/rest/v1/fund_summary"), "GET")).toBe(false);
  });
});

describe("isPrivatePath", () => {
  it.each(["/committee", "/committee/pending", "/login", "/api/keepalive", "/r/BQ-AB12-0001"])(
    "%s is private",
    (p) => expect(isPrivatePath(p)).toBe(true),
  );
  it.each(["/", "/members", "/accounts", "/donations", "/report", "/rules", "/committees-info"])(
    "%s is public",
    (p) => expect(isPrivatePath(p)).toBe(false),
  );
});

describe("isPublicPage", () => {
  it("caches same-origin public pages only", () => {
    expect(isPublicPage(app("/"), true)).toBe(true);
    expect(isPublicPage(app("/members"), true)).toBe(true);
    expect(isPublicPage(app("/report"), true)).toBe(true);
    expect(isPublicPage(app("/committee"), true)).toBe(false);
    expect(isPublicPage(app("/_next/static/x.js"), true)).toBe(false);
    expect(isPublicPage(app("/"), false)).toBe(false);
  });
});

it("isOtherSupabase matches any supabase host", () => {
  expect(isOtherSupabase(sb("/auth/v1/token"))).toBe(true);
  expect(isOtherSupabase(app("/"))).toBe(false);
});
