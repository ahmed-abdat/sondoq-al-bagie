import { expect, test } from "@playwright/test";

// The new committee screens (/committee/*) on the demo committee (fixtures build).

test("members: search by paper number, then the member's «كشف حساب»", async ({ page }) => {
  await page.goto("/committee/members");
  await page.getByLabel("ابحث عن عضو").fill("أ4");
  await page.getByRole("link", { name: /الشيخ ولد سيدي/ }).click();
  await expect(page).toHaveURL(/\/committee\/members\/A-4$/);
  await expect(page.getByRole("heading", { name: "ما عليه الآن" })).toBeVisible();
  await expect(page.locator(".pa-dl-owe")).toContainText("نوفمبر وديسمبر 2025");
  await page.getByRole("button", { name: /شارك الكشف/ }).click();
  const sheet = page.getByRole("dialog", { name: "شارك كشف الحساب" });
  await expect(sheet.getByRole("button", { name: /صور لواتساب/ })).toBeVisible();
  await expect(sheet.getByRole("img").first()).toBeVisible({ timeout: 15_000 });
});

test("a member's payments say who recorded them; «مسؤول» can cancel with a reason", async ({
  page,
}) => {
  await page.goto("/committee/members/A-1");
  const pay = page.locator(".pa-hist li").first();
  await expect(pay).toContainText("سجّلها");
  await pay.getByRole("button", { name: "ألغِ الدفعة" }).click();
  const sheet = page.getByRole("dialog", { name: "ألغِ الدفعة" });
  await expect(sheet.getByRole("button", { name: "اختر السبب" })).toBeDisabled();
  await sheet.getByRole("radio", { name: "دفعة مكررة" }).click();
  await sheet.getByRole("button", { name: "ألغِ الدفعة" }).click();
  await expect(page.getByText("أُلغيت الدفعة")).toBeVisible();
});
