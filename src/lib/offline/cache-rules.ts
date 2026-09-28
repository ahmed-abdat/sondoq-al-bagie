// Which requests the service worker may keep for offline use. Pure functions, unit tested,
// imported by src/app/sw.ts. Rule of thumb: only public, read-only data is ever cached.

/** Public read-only Supabase views (no phones, no proof images). Safe to show offline. */
export const PUBLIC_VIEWS = [
  "fund_summary",
  "member_status",
  "member_months",
  "monthly_collection",
  "expense_totals",
  "recent_expenses",
  "campaign_progress",
  "activity_feed",
  "fund_accounts_public",
  "fund_info",
] as const;

/**
 * Never cached: pages that need a login (nothing private stays on a shared phone), and receipt
 * verification `/r/<code>`, which must always be fresh (a cancelled receipt must show as cancelled).
 */
export const PRIVATE_PREFIXES = ["/committee", "/login", "/auth", "/api", "/r"] as const;

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((p) => underPrefix(pathname, p));
}

function isSupabaseHost(url: URL): boolean {
  return url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".supabase.in");
}

/** GET of a public view on Supabase REST: `/rest/v1/<view>?...`. */
export function isPublicViewRead(url: URL, method: string): boolean {
  if (method !== "GET" || !isSupabaseHost(url)) return false;
  const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
  return !!m && (PUBLIC_VIEWS as readonly string[]).includes(m[1]);
}

/** Any other Supabase call (auth, storage, realtime, RPC, tables): network only, never stored. */
export function isOtherSupabase(url: URL): boolean {
  return isSupabaseHost(url);
}

/** A public page request (HTML navigation or Next RSC payload) that may be cached. */
export function isPublicPage(url: URL, sameOrigin: boolean): boolean {
  return (
    sameOrigin &&
    !isPrivatePath(url.pathname) &&
    !url.pathname.startsWith("/_next/") &&
    url.pathname !== "/sw.js"
  );
}
