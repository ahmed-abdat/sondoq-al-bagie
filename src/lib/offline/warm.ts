// Offline for pages never opened: after the first visit, every public page is saved in the
// background, one at a time, so a villager who only opened the home can read the members list,
// the accounts, the donations and the report offline. Only public, amount-free HTML (money comes
// per request, never in these pages); never a private or no-store response (mayStore).
import { mayStore, PAGES_CACHE } from "./cache-rules";
import { allowsBackgroundDownload, type NetworkInfo } from "./data-saver";

/** Every public page (committee, /me, /m/*, /r/* are private and never saved). */
export const WARM_PAGES = ["/", "/members", "/accounts", "/donations", "/report"] as const;
/** On Save-Data or 2G: the two small pages people open most. */
export const SMALL_PAGES = ["/", "/members"] as const;
/** Stop once this much was downloaded in one round (the five pages are about 1 MB). */
export const WARM_MAX_BYTES = 3_000_000;
/** Refresh the saved pages when the app is reopened after this long. */
export const WARM_EVERY_MS = 30 * 60 * 1000;

/**
 * When the pages were last saved, in its own cache: the new worker deletes it when it takes over
 * (a new build: pages point at new script files), so the next open saves them again at once.
 */
export const WARM_META_CACHE = "warm-meta";
const WARMED_AT = "/__warmed-at";

export function pagesToWarm(conn: NetworkInfo | undefined): readonly string[] {
  return allowsBackgroundDownload(conn) ? WARM_PAGES : SMALL_PAGES;
}

export function warmDue(lastAt: number | null, now: number = Date.now()): boolean {
  return lastAt === null || now - lastAt >= WARM_EVERY_MS;
}

type Deps = {
  caches: Pick<CacheStorage, "open">;
  fetch: typeof fetch;
  origin: string;
  maxBytes?: number;
};

export async function lastWarmed(c: Pick<CacheStorage, "open">): Promise<number | null> {
  try {
    const res = await (await c.open(WARM_META_CACHE)).match(WARMED_AT);
    const t = Number(await res?.text());
    return Number.isFinite(t) && t > 0 ? t : null;
  } catch {
    return null;
  }
}

/**
 * Save `paths` one after the other. `cache: "no-cache"` asks the server whether each page changed
 * (ETag): an unchanged page costs a few bytes, not a second download. Returns the saved paths.
 */
export async function warmPages(paths: readonly string[], d: Deps): Promise<string[]> {
  const max = d.maxBytes ?? WARM_MAX_BYTES;
  const cache = await d.caches.open(PAGES_CACHE);
  const saved: string[] = [];
  let bytes = 0;
  let failed = false;
  for (const path of paths) {
    if (bytes >= max) break;
    const url = new URL(path, d.origin).href;
    try {
      const res = await d.fetch(url, {
        credentials: "same-origin",
        cache: "no-cache",
        priority: "low",
      } as RequestInit);
      if (!res.ok || res.redirected || !mayStore(res.headers.get("cache-control"))) continue;
      const body = await res.clone().arrayBuffer();
      bytes += body.byteLength;
      await cache.put(url, res);
      saved.push(path);
    } catch {
      failed = true; // offline or storage full: try again next time
      break;
    }
  }
  if (!failed && saved.length) {
    try {
      await (await d.caches.open(WARM_META_CACHE)).put(WARMED_AT, new Response(String(Date.now())));
    } catch {
      /* not remembered: the next open saves again */
    }
  }
  return saved;
}
