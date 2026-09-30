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

test("home: the fund first, «سجّل دفعة» opens the record screen, five tabs", async ({ page }) => {
  await page.goto("/committee");
  const hero = page.getByRole("region", { name: "الصندوق" });
  await expect(hero).toContainText(/\d[\d\s  ]* أوقية/);
  await expect(page.getByRole("heading", { name: "آخر العمليات" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "التنقل" });
  await expect(nav.getByRole("link")).toHaveText([
    "الرئيسية",
    "الأعضاء",
    "التبرعات",
    "التقارير",
    "المزيد",
  ]);
  await expect(nav.getByRole("link", { name: "الرئيسية" })).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("link", { name: /سجّل دفعة/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/committee\/record$/);
  await expect(page.getByRole("heading", { name: "سجّل دفعة", level: 1 })).toBeVisible();
  // a task of its own: no tab is marked current
  await expect(
    page.getByRole("navigation", { name: "التنقل" }).locator('[aria-current="page"]'),
  ).toHaveCount(0);
});

test("«المزيد» → «سجل العمليات»: who recorded what", async ({ page }) => {
  await page.goto("/committee");
  await page
    .getByRole("navigation", { name: "التنقل" })
    .getByRole("link", { name: "المزيد" })
    .click();
  await page.getByRole("link", { name: /سجل العمليات/ }).click();
  await expect(page.getByRole("heading", { name: "سجل العمليات", level: 1 })).toBeVisible();
  await expect(page.getByRole("main")).toContainText(/سجّل دفعة .+: \d[\d\s  ]* أوقية/);
});

// Payments recorded before the committee-only update still wait on /committee/review (reached
// from «المزيد» while any are left); the app icon counts them.
test("the app icon shows the payments waiting, and follows a confirmation", async ({ page }) => {
  await page.goto("/committee/more");
  await page.getByRole("link", { name: /دفعات قديمة لم تُثبَّت/ }).click();
  await page.waitForURL("**/committee/review");
  const heading = page.locator("#bq-wait-h");
  const waiting = Number((await heading.textContent())!.match(/\d+/)![0]);
  expect(waiting).toBeGreaterThan(0);
  await expect.poll(() => badge(page).then((b) => b.at(-1))).toBe(waiting);

  await page.getByRole("button", { name: "ثبّت الدفعة" }).first().click();
  await expect(heading).toContainText(String(waiting - 1));
  await expect.poll(() => badge(page).then((b) => b.at(-1))).toBe(waiting - 1 || "clear");
});

test("the notifications switch is replaced by a plain note in the demo", async ({ page }) => {
  await page.goto("/committee/account");
  await expect(page.getByRole("heading", { name: "الإشعارات" })).toBeVisible();
  await expect(page.getByText("لا تعمل الإشعارات في النسخة التجريبية.")).toBeVisible();
  await expect(page.getByRole("switch", { name: /إشعارات الدفعات الجديدة/ })).toHaveCount(0);
});

test("late members: the list in the app and «شارك المتأخرات» (no WhatsApp walk)", async ({
  page,
}) => {
  // merged (owner, fewest pages): the old page opens the members list filtered on arrears
  await page.goto("/committee/late");
  await expect(page).toHaveURL(/\/committee\/members\?f=owe$/);
  await expect(page.getByRole("radio", { name: /عليهم متأخرات/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("button", { name: /شارك المتأخرات/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /ذكّر الجميع|افتح الرسالة في واتساب/ }),
  ).toHaveCount(0);
});

test("old payments, demo queue: empty (?demoQueue=0) says so and leads home", async ({ page }) => {
  await page.goto("/committee/review?demoQueue=0");
  await expect(page.getByText("لا دفعات قديمة تنتظر")).toBeVisible();
  await expect(page.getByRole("link", { name: "إلى الرئيسية" })).toBeVisible();
  await expect(page.locator("article.bq-slip")).toHaveCount(0);
});

test("waiting payments, demo queue: 12 pending (?demoQueue=12) shows one open slip and five rows", async ({
  page,
}) => {
  await page.goto("/committee/review?demoQueue=12");
  await expect(
    page.getByRole("heading", { name: "دفعات قديمة لم تُثبَّت", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("article.bq-slip")).toHaveCount(1);
  await expect(page.locator(".bq-rev-row")).toHaveCount(4);
  await page.getByRole("button", { name: /عرض الكل/ }).click();
  await expect(page.locator(".bq-rev-row")).toHaveCount(11);
});
