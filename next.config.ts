import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

// Intentional: the SW is built by `next build --webpack` only; Turbopack (dev, typegen) skips it.
process.env.SERWIST_SUPPRESS_TURBOPACK_WARNING ??= "1";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Off: it would also save logged-in pages. SaveVisitedPages (providers) saves public ones only.
  cacheOnNavigation: false,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV !== "production",
  // Precache only the app shell (low-end phones, small data plans): no Pages Router runtime.
  exclude: [
    /\.map$/,
    /^manifest.*\.js$/,
    /^static\/chunks\/(framework|main|polyfills)-[0-9a-f]+\.js$/,
  ],
  globPublicPatterns: ["icons/**", "offline.html"],
});

// Links printed on shared report images always point at production, never a preview or localhost.
const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://baqie.vercel.app")
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_SITE_ORIGIN: SITE_ORIGIN },
  // Serwist needs webpack for `next build`; dev runs on Turbopack with the SW disabled.
  turbopack: {},
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          // The whole site stays out of search engines (members' names are on it); link previews
          // in WhatsApp/Facebook read the page's OG tags and are not affected. See robots.ts.
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
