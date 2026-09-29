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
  // hub tabs (r31): «الأعمال» → «المزيد»
  await page.getByRole("button", { name: "الأعمال" }).click();
  await page.getByText("المزيد").click();
  await page.getByRole("link", { name: /روابط الأعضاء/ }).click();
  await expect(page.getByRole("heading", { name: "روابط الأعضاء", level: 1 })).toBeVisible();
  await page.goto("/committee/members");
  await page.getByRole("link", { name: /روابط الأعضاء/ }).click();
  await expect(page).toHaveURL(/\/committee\/member-links$/);
});

test("send in order: WhatsApp opens with the link, the walk advances, the row shows «أُنشئ الرابط»", async ({
  page,
}) => {
  const urls = await catchWhatsApp(page);
  await page.goto("/committee/member-links");
  await expect(page.getByRole("heading", { name: "روابط الأعضاء", level: 1 })).toBeVisible();
  await expect(page.getByText(/\d+ من \d+ لهم رابط · بقي \d+/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "المجموعة أ" })).toBeVisible();
  // fixtures: some links made, one used, some members without a phone; words, not ✓ (audit C6);
  // never «أُرسل»: WhatsApp delivery is unknown (audit B10)
  await expect(page.locator(".bq-ml-tick", { hasText: "أُنشئ الرابط" }).first()).toBeVisible();
  await expect(page.locator(".bq-ml-tick", { hasText: "أُرسل" })).toHaveCount(0);
  await expect(page.locator(".bq-ml-tick", { hasText: "فتحه" }).first()).toBeVisible();
  await expect(page.locator(".bq-ml-legend")).toHaveCount(0);
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

  // the walk moved on; the row says «أُنشئ الرابط» and can send the SAME link again (audit B10)
  await expect(walk.locator(".bq-ml-walk-t")).not.toContainText(first);
  const row = page.locator("li", { hasText: first }).first();
  await expect(row.locator(".bq-ml-tick", { hasText: "أُنشئ الرابط" })).toBeVisible();
  await row.getByRole("button", { name: `أرسل الرابط نفسه مرة أخرى: ${first}` }).click();
  await expect.poll(() => urls.length).toBe(2);
  expect(urls[1]).toBe(urls[0]);

  // skip, then stop
  const second = await walk.locator(".bq-ml-walk-t").textContent();
  await walk.getByRole("button", { name: "تخطَّ" }).click();
  await expect(walk.locator(".bq-ml-walk-t")).not.toHaveText(second!);
  await walk.getByRole("button", { name: "إيقاف" }).click();
  await expect(walk).toHaveCount(0);

  // a link made earlier (its URL is not kept): a new one asks first (the old one stops)
  const again = page.getByRole("button", { name: /^رابط جديد: / }).first();
  const other = (await again.getAttribute("aria-label"))!.replace("رابط جديد: ", "");
  await again.click();
  await expect(page.getByText("سيتوقف الرابط القديم. أرسل رابطًا جديدًا؟")).toBeVisible();
  await page.getByRole("button", { name: /أرسل رابطًا جديدًا/ }).click();
  await expect.poll(() => urls.length).toBe(3);
  expect(textOf(urls[2])).toContain(other);
});
