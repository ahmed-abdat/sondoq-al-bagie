/** Public address of the app (links in shared text, metadataBase). */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === "production" ? "https://baqie.vercel.app" : "http://localhost:3000")
).replace(/\/+$/, "");
