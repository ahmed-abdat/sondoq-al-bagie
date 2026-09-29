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

  await page.getByRole("button", { name: "أكّد الاستلام" }).first().click();
  await expect(heading).toContainText(String(waiting - 1));
  await expect.poll(() => badge(page).then((b) => b.at(-1))).toBe(waiting - 1 || "clear");
});

test("the notifications switch is replaced by a plain note in the demo", async ({ page }) => {
  await page.goto("/committee/account");
  await expect(page.getByRole("heading", { name: "الإشعارات" })).toBeVisible();
  await expect(page.getByText("لا تعمل الإشعارات في النسخة التجريبية.")).toBeVisible();
  await expect(page.getByRole("switch", { name: /إشعارات الدفعات الجديدة/ })).toHaveCount(0);
});

test("late reminders: «ذكّر الجميع بالترتيب» walks the list one WhatsApp at a time", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((url: string) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(url));
      return null;
    }) as typeof window.open;
  });
  await page.goto("/committee/late");
  await expect(
    page.getByText("الأكثر تأخرًا أولًا. افتح رسالة كل عضو في واتساب وأرسلها له."),
  ).toBeVisible();
  await page.getByRole("button", { name: "ذكّر الجميع بالترتيب" }).click();
  const walk = page.locator(".bq-ml-walk");
  const first = await walk.locator(".bq-ml-walk-t").textContent();
  await walk.getByRole("button", { name: /أرسل في واتساب/ }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length))
    .toBe(1);
  await expect(walk.locator(".bq-ml-walk-t")).not.toHaveText(first!);
  await walk.getByRole("button", { name: "إيقاف" }).click();
  await expect(walk).toHaveCount(0);
});

test("hub, demo queue: empty (?demoQueue=0) says so and offers a cash record", async ({ page }) => {
  await page.goto("/committee?demoQueue=0");
  await expect(page.getByText("لا دفعات تنتظر")).toBeVisible();
  await expect(page.getByRole("button", { name: /سجّل دفعة نقدًا أو تحويلًا/ })).toBeVisible();
  await expect(page.locator("article.bq-slip")).toHaveCount(0);
});

test("hub, demo queue: 12 pending (?demoQueue=12) shows one open slip and five rows", async ({
  page,
}) => {
  await page.goto("/committee?demoQueue=12");
  await expect(page.getByRole("button", { name: /للمراجعة\s*12/ })).toBeVisible();
  await expect(page.locator("article.bq-slip")).toHaveCount(1);
  await expect(page.locator(".bq-rev-row")).toHaveCount(4);
  await page.getByRole("button", { name: /عرض الكل/ }).click();
  await expect(page.locator(".bq-rev-row")).toHaveCount(11);
});
