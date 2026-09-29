/**
 * Screenshots for the web app manifest (Android's richer install sheet shows them like an app
 * store). Run against a fixtures build so no real member data appears:
 *   SONDOQ_FIXTURES=1 pnpm build && SONDOQ_FIXTURES=1 pnpm start -p 3300
 *   pnpm screenshots            (BASE=http://localhost:3300 by default)
 * Writes public/screenshots/{home,members,report}-narrow.jpg (1080×1920) and home-wide.jpg (1920×1080).
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3300";
const OUT = "public/screenshots";
mkdirSync(OUT, { recursive: true });

const prepare = async (page: Page) => {
  await page.addInitScript(() => {
    // no install invite, no fixtures banner in the pictures
    localStorage.setItem("sondoq:install-dismissed-at", String(Date.now()));
  });
};
const shoot = async (page: Page, path: string, file: string) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: ".bq-demo,[data-sonner-toaster]{display:none!important}" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600); // entrance animations
  await page.screenshot({ path: `${OUT}/${file}`, type: "jpeg", quality: 82 });
  console.log(`${OUT}/${file}`);
};

const browser = await chromium.launch();
const narrow = await browser.newContext({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "ar",
  timezoneId: "Africa/Nouakchott",
});
const p = await narrow.newPage();
await prepare(p);
for (const [path, name] of [
  ["/", "home"],
  ["/members", "members"],
  ["/report", "report"],
] as const)
  await shoot(p, path, `${name}-narrow.jpg`);

const wide = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1.5,
  locale: "ar",
  timezoneId: "Africa/Nouakchott",
});
const w = await wide.newPage();
await prepare(w);
await shoot(w, "/", "home-wide.jpg");
await browser.close();
