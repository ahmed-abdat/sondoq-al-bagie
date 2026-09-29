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
    short_name: "صندوق الشباب",
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

test("a visited page opens offline from the cache", async ({ page, context }) => {
  await page.goto("/");
  await waitForServiceWorker(page);
  await page.reload(); // now served through the SW, so it is stored
  const title = await page.locator("main").first().textContent();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("لا يوجد اتصال بالإنترنت")).toHaveCount(0);
  expect(await page.locator("main").first().textContent()).toBe(title);
  await context.setOffline(false);
});

test("an unvisited page offline shows the Arabic offline page", async ({ page, context }) => {
  await page.goto("/");
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.goto("/never-visited-page");
  await expect(page.getByText("لا يوجد اتصال بالإنترنت")).toBeVisible();
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

test("offline banner shows while offline and hides when back", async ({ page, context }) => {
  await page.goto("/");
  await waitForServiceWorker(page);
  await expect(page.getByText(/غير متصل/)).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.getByText(/غير متصل/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/غير متصل/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/غير متصل/)).toHaveCount(0);
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

test("public pages visited by in-app navigation open offline", async ({ page, context }) => {
  await page.goto("/");
  await waitForServiceWorker(page);
  const pages = ["/members", "/accounts", "/donations"];
  for (const path of pages) {
    await page.locator(`a[href="${path}"]:visible`).first().click();
    await page.waitForURL(`**${path}`);
    await expect
      .poll(() => page.evaluate(async (p) => !!(await (await caches.open("pages")).match(p)), path))
      .toBe(true);
  }
  await context.setOffline(true);
  for (const path of ["/", ...pages]) {
    await page.goto(path);
    await expect(page.getByText("لا يوجد اتصال بالإنترنت")).toHaveCount(0);
    await expect(page.getByText(/غير متصل/)).toBeVisible();
  }
  await context.setOffline(false);
});

test("in data-saver mode, visited pages are not downloaded again for offline", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true, effectiveType: "4g" },
    }),
  );
  await page.goto("/");
  await waitForServiceWorker(page);
  const hits: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "fetch" && new URL(r.url()).pathname === "/members")
      if (!r.headers()["rsc"]) hits.push(r.url());
  });
  await page.locator('a[href="/members"]:visible').first().click();
  await page.waitForURL("**/members");
  await page.waitForTimeout(3000); // past the idle timeout
  expect(hits).toEqual([]);
  expect(
    await page.evaluate(async () => !!(await (await caches.open("pages")).match("/members"))),
  ).toBe(false);
});
