import { expect, test } from "@playwright/test";

test("home page loads in Arabic RTL", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
});

test("hidden from everyone outside: no search engine, no link preview, no image with data", async ({
  request,
}) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/User-Agent: \*\s+Disallow: \//);
  expect(robots).not.toMatch(/WhatsApp|facebookexternalhit|Allow:/);
  expect(robots).not.toMatch(/Sitemap/i);
  expect((await request.get("/sitemap.xml")).status()).toBe(404);
  for (const path of ["/", "/committee", "/login"]) {
    const res = await request.get(path);
    expect(res.headers()["x-robots-tag"], path).toContain("noindex");
  }
  // the report's link preview image (it drew who paid) is gone
  expect((await request.get("/report/opengraph-image")).status()).toBe(404);
});
