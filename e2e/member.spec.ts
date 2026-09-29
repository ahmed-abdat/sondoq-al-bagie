import { expect, test } from "@playwright/test";

// A member's personal link (docs/MEMBER-ACCESS.md), with the demo member of the fixtures build:
// /m/demo is the demo stand-in for /m/<token>.

const you = (page: import("@playwright/test").Page) =>
  page.getByRole("region").filter({ has: page.getByText("أنت", { exact: true }) });

test("the link sets the cookies and home shows «أنت»", async ({ page, context }) => {
  await page.goto("/m/demo");
  await expect(page).toHaveURL(/\/$/); // the link and the welcome marker are gone
  const cookies = Object.fromEntries((await context.cookies()).map((c) => [c.name, c]));
  expect(cookies.bq_member).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  expect(cookies.bq_member_on).toMatchObject({ value: "1", httpOnly: false });

  const card = you(page);
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { level: 2 })).not.toBeEmpty();
  await expect(card.getByRole("button", { name: /ادفع عن شخص آخر/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /دفعاتي/ })).toHaveAttribute("href", "/me");
});

test("a wrong link: the calm page, no cookie", async ({ page, context }) => {
  await page.goto("/m/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  await expect(page).toHaveURL(/\/m\/invalid$/);
  await expect(page.getByText(/لم يعد يعمل/)).toBeVisible();
  expect((await context.cookies()).map((c) => c.name)).not.toContain("bq_member");
});

test("the member's pages are never saved for offline", async ({ page }) => {
  await page.goto("/m/demo");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto("/me");
  await page.reload();
  const saved = await page.evaluate(async () =>
    (await (await caches.open("pages-v2")).keys()).map((r) => new URL(r.url).pathname),
  );
  expect(saved.filter((p) => p === "/me" || p.startsWith("/m/"))).toEqual([]);
});

test.describe("installed app without a link", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q: string) =>
        q.includes("display-mode: standalone")
          ? ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} } as never)
          : real(q);
    });
  });

  test("pasting the WhatsApp message opens the link inside the app", async ({ page, context }) => {
    await page.goto("/");
    const paste = page.getByRole("region", { name: "لديك رابط من اللجنة؟" });
    await expect(paste).toBeVisible();
    await paste
      .getByLabel("رابطك الخاص")
      .fill("هذا رابطك الخاص في صندوق الرابطة: https://baqie.vercel.app/m/demo");
    await paste.getByRole("button", { name: "فتح" }).click();
    await expect(you(page)).toBeVisible();
    expect((await context.cookies()).map((c) => c.name)).toContain("bq_member");
    await expect(page.getByRole("region", { name: "لديك رابط من اللجنة؟" })).toHaveCount(0);
  });
});
