import { expect, test } from "@playwright/test";

test("home page loads in Arabic RTL", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
});

test("hidden from search engines, link previews still work", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/User-Agent: \*\s+Disallow: \//);
  expect(robots).toMatch(/User-Agent: WhatsApp/);
  expect(robots).not.toMatch(/Sitemap/i);
  expect((await request.get("/sitemap.xml")).status()).toBe(404);

  for (const path of ["/", "/members", "/report"]) {
    const res = await request.get(path);
    expect(res.headers()["x-robots-tag"], path).toContain("noindex");
  }

  // WhatsApp reads og:image from the page and fetches it
  const html = await (
    await request.get("/report", { headers: { "User-Agent": "WhatsApp/2.24" } })
  ).text();
  const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  expect(og).toBeTruthy();
  const img = await request.get(new URL(og!).pathname + new URL(og!).search);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
});
