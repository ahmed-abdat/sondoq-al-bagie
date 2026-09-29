import { expect, test, type Page } from "@playwright/test";

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

test("no dialog from Chrome: the tap opens the steps, never a dead button", async ({ page }) => {
  await returning(page);
  await page.goto("/");
  await card(page).getByRole("button", { name: "تثبيت" }).click();
  const sheet = page.getByRole("dialog", { name: "ثبّت التطبيق من Chrome" });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByText("اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»."),
  ).toBeVisible();
  await expect(sheet.getByRole("img", { name: /قائمة Chrome/ })).toBeVisible();
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

test("not on the very first visit", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(card(page)).toHaveCount(0);
});

test("thanks the member once the app is installed", async ({ page }) => {
  await returning(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.getByText("تم تثبيت التطبيق. تجده الآن على الشاشة الرئيسية.")).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});
