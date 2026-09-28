import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const EXPIRED_OR_INVALID = /expired|invalid/i;

/** Only committee pages are valid destinations (no open redirects). */
function safeNext(next: string | null): string {
  return next && /^\/committee(\/|$|\?)/.test(next) ? next : "/committee";
}

/**
 * Link target of Supabase auth emails (invite, password recovery, email change):
 * exchanges `token_hash` for a session, then redirects into the committee area.
 * Failures go back to /login with `?error=confirm_failed&reason=<key>`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const redirectTo = request.nextUrl.clone();
  redirectTo.search = "";
  redirectTo.pathname = safeNext(searchParams.get("next"));

  const fail = (reason: string) => {
    redirectTo.pathname = "/login";
    redirectTo.search = "";
    redirectTo.searchParams.set("error", "confirm_failed");
    redirectTo.searchParams.set("reason", reason);
    return NextResponse.redirect(redirectTo);
  };

  if (!(tokenHash && type)) return fail("missing_params");

  const supabase = await createClient();
  if (!supabase) return fail("not_configured");

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (!error) return NextResponse.redirect(redirectTo);

  console.error("[auth/confirm] verifyOtp failed:", { message: error.message, type });
  return fail(EXPIRED_OR_INVALID.test(error.message) ? "expired" : "verify_failed");
}
