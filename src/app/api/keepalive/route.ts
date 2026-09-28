import { supabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8_000;

async function ping(url: string, key: string): Promise<{ ok: boolean; status: number | null }> {
  try {
    const res = await fetch(url, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
}

/**
 * Daily Vercel cron (vercel.json). Free Supabase projects pause after 7 idle days,
 * so this sends one tiny request with the publishable key. Works on an empty database.
 * Never throws: the cron only needs a response.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 401 });
  }

  const env = supabaseEnv();
  if (!env) return Response.json({ ok: true, enabled: false });

  const base = env.url.replace(/\/+$/, "");
  const auth = await ping(`${base}/auth/v1/health`, env.key);
  return Response.json({ ok: auth.ok, enabled: true, auth: auth.status });
}
