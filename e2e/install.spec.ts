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

/** Chrome's event arriving later, as on a real phone (after load and some use of the site). */
async function fireChromeEvent(page: Page, outcome: "accepted" | "dismissed" = "accepted") {
  await page.evaluate((outcome) => {
    const w = window as unknown as Log;
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

test("Chrome's event after the page is up: the banner waits for it, the tap opens the dialog", async ({
  page,
}) => {
  await returning(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(card(page)).toHaveCount(0); // not yet: Chrome may still offer its dialog
  await fireChromeEvent(page);
  await card(page).getByRole("button", { name: "تثبيت" }).click();
  await expect.poll(() => log(page)).toContain("prompt");
  await expect(page.getByRole("dialog")).toHaveCount(0); // no steps sheet
  await expect(card(page)).toHaveCount(0);
});

test("a tap just before Chrome's event: it waits for it and opens the dialog, no steps", async ({
  page,
}) => {
  await returning(page);
  await page.goto("/accounts");
  const entry = page.getByRole("button", { name: /تثبيت التطبيق/ });
  await entry.click();
  await expect(entry).toHaveAttribute("aria-busy", "true");
  await fireChromeEvent(page, "dismissed"); // a moment after the tap
  await expect.poll(() => log(page)).toEqual(["prompt"]);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // «إلغاء» in Chrome's dialog: Chrome offers a new event, and the next tap prompts again
  await fireChromeEvent(page);
  await entry.click();
  await expect.poll(() => log(page)).toEqual(["prompt", "prompt"]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Chrome's dialog at ~35 s (its engagement check): the banner appears then, the tap opens it", async ({
  page,
}) => {
  await page.clock.install();
  await returning(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.clock.fastForward(20_000);
  await expect(card(page)).toHaveCount(0); // Chrome: no steps banner while its dialog may come
  await page.clock.fastForward(15_000); // ~35 s on the site
  await fireChromeEvent(page);
  await expect(card(page)).toBeVisible();
  await card(page).getByRole("button", { name: "تثبيت" }).click();
  await expect.poll(() => log(page)).toContain("prompt");
  await expect(page.getByRole("dialog")).toHaveCount(0); // never the steps
});

test("Chrome never offers its dialog: no banner; the permanent entry opens the steps", async ({
  page,
}) => {
  await returning(page);
  await page.goto("/accounts");
  await page.waitForTimeout(5_000);
  await expect(page.locator(".bq-ib")).toHaveCount(0); // the banner (the page's own section shares its name)
  await page.getByRole("button", { name: /تثبيت التطبيق/ }).click();
  const sheet = page.getByRole("dialog", { name: "ثبّت التطبيق من Chrome" });
  await expect(sheet).toBeVisible({ timeout: 8_000 }); // after the tap's wait for Chrome
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
  await page.addInitScript(() => ((window as unknown as Log).__log = []));
  await chromeOffersInstall(page, "accepted"); // no waiting for Chrome: the rule itself hides it
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

test.describe("the banner comes back with growing gaps", () => {
  const T0 = new Date("2026-09-28T10:00:00Z").getTime();
  const HOUR = 60 * 60 * 1000;

  test("«✕» hides it; still hidden 12 hours later, back after a day", async ({ context }) => {
    const open = async (at: number) => {
      const page = await context.newPage(); // a new tab = a new session
      await page.clock.install({ time: at });
      await returning(page);
      await chromeOffersInstall(page, "dismissed"); // shown at once: the gap is what hides it
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      return page;
    };
    const first = await open(T0);
    await expect(card(first)).toBeVisible();
    await card(first).getByRole("button", { name: "ليس الآن" }).click();
    await expect(card(first)).toHaveCount(0);
    const [count, nextAt] = (
      (await first.evaluate(() => localStorage.getItem("sondoq:install-backoff"))) ?? ""
    )
      .split(",")
      .map(Number);
    expect(count).toBe(1);
    expect(Math.abs(nextAt - (T0 + 24 * HOUR))).toBeLessThan(60_000); // one day after the tap

    await expect(card(await open(T0 + 12 * HOUR))).toHaveCount(0);
    await expect(card(await open(T0 + 25 * HOUR))).toBeVisible();
  });

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

test("once per session: not again after a reload", async ({ page }) => {
  await returning(page);
  await chromeOffersInstall(page, "dismissed"); // shown at once: the session is what hides it
  await page.goto("/");
  await expect(card(page)).toBeVisible();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(card(page)).toHaveCount(0);
});

test("steps aside while the member types", async ({ page }) => {
  await returning(page);
  await chromeOffersInstall(page, "dismissed");
  await page.goto("/");
  await expect(card(page)).toBeVisible();
  await page.getByPlaceholder("اكتب الاسم أو الرقم، مثل ب 12").focus();
  await expect(card(page)).toHaveCount(0);
  await page.getByPlaceholder("اكتب الاسم أو الرقم، مثل ب 12").blur();
  await expect(card(page)).toBeVisible();
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

test("installed app: never", async ({ page }) => {
  await returning(page);
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
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(card(page)).toHaveCount(0);
});

test("a member's first open: the install invite waits until the «أنت» card was seen", async ({
  page,
}) => {
  await page.addInitScript(() => ((window as unknown as Log).__log = []));
  await chromeOffersInstall(page, "dismissed");
  await page.goto("/m/demo"); // → /?welcome=1, the demo member's personal link
  await expect(page).toHaveURL(/\/$/); // the marker is gone from the address
  await expect(page.locator(".bq-you")).toBeVisible();
  await expect(card(page)).toHaveCount(0); // not over the card's buttons on arrival
  // the card is on screen for a moment → the invite comes (even on a very first visit)
  await page.locator(".bq-you").scrollIntoViewIfNeeded();
  await expect(card(page)).toBeVisible({ timeout: 8_000 });
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

test("never over the report", async ({ page }) => {
  await returning(page);
  await chromeOffersInstall(page, "accepted");
  await page.goto("/report");
  await page.waitForLoadState("networkidle");
  await expect(card(page)).toHaveCount(0);
});
