// Counts failed attempts per key (here: per IP on /m/<token>) in a sliding window. In memory, so
// per server instance: a brake on guessing links, not a hard guarantee (free plan, no shared store).

export interface FailLimiter {
  blocked(key: string, now?: number): boolean;
  fail(key: string, now?: number): void;
}

export function createFailLimiter(max = 10, windowMs = 10 * 60_000, maxKeys = 5_000): FailLimiter {
  const hits = new Map<string, number[]>();
  const recent = (key: string, now: number) =>
    (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  return {
    blocked(key, now = Date.now()) {
      return recent(key, now).length >= max;
    },
    fail(key, now = Date.now()) {
      const list = recent(key, now);
      list.push(now);
      hits.delete(key); // re-insert: the map stays ordered by last failure
      hits.set(key, list);
      if (hits.size > maxKeys) hits.delete(hits.keys().next().value!);
    },
  };
}

/** The caller's IP behind Vercel's proxy (first x-forwarded-for hop). */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
