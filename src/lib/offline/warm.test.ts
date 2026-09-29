import { describe, expect, it, vi } from "vitest";
import {
  lastWarmed,
  pagesToWarm,
  SMALL_PAGES,
  WARM_EVERY_MS,
  WARM_PAGES,
  warmDue,
  warmPages,
} from "./warm";

/** A tiny CacheStorage: one Map per cache name. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    const m = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, m);
    return {
      put: async (k: string, r: Response) => void m.set(String(k), r),
      match: async (k: string) => m.get(String(k))?.clone(),
    } as unknown as Cache;
  };
  return { stores, caches: { open } };
}

const page = (body = "<html>", headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html", ...headers } });

describe("pagesToWarm", () => {
  it("every public page, or only the two small ones on Save-Data / 2G", () => {
    expect(pagesToWarm(undefined)).toEqual(WARM_PAGES);
    expect(pagesToWarm({ effectiveType: "4g" })).toEqual(WARM_PAGES);
    expect(pagesToWarm({ saveData: true })).toEqual(SMALL_PAGES);
    expect(pagesToWarm({ effectiveType: "2g" })).toEqual(SMALL_PAGES);
  });
  it("never a private page", () => {
    for (const p of WARM_PAGES) expect(p).not.toMatch(/^\/(committee|me|m|r|login|api)\b/);
  });
});

describe("warmDue", () => {
  it("never saved, or saved more than 30 minutes ago", () => {
    expect(warmDue(null)).toBe(true);
    expect(warmDue(1000, 1000 + WARM_EVERY_MS - 1)).toBe(false);
    expect(warmDue(1000, 1000 + WARM_EVERY_MS)).toBe(true);
  });
});

describe("warmPages", () => {
  const origin = "https://baqie.vercel.app";

  it("saves each page one at a time, asking the server if it changed, then remembers when", async () => {
    const { stores, caches } = fakeCaches();
    const calls: [string, RequestInit | undefined][] = [];
    const fetch = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
      calls.push([String(u), init]);
      return page(`<p>${u}</p>`);
    }) as unknown as typeof globalThis.fetch;
    const saved = await warmPages(["/", "/members"], { caches, fetch, origin });
    expect(saved).toEqual(["/", "/members"]);
    expect(calls.map(([u]) => u)).toEqual([`${origin}/`, `${origin}/members`]);
    expect(calls[0][1]).toMatchObject({ cache: "no-cache", credentials: "same-origin" });
    expect([...stores.get("pages-v2")!.keys()]).toEqual([`${origin}/`, `${origin}/members`]);
    expect(await lastWarmed(caches)).toBeGreaterThan(0);
  });

  it("never keeps a private / no-store answer or a redirect (money privacy)", async () => {
    const { stores, caches } = fakeCaches();
    const fetch = vi.fn(async (u: RequestInfo | URL) =>
      String(u).endsWith("/accounts")
        ? page("x", { "cache-control": "private, no-store" })
        : page(),
    ) as unknown as typeof globalThis.fetch;
    const saved = await warmPages(["/", "/accounts"], { caches, fetch, origin });
    expect(saved).toEqual(["/"]);
    expect(stores.get("pages-v2")!.has(`${origin}/accounts`)).toBe(false);
  });

  it("stops at the size cap, and offline mid-way is not remembered as done", async () => {
    const { caches } = fakeCaches();
    const big = vi.fn(async () => page("x".repeat(600))) as unknown as typeof globalThis.fetch;
    expect(await warmPages(WARM_PAGES, { caches, fetch: big, origin, maxBytes: 1000 })).toEqual([
      "/",
      "/members",
    ]);

    const c2 = fakeCaches();
    let n = 0;
    const flaky = vi.fn(async () => {
      if (n++ === 1) throw new TypeError("offline");
      return page();
    }) as unknown as typeof globalThis.fetch;
    expect(await warmPages(WARM_PAGES, { caches: c2.caches, fetch: flaky, origin })).toEqual(["/"]);
    expect(await lastWarmed(c2.caches)).toBeNull();
  });
});
