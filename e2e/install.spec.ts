import { devices, expect, test, type Page } from "@playwright/test";

// The install flow. Needs a production build (pnpm build && pnpm start).

type Log = { __log: string[] };
const log = (page: Page) => page.evaluate(() => (window as unknown as Log).__log);

/** A returning member (second day of use): the invite may show. */
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


/** The install banner above the bottom nav. */
const card = (page: Page) => page.getByRole("region", { name: "تثبيت التطبيق" });

test("the event caught before the app shell exists opens Chrome's dialog on tap", async ({
  page,
}) => {
  await returning(page);
  await chromeOffersInstall(page, "accepted");
  await page.goto("/");
  expect((await log(page))[0]).toBe("fired:loading:no-shell");

  await card(page).getByRole("button", { name: "تثبيت" }).click();
  await expect.poll(() => log(page)).toContain("prompt");
  await expect(card(page)).toHaveCount(0);

  // a second tap never reuses the spent event
  expect((await log(page)).filter((l) => l === "prompt")).toHaveLength(1);
});

test("«ليس الآن» after Chrome's dialog: hidden, and still hidden after a reload", async ({
  page,
}) => {
  await returning(page);
  await chromeOffersInstall(page, "dismissed");
  await page.goto("/");
  await card(page).getByRole("button", { name: "تثبيت" }).click();
  await expect(card(page)).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(card(page)).toHaveCount(0);
});

test.describe("inside another app's browser", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/400.0]",
  });
  test("says to open the link in Chrome, with a button that does it", async ({ page }) => {
    await returning(page);
    await page.goto("/");
    await card(page).getByRole("button", { name: "تثبيت" }).click();
    const sheet = page.getByRole("dialog", { name: "افتح الرابط في المتصفح" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link", { name: "فتح في Chrome" })).toHaveAttribute(
      "href",
      /^intent:\/\/.+package=com\.android\.chrome/,
    );
    await expect(sheet.getByRole("button", { name: "نسخ الرابط" })).toBeVisible();
  });
});

test.describe("the banner comes back with growing gaps", () => {
  test("«ليس الآن» in the steps sheet snoozes it too (Samsung Internet)", async ({
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
    await page.goto("/");
    await card(page).getByRole("button", { name: "تثبيت" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "ليس الآن" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(card(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("sondoq:install-backoff"))).toMatch(
      /^1,\d+$/,
    );
    await ctx.close();
  });
});

test("sits above the bottom nav without covering it", async ({ page }) => {
  await returning(page);
  await chromeOffersInstall(page, "dismissed");
  await page.goto("/");
  const nav = await page.locator(".bq-bnav").boundingBox();
  // once the slide-in has finished
  await expect
    .poll(async () => {
      const bar = await card(page).boundingBox();
      return bar ? bar.y + bar.height : Infinity;
    })
    .toBeLessThanOrEqual(nav!.y);
  // and the page keeps room for it at the bottom
  expect(await page.evaluate(() => document.body.style.paddingBottom)).toMatch(/^\d+px$/);
});

test("desktop wording", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ ...devices["Desktop Chrome"], baseURL, locale: "ar" });
  const page = await ctx.newPage();
  await returning(page);
  await chromeOffersInstall(page, "dismissed");
  await page.goto("/");
  await expect(card(page)).toContainText("أضف الصندوق إلى جهازك");
  await expect(card(page).getByRole("button", { name: "تثبيت" })).toHaveCSS("min-height", "48px");
  await ctx.close();
});
