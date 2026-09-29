// Which pages the service worker answered from its saved copy (network off or too slow), so the
// page can say how old what it shows is. Pure; the map lives in the worker (src/app/sw.ts).
import { timeAgo } from "./relative-time";

export interface Served {
  /** when the saved copy was fetched (its Date header), ms */
  cachedAt: number;
  /** when the worker answered with it, ms */
  servedAt: number;
}

export const SERVED_QUERY = "SERVED_FROM_CACHE?";

/** Pages and their RSC payloads share a key: the path. */
const servedKey = (url: string) => new URL(url, "http://x").pathname;

export function recordServed(
  map: Map<string, Served>,
  url: string,
  dateHeader: string | null,
  now: number = Date.now(),
): void {
  const d = dateHeader ? Date.parse(dateHeader) : NaN;
  map.set(servedKey(url), { cachedAt: Number.isFinite(d) ? d : now, servedAt: now });
  if (map.size > 50) map.delete(map.keys().next().value!); // oldest first
}

/** The saved copy's age if `path` was answered from the cache at or after `since`, else null. */
export function lookupServed(map: Map<string, Served>, path: string, since: number): number | null {
  const s = map.get(servedKey(path));
  return s && s.servedAt >= since ? s.cachedAt : null;
}

/** Online but the page came from the saved copy (network too slow). */
export function savedCopyMessage(cachedAt: number, now: number = Date.now()): string {
  return `هذه نسخة محفوظة ${timeAgo(cachedAt, now)}.`;
}
