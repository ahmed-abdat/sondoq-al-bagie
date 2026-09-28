import { afterEach, describe, expect, it, vi } from "vitest";
import { supabaseEnv, supabasePublicKey, supabaseSecretKey } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("supabase env", () => {
  it("returns null when not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(supabaseEnv()).toBeNull();
  });

  it("prefers the publishable key over the legacy anon key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_new");
    expect(supabaseEnv()).toEqual({ url: "https://x.supabase.co", key: "sb_publishable_new" });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(supabasePublicKey()).toBe("legacy");
  });

  it("prefers the secret key over the legacy service_role key", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_new");
    expect(supabaseSecretKey()).toBe("sb_secret_new");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(supabaseSecretKey()).toBe("legacy");
  });
});
