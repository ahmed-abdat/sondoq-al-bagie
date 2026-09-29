import { describe, expect, it } from "vitest";
import {
  isOtherSupabase,
  isPrivatePath,
  isPublicPage,
  isPublicViewRead,
  mayStore,
} from "./cache-rules";

const sb = (path: string) => new URL(`https://abcd.supabase.co${path}`);
const app = (path: string) => new URL(`https://sondoq.example${path}`);

describe("isPublicViewRead", () => {
  it("allows GET of public views", () => {
    for (const v of [
      "fund_stats?select=*",
      "member_status_public",
      "member_months",
      "activity_public",
      "campaigns_public",
      "expenses_public",
      "terms_info",
      "campaign_contributors_public",
      "fund_accounts_public",
      "fund_info",
      "group_prices_public",
    ])
      expect(isPublicViewRead(sb(`/rest/v1/${v}`), "GET"), v).toBe(true);
  });
  it("never keeps the money views (docs/MONEY-PRIVACY.md)", () => {
    for (const v of [
      "fund_summary",
      "monthly_collection",
      "expense_totals",
      "recent_expenses",
      "campaign_progress",
      "campaign_contributions",
      "activity_feed",
      "terms_public",
      "member_status",
    ])
      expect(isPublicViewRead(sb(`/rest/v1/${v}`), "GET"), v).toBe(false);
  });
  it("rejects writes, private views, tables, rpc, auth, storage", () => {
    expect(isPublicViewRead(sb("/rest/v1/fund_stats"), "POST")).toBe(false);
    expect(isPublicViewRead(sb("/rest/v1/arrears"), "GET")).toBe(false);
    expect(isPublicViewRead(sb("/rest/v1/payments"), "GET")).toBe(false);
    expect(isPublicViewRead(sb("/rest/v1/rpc/verify_receipt"), "GET")).toBe(false);
    expect(isPublicViewRead(sb("/rest/v1/rpc/verify_receipt"), "POST")).toBe(false);
    expect(isPublicViewRead(sb("/auth/v1/user"), "GET")).toBe(false);
    expect(isPublicViewRead(sb("/storage/v1/object/proofs/x.jpg"), "GET")).toBe(false);
  });
  it("rejects other hosts", () => {
    expect(isPublicViewRead(app("/rest/v1/fund_stats"), "GET")).toBe(false);
  });
});

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

it("never stores a personal or no-store response", () => {
  expect(mayStore(null)).toBe(true);
  expect(mayStore("s-maxage=31536000, stale-while-revalidate")).toBe(true);
  expect(mayStore("public, max-age=60")).toBe(true);
  expect(mayStore("private, no-cache, no-store, max-age=0, must-revalidate")).toBe(false);
  expect(mayStore("private, max-age=0")).toBe(false);
  expect(mayStore("No-Store")).toBe(false);
});
