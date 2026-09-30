import type { MetadataRoute } from "next";

// The app is for the committee only (owner, 2026-09-30): nothing on it is for search engines or
// link previews. No sitemap. Every response also carries `X-Robots-Tag: noindex` (next.config.ts).
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
