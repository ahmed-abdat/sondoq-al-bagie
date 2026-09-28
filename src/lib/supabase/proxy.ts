import { createServerClient } from "@supabase/ssr";
import type { JwtPayload } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

/**
 * Refreshes the auth cookie and returns the verified JWT claims of the signed-in user, if any.
 * Callers MUST return `response` (or copy its cookies), or the refreshed session is lost.
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; claims: JwtPayload | null }> {
  let response = NextResponse.next({ request });
  const env = supabaseEnv();
  if (!env) return { response, claims: null };

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getClaims() verifies the JWT (via the project's JWKS) and refreshes the session.
  // A network blip must not 500 every request: treat it as signed out for this request.
  try {
    const { data } = await supabase.auth.getClaims();
    return { response, claims: data?.claims ?? null };
  } catch (err) {
    console.error("[supabase/proxy] getClaims failed:", err);
    return { response, claims: null };
  }
}
