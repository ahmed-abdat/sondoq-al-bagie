import { devices, expect, test, type Page } from "@playwright/test";

// The install flow. Needs a production build (pnpm build && pnpm start). Committee-only app: no
// invite banner; «تثبيت التطبيق» in «المزيد» is the one way in.

type Log = { __log: string[] };
const log = (page: Page) => page.evaluate(() => (window as unknown as Log).__log);

/** Start the log (and look like a returning user: the invite banner is gone all the same). */
async function returning(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("sondoq:visit-days", "2026-09-27,2026-09-28");
    (window as unknown as Log).__log = [];
  });
}

/**
 * Chrome's `beforeinstallprompt`, fired the moment the page's capture script is listening,
 * while the HTML is still loading (before React and the app shell exist).
 */
async function chromeOffersInstall(page: Page, outcome: "accepted" | "dismissed") {
  await page.addInitScript((outcome) => {
    const w = window as unknown as Log & Record<string, unknown>;
    Object.defineProperty(window, "__bipReady", {
      configurable: true,
      get: () => undefined,
      set(v) {
        Object.defineProperty(window, "__bipReady", { value: v, writable: true });
        const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
          prompt: () => Promise<void>;
          userChoice: Promise<{ outcome: string }>;
        };
        e.prompt = () => {
          w.__log.push("prompt");
          return Promise.resolve();
        };
        e.userChoice = Promise.resolve({ outcome });
        window.dispatchEvent(e);
        w.__log.push(
          `fired:${document.readyState}:${document.querySelector("main") ? "shell" : "no-shell"}`,
        );
      },
    });
  }, outcome);
}

/** «المزيد» → «تثبيت التطبيق». */
async function tapEntry(page: Page) {
  await page.goto("/committee/more");
  await page.getByRole("button", { name: /تثبيت التطبيق/ }).click();
}

test("no invite banner, even for a returning user Chrome offers the dialog to", async ({
  page,
}) => {
  await returning(page);
  await chromeOffersInstall(page, "dismissed");
  await page.goto("/committee");
  await expect(page.getByRole("heading", { name: "آخر العمليات" })).toBeVisible();
  await page.waitForTimeout(4500); // longer than the old banner's wait
  await expect(page.getByRole("region", { name: "تثبيت التطبيق" })).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.paddingBottom)).toBe("");
});

test("the event caught before the app shell exists opens Chrome's dialog on tap", async ({
  page,
}) => {
  await returning(page);
  await chromeOffersInstall(page, "accepted");
  await page.goto("/committee/more");
  expect((await log(page))[0]).toBe("fired:loading:no-shell");
  await page.getByRole("button", { name: /تثبيت التطبيق/ }).click();
  await expect.poll(() => log(page)).toContain("prompt");
  // one prompt per event: nothing else opened
  expect((await log(page)).filter((l) => l === "prompt")).toHaveLength(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test.describe("inside another app's browser", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/400.0]",
  });
  test("says to open the link in Chrome, with a button that does it", async ({ page }) => {
    await returning(page);
    await tapEntry(page);
    const sheet = page.getByRole("dialog", { name: "افتح الرابط في المتصفح" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link", { name: "فتح في Chrome" })).toHaveAttribute(
      "href",
      /^intent:\/\/.+package=com\.android\.chrome/,
    );
    await expect(sheet.getByRole("button", { name: "نسخ الرابط" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "ليس الآن" })).toHaveCount(0);
  });
});

test("no dialog from the browser (Samsung Internet): the menu steps", async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL,
    locale: "ar",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  });
  const page = await ctx.newPage();
  await returning(page);
  await tapEntry(page);
  // it waits a moment for the browser's own dialog, then shows the steps
  const sheet = page.getByRole("dialog", { name: "ثبّت التطبيق من متصفح سامسونج" });
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(sheet.locator(".bq-steps li")).toHaveCount(3);
  await ctx.close();
});
