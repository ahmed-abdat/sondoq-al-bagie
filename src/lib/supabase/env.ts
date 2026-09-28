// Single source of truth for Supabase env vars.
//
// The Supabase dashboard issues two key formats:
//   sb_publishable_*  replaces the anon JWT (browser-safe)
//   sb_secret_*       replaces the service_role JWT (server-only)
// Both work with the same SDK. Legacy names are accepted too; new names win.

export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

export function supabasePublicKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    undefined
  );
}

/** Server-only. Never read this from client code. */
export function supabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

/** URL + publishable key, or null when Supabase is not configured (the public page still works). */
export function supabaseEnv(): { url: string; key: string } | null {
  const url = supabaseUrl();
  const key = supabasePublicKey();
  return url && key ? { url, key } : null;
}

export const MISSING_PUBLIC_MSG =
  "[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY).";

export const MISSING_SECRET_MSG =
  "[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY). Get the secret key from Supabase → Settings → API → Secret keys.";
