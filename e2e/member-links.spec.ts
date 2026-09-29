import { expect, test, type Page } from "@playwright/test";

// «روابط الأعضاء» on a fixtures build (demo committee): link creation is simulated; WhatsApp is
// opened in the same tab, so wa.me is answered with 204 (the page stays) and the URL is kept.

async function catchWhatsApp(page: Page) {
  const urls: string[] = [];
  await page.route("https://wa.me/**", (route) => {
    urls.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  return urls;
}
const textOf = (url: string) => decodeURIComponent(new URL(url).searchParams.get("text") ?? "");

test("hub and «الأعضاء» link to «روابط الأعضاء»", async ({ page }) => {
  await page.goto("/committee");
  await page.getByRole("link", { name: /روابط الأعضاء/ }).click();
  await expect(page.getByRole("heading", { name: "روابط الأعضاء", level: 1 })).toBeVisible();
  await page.goto("/committee/members");
  await page.getByRole("link", { name: /روابط الأعضاء/ }).click();
  await expect(page).toHaveURL(/\/committee\/member-links$/);
});

test("send in order: WhatsApp opens with the link, the walk advances, the row shows ✓", async ({
  page,
}) => {
  const urls = await catchWhatsApp(page);
  await page.goto("/committee/member-links");
  await expect(page.getByRole("heading", { name: "روابط الأعضاء", level: 1 })).toBeVisible();
  await expect(page.getByText(/\d+ من \d+ أُرسل · بقي \d+/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "المجموعة أ" })).toBeVisible();
  await expect(page.getByText("✓ أُرسل · ✓✓ يستخدمه")).toBeVisible();
  // fixtures: some links sent, one used, some members without a phone
  await expect(page.getByRole("img", { name: "أُرسل" }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "يستخدمه" }).first()).toBeVisible();
  await expect(page.getByText("بلا رقم هاتف").first()).toBeVisible();

  await page.getByRole("button", { name: /أرسل للجميع بالترتيب/ }).click();
  const walk = page.locator(".bq-ml-walk");
  const first = (await walk.locator(".bq-ml-walk-t").textContent())!.split(" · ")[1].trim();
  await walk.getByRole("button", { name: /أرسل في واتساب/ }).click();

  await expect.poll(() => urls.length).toBe(1);
  const text = textOf(urls[0]);
  expect(text).toContain(`السلام عليكم ${first}،`);
  expect(text).toContain("هذا رابطك الخاص في صندوق الرابطة:");
  expect(text).toMatch(/\/m\/demo/);

  // the walk moved on; the sent row now has ✓ and offers «رابط جديد»
  await expect(walk.locator(".bq-ml-walk-t")).not.toContainText(first);
  const row = page.locator("li", { hasText: first }).first();
  await expect(row.getByRole("img", { name: "أُرسل" })).toBeVisible();
  const again = row.getByRole("button", { name: `رابط جديد: ${first}` });
  await expect(again).toBeVisible();

  // skip, then stop
  const second = await walk.locator(".bq-ml-walk-t").textContent();
  await walk.getByRole("button", { name: "تخطَّ" }).click();
  await expect(walk.locator(".bq-ml-walk-t")).not.toHaveText(second!);
  await walk.getByRole("button", { name: "إيقاف" }).click();
  await expect(walk).toHaveCount(0);

  // a new link for a sent row asks first (the old one stops)
  await again.click();
  await expect(page.getByText("سيتوقف الرابط القديم. أرسل رابطًا جديدًا؟")).toBeVisible();
  await page.getByRole("button", { name: /أرسل رابطًا جديدًا/ }).click();
  await expect.poll(() => urls.length).toBe(2);
  expect(textOf(urls[1])).toContain(first);
});
