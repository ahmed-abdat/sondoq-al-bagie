import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const req = (auth?: string) =>
  new Request("http://localhost/api/keepalive", {
    headers: auth ? { authorization: auth } : {},
  });

describe("keepalive", () => {
  it("rejects callers without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(req())).status).toBe(401);
  });

  it("is a no-op without Supabase settings", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(await (await GET(req())).json()).toEqual({ ok: true, enabled: false });
  });

  it("pings Supabase auth health and never throws", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co/");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, enabled: true, auth: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://x.supabase.co/auth/v1/health",
      expect.anything(),
    );
  });
});
