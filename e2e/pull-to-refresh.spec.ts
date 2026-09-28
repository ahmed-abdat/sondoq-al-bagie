import { expect, test, type Page } from "@playwright/test";

// Installed-app emulation: report display-mode standalone to the page.
async function standalone(page: Page) {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) =>
      q.includes("display-mode: standalone")
        ? ({
            matches: true,
            media: q,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent: () => false,
          } as MediaQueryList)
        : real(q);
  });
}

/** A real touch drag (CDP), `dy` px down from the top area of the page. */
async function pull(page: Page, dy: number) {
  const cdp = await page.context().newCDPSession(page);
  const x = 200;
  const y0 = 300;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y0 + (dy * i) / 12 }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

const indicator = (page: Page) => page.getByTestId("pull-indicator");

test("installed app: pulling down past the threshold refreshes", async ({ page }) => {
  await standalone(page);
  await page.goto("/");
  await expect(indicator(page)).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.style.overscrollBehaviorY)).toBe(
    "contain",
  );

  const rsc = page.waitForRequest((r) => r.url().includes("_rsc") || r.headers()["rsc"] === "1");
  await pull(page, 260);
  await expect(indicator(page)).toHaveAttribute("data-refreshing", "true");
  await rsc; // router.refresh() re-fetched the server components
  await expect(indicator(page)).toHaveAttribute("data-refreshing", "false", { timeout: 10_000 });
});

test("installed app: a short pull does nothing", async ({ page }) => {
  await standalone(page);
  await page.goto("/");
  await pull(page, 40);
  await page.waitForTimeout(300);
  await expect(indicator(page)).toHaveAttribute("data-refreshing", "false");
});

test("installed app offline: pull shows the offline message instead", async ({ page, context }) => {
  await standalone(page);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await pull(page, 260);
  await expect(page.getByText("غير متصل. تُعرض آخر بيانات محفوظة")).toBeVisible();
  await expect(indicator(page)).toHaveAttribute("data-refreshing", "false");
  await context.setOffline(false);
});

test("browser tab: no custom pull-to-refresh (the browser has its own)", async ({ page }) => {
  await page.goto("/");
  await expect(indicator(page)).toHaveCount(0);
});
