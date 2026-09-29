// Demo mode: fictional data + committee flows simulated in the browser, never reaching the
// server. Pure and edge-safe (imported by src/proxy.ts). Hard guard: never on production.
type Env = Record<string, string | undefined>;

export function isDemo(env: Env = process.env): boolean {
  return env.SONDOQ_FIXTURES === "1" && env.VERCEL_ENV !== "production";
}

export const DEMO_BANNER = "نسخة تجريبية: البيانات وهمية ولا يُحفظ شيء.";
export const DEMO_USER = "مستخدم تجريبي";

/** Demo: set in the browser by the committee pages, so the demo committee sees money on public
 *  pages (a real committee has its Supabase session instead). */
export const DEMO_COMMITTEE_COOKIE = "bq_demo_committee";
