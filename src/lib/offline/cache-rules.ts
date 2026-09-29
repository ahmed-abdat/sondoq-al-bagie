// Which requests the service worker may keep for offline use. Pure functions, unit tested,
// imported by src/app/sw.ts. Rule of thumb: only public, read-only data is ever cached.

/**
 * Public read-only Supabase views without money (docs/MONEY-PRIVACY.md: no amounts for strangers;
 * no phones, no proof images). Safe to keep offline. The old money views (fund_summary,
 * monthly_collection, expense_totals, recent_expenses, campaign_progress, campaign_contributions,
 * activity_feed, terms_public, member_status) are never stored.
 */
export const PUBLIC_VIEWS = [
  "fund_stats",
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
] as const;

/**
 * Runtime cache names. Renamed when what they may hold changes, so phones drop the old copies
 * (the old ones held amounts): the worker deletes RETIRED_CACHES when it takes over.
 */
export const PAGES_CACHE = "pages-v2";
export const VIEWS_CACHE = "sb-public-views-v2";
export const RETIRED_CACHES = ["pages", "sb-public-views"] as const;

/**
 * Never store a response the server marked as personal or not to keep (Cache-Control no-store or
 * private): the committee's and a member's pages, and any money read.
 */
export function mayStore(cacheControl: string | null): boolean {
  return !/\b(no-store|private)\b/i.test(cacheControl ?? "");
}

/**
 * Never cached: pages that need a login (nothing private stays on a shared phone), receipt
 * verification `/r/<code>`, which must always be fresh (a cancelled receipt must show as
 * cancelled), a member's personal link `/m/<token>` (the token is a key) and their own page `/me`.
 */
const PRIVATE_PREFIXES = ["/committee", "/login", "/api", "/r", "/m", "/me"] as const;

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
