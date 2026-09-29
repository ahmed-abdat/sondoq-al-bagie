import { expect, test, type Page } from "@playwright/test";

// The demo committee (fixtures build, not production): /committee opens without signing in and
// committee writes are simulated in the browser.

type W = { __badge: (number | "clear")[] };
const badge = (page: Page) => page.evaluate(() => (window as unknown as W).__badge);

test.beforeEach(async ({ page }) => {
  // record what the page asks of the Badging API
  await page.addInitScript(() => {
    const w = window as unknown as W & Navigator;
    w.__badge = [];
    Object.assign(navigator, {
      setAppBadge: async (n?: number) => void w.__badge.push(n ?? 0),
      clearAppBadge: async () => void w.__badge.push("clear"),
    });
  });
});

test("the app icon shows the payments waiting, and follows a confirmation", async ({ page }) => {
  await page.goto("/committee");
  const heading = page.locator("#bq-wait-h");
  const waiting = Number((await heading.textContent())!.match(/\d+/)![0]);
  expect(waiting).toBeGreaterThan(0);
  await expect.poll(() => badge(page).then((b) => b.at(-1))).toBe(waiting);

  await page.getByRole("button", { name: "تأكيد الاستلام" }).first().click();
  await expect(heading).toContainText(String(waiting - 1));
  await expect.poll(() => badge(page).then((b) => b.at(-1))).toBe(waiting - 1 || "clear");
});

test("the notifications switch is replaced by a plain note in the demo", async ({ page }) => {
  await page.goto("/committee/account");
  await expect(page.getByRole("heading", { name: "الإشعارات" })).toBeVisible();
  await expect(page.getByText("لا تعمل الإشعارات في النسخة التجريبية.")).toBeVisible();
  await expect(page.getByRole("switch", { name: /إشعارات الدفعات الجديدة/ })).toHaveCount(0);
});
