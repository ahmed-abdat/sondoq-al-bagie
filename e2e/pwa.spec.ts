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

// Committee-only (2026-09-30): no page is kept on the phone. Offline, every page is the
// Arabic offline page; the banner says the connection is gone.

test("nothing is kept: even a visited page offline is the offline page", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForServiceWorker(page);
  await page.reload(); // served through the worker: it keeps nothing
  await context.setOffline(true);
  for (const path of ["/", "/members", "/committee", "/login", "/r/BQ-TEST-0001"]) {
    await page.goto(path);
    await expect(page.getByText("لا يوجد اتصال بالإنترنت"), path).toBeVisible();
  }
  await context.setOffline(false);
  await page.goto("/"); // the offline page reloads itself once back online
  expect(await page.evaluate(() => caches.keys())).not.toEqual(
    expect.arrayContaining([expect.stringMatching(/^(pages|sb-public-views)/)]),
  );
});

test("the offline page: Arabic, with the app's button", async ({ page, context }) => {
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

test("offline banner shows while offline and hides when back", async ({ page, context }) => {
  await page.goto("/committee");
  await waitForServiceWorker(page);
  await expect(page.getByText(/غير متصل/)).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.getByText(/غير متصل/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/غير متصل/)).toHaveCount(0);
});

test("the former public app's saved pages and data are dropped when this worker takes over", async ({
  page,
}) => {
  // a phone that used the public app: its saved pages, views, warming marker and query cache
  await page.addInitScript(() => {
    if (navigator.serviceWorker.controller) return;
    for (const name of ["pages-v2", "sb-public-views-v2", "warm-meta", "pages"])
      void caches.open(name).then((c) => c.put("/old", new Response("<p>أحمد ولد محمد ✓</p>")));
    const open = indexedDB.open("keyval-store");
    open.onupgradeneeded = () => open.result.createObjectStore("keyval");
    open.onsuccess = () =>
      open.result
        .transaction("keyval", "readwrite")
        .objectStore("keyval")
        .put("{}", "sondoq-query-cache");
  });
  await page.goto("/");
  await waitForServiceWorker(page); // no «تحديث» tap: this release takes over by itself
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .not.toEqual(expect.arrayContaining(["pages-v2"]));
  const keys = await page.evaluate(() => caches.keys());
  for (const old of ["sb-public-views-v2", "warm-meta", "pages"]) expect(keys).not.toContain(old);
  const saved = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("keyval-store");
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("keyval")) return resolve(null);
          const get = db.transaction("keyval").objectStore("keyval").get("sondoq-query-cache");
          get.onsuccess = () => resolve(get.result ?? null);
        };
      }),
  );
  expect(saved).toBeNull();
});
