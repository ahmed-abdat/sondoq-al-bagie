import { expect, test } from "@playwright/test";
import { committeePhone, strangerPhone } from "./steps";

// The committee-only gate on the real app (the demo build skips it): signed out, every page is
// the login; signed in, the former public pages lead to the committee's.

test("signed out: every page, member link and receipt check leads to the login", async ({
  browser,
  baseURL,
}) => {
  const { page } = await strangerPhone(browser, baseURL!);
  for (const path of [
    "/",
    "/members",
    "/accounts",
    "/donations",
    "/report",
    "/me",
    "/m/x",
    "/r/BQ-TEST-0001",
  ]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login$/);
  }
  await page.goto("/committee/payments");
  await expect(page).toHaveURL(/\/login\?next=%2Fcommittee%2Fpayments$/);
  await expect(page.getByRole("link", { name: /الصفحة العامة/ })).toHaveCount(0);
});

test("signed in: the committee lands on its hub; former public pages lead there", async ({
  browser,
  baseURL,
}) => {
  const { page } = await committeePhone(browser, baseURL!);
  await expect(page).toHaveURL(/\/committee$/);
  const to: Record<string, RegExp> = {
    "/": /\/committee$/,
    "/members": /\/committee\/members$/,
    "/accounts": /\/committee$/,
    "/m/x": /\/committee$/,
    "/r/BQ-TEST-0001": /\/committee$/,
  };
  for (const [from, dest] of Object.entries(to)) {
    await page.goto(from);
    await expect(page, from).toHaveURL(dest);
  }
  await page.goto("/report");
  await expect(page).toHaveURL(/\/report$/);
});

test("a phone that used the public app: its saved pages are dropped, «/» is the login", async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await strangerPhone(browser, baseURL!);
  // the former app's saved home page, as an old worker left it
  await ctx.addInitScript(() => {
    if (navigator.serviceWorker.controller) return;
    void caches
      .open("pages-v2")
      .then((c) => c.put(`${location.origin}/`, new Response("<h1>صفحة قديمة</h1>")));
  });
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((r) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => r(), { once: true }),
      );
  });
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain("pages-v2");
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("صفحة قديمة")).toHaveCount(0);
});
