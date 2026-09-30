import { expect, test, type Page } from "@playwright/test";

// Needs a production build (`pnpm build`): the service worker is disabled in dev.

async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        }),
      );
    }
    return reg.active?.state;
  });
}

/**
 * On a first visit the page is saved for offline only after the worker takes control AND the
 * browser is idle (SaveVisitedPages); until then offline shows /offline.html, by design.
 */
async function waitForSaved(page: Page, path: string) {
  await expect
    .poll(() =>
      page.evaluate(async (p) => !!(await (await caches.open("pages-v2")).match(p)), path),
    )
    .toBe(true);
}

test("manifest is valid and the app is installable", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({
    short_name: "صندوق الرابطة",
    lang: "ar",
    dir: "rtl",
    display: "standalone",
    start_url: "/",
    scope: "/",
  });
  expect(m.shortcuts.map((s: { name: string }) => s.name)).toEqual(["الأعضاء", "اللجنة"]);
  for (const size of ["192x192", "512x512"]) {
    expect(
      m.icons.some(
        (i: { sizes: string; purpose?: string }) => i.sizes === size && i.purpose === "any",
      ),
    ).toBe(true);
    expect(
      m.icons.some(
        (i: { sizes: string; purpose?: string }) => i.sizes === size && i.purpose === "maskable",
      ),
    ).toBe(true);
  }
  expect(m.screenshots.some((s: { form_factor?: string }) => s.form_factor === "narrow")).toBe(
    true,
  );
  for (const shot of m.screenshots) {
    const r = await request.get(shot.src);
    expect(r.headers()["content-type"], shot.src).toBe("image/jpeg");
  }
  for (const icon of [...m.icons, ...m.shortcuts.flatMap((s: { icons: unknown[] }) => s.icons)]) {
    const r = await request.get(icon.src);
    expect(r.headers()["content-type"], icon.src).toBe("image/png");
  }

  await page.goto("/");
  await waitForServiceWorker(page);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);
});

test("an unvisited page offline shows the Arabic offline page", async ({ page, context }) => {
  await page.goto("/");
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.goto("/never-visited-page");
  await expect(page.getByText("لا يوجد اتصال بالإنترنت")).toBeVisible();
  // the app's button: a 48px Forest pill
  const home = page.getByRole("link", { name: "الصفحة الرئيسية" });
  await expect(home).toHaveCSS("min-height", "48px");
  await expect(home).toHaveCSS("border-radius", "999px");
  await expect(home).toHaveCSS("background-color", "rgb(26, 95, 46)");
  await context.setOffline(false);
});

test("committee pages are never served from the cache", async ({ page, context }) => {
  await page.goto("/");
  await waitForServiceWorker(page);
  await page.goto("/login");
  await context.setOffline(true);
  await page.goto("/login");
  await expect(page.getByText("لا يوجد اتصال بالإنترنت")).toBeVisible();
  await context.setOffline(false);
});

test("receipt verification is never served from the cache", async ({ page, context }) => {
  await page.goto("/");
  await waitForServiceWorker(page);
  await page.goto("/r/BQ-TEST-0001");
  await context.setOffline(true);
  await page.goto("/r/BQ-TEST-0001");
  await expect(page.getByText("لا يوجد اتصال بالإنترنت")).toBeVisible();
  await context.setOffline(false);
});

test("copies saved before money privacy are dropped when the new worker takes over", async ({
  page,
}) => {
  // a phone with the old caches (they could hold amounts)
  await page.addInitScript(() => {
    void caches.open("pages").then((c) => c.put("/old", new Response("٢٩٠ ٥٠٠")));
    void caches.open("sb-public-views").then((c) => c.put("/old", new Response("{}")));
  });
  await page.goto("/");
  await waitForServiceWorker(page);
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .not.toEqual(expect.arrayContaining(["pages"]));
  const keys = await page.evaluate(() => caches.keys());
  expect(keys).not.toContain("sb-public-views");
});
