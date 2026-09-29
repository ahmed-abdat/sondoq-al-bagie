import { expect, test } from "@playwright/test";

// Money privacy (docs/MONEY-PRIVACY.md) on a fixtures build: a stranger gets no amounts at all
// (HTML, RSC, network), only «•••»; a member with their link and the committee see the figures.
// Fixture balance: 294 000.
const BALANCE = /294[\s  ]?000/;
const PAGES = ["/", "/accounts", "/donations", "/report"];

test("stranger: no amount or receipt link in any public page's HTML", async ({ request }) => {
  for (const p of PAGES) {
    const html = await (await request.get(p)).text();
    expect(html, p).not.toMatch(BALANCE);
    expect(html, p).not.toMatch(/"(?:balance|moneyIn|collectedThisYear|receiptCode)"/);
    expect(html, p).not.toMatch(/\/r\/BQ-/);
  }
});

test("stranger: dots and one hint, no money request, «من دفع كل شهر» with counts", async ({
  page,
}) => {
  const bodies: string[] = [];
  const posts: string[] = [];
  page.on("request", (r) => r.method() === "POST" && posts.push(r.url()));
  page.on("response", async (r) => {
    if (r.request().resourceType() === "fetch") bodies.push(await r.text().catch(() => ""));
  });
  await page.goto("/");
  await expect(page.locator(".bq-hero .bq-dots").first()).toBeVisible();
  await expect(
    page.getByText("الأرقام للأعضاء واللجنة. افتح رابطك الخاص لتراها.").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "لديك رابط؟" }).first().click();
  await expect(page.getByRole("heading", { name: "افتح رابطك الخاص" })).toBeVisible();
  await page.getByRole("button", { name: "حسنًا" }).click();

  await page.goto("/accounts");
  await expect(page.getByText("الحساب كاملًا يظهر للأعضاء")).toBeVisible();
  await expect(page.getByRole("heading", { name: "من دفع كل شهر" })).toBeVisible();
  await expect(page.getByText(/دفع \d+ من \d+/).first()).toBeVisible();
  await expect(page.locator('a[href^="/r/"]')).toHaveCount(0);

  await page.goto("/report");
  await expect(page.locator(".rp-now .bq-dots")).toBeVisible();
  expect(await page.content()).not.toMatch(BALANCE);
  expect(posts, "a stranger never asks for money").toEqual([]);
  for (const b of bodies) expect(b).not.toMatch(BALANCE);
});

test("member (/m/demo): the figures on home, accounts and the report", async ({ page }) => {
  await page.goto("/m/demo");
  await page.goto("/");
  await expect(page.locator(".bq-hero .bq-hero-n").first()).toContainText(BALANCE);
  await expect(page.getByText("الأرقام للأعضاء واللجنة")).toHaveCount(0);
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { name: "ما جُمع كل شهر" })).toBeVisible();
  await expect(page.locator(".bq-sum .is-total")).toContainText(BALANCE);
  await page.goto("/report");
  await expect(page.locator(".rp-now")).toContainText(BALANCE);
  // members read; only the committee shares
  await expect(page.getByRole("button", { name: "مشاركة التقرير" })).toHaveCount(0);
});

test("committee (demo): the figures on the public report, and the share button", async ({
  page,
}) => {
  await page.goto("/committee");
  await expect(page.getByRole("heading", { name: "اللجنة", level: 1 })).toBeVisible();
  await page.goto("/report");
  await expect(page.locator(".rp-now")).toContainText(BALANCE);
  await expect(page.getByRole("button", { name: "مشاركة التقرير" })).toBeVisible();
});
