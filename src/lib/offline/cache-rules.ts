// Which requests the service worker may keep for offline use. Pure functions, unit tested,
// imported by src/app/sw.ts. The app is committee-only (2026-09-30): no page and no Supabase
// read is kept; only build assets, fonts, images and the OCR files (and offline.html).

/** Public read-only views without money (docs/MONEY-PRIVACY.md); used by the query persister. */
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

/** The former public app's page cache (still cleared at committee sign-out). */
export const PAGES_CACHE = "pages-v2";
/**
 * Caches of earlier versions: the worker deletes them when it takes over. The committee-only
 * release adds the public pages, the public views and the warming marker.
 */
export const RETIRED_CACHES = [
  "pages",
  "sb-public-views",
  "pages-v2",
  "sb-public-views-v2",
  "warm-meta",
] as const;
/** Where the former public app saved its query cache (IndexedDB key), deleted with the caches. */
export const PERSIST_KEY = "sondoq-query-cache";

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

/** Any Supabase call (views, auth, storage, realtime, RPC): network only, never stored. */
export function isOtherSupabase(url: URL): boolean {
  return isSupabaseHost(url);
}
