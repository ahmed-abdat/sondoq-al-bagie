import { expect, test } from "@playwright/test";

// The new «سجّل دفعة» page (/committee/record) on the demo committee: writes are simulated.

test("earlier years' late months are offered first, each at its own price", async ({ page }) => {
  await page.goto("/committee/record");
  await page.getByLabel("ابحث عن العضو").fill("أ 4");
  await page.locator(".r2-picker .pa-row").first().click();
  const line = page.locator(".r2-line").first();
  // «الأشهر المتأخرة»: 2 × 800 (2025) + 9 × 1000 (2026)
  await expect(line).toContainText("نوفمبر وديسمبر 2025");
  await expect(line).toContainText("10 600");
  // «اختر»: the 2025 months can be taken off one by one
  await line.getByRole("radio", { name: "اختر" }).click();
  await line.getByRole("button", { name: /نوفمبر 2025/ }).click();
  await expect(line).toContainText("9 800");
  await expect(line).toContainText("ديسمبر 2025");
});

test("«دفعة أخرى» starts a new, empty payment", async ({ page }) => {
  await page.goto("/committee/record?m=B-2");
  await page.getByRole("button", { name: /نقدًا/ }).click();
  await page.locator(".r2-foot .pa-btn-primary").click();
  await expect(page.getByText("سُجّلت الدفعة")).toBeVisible();
  await page.getByRole("button", { name: /دفعة أخرى/ }).click();
  await expect(page.getByRole("heading", { name: "لمن هذه الدفعة؟" })).toBeVisible();
  await expect(page.locator(".r2-line")).toHaveCount(0);
  await expect(page).toHaveURL(/\/committee\/record$/);
});
