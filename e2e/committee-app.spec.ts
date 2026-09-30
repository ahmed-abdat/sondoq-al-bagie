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

test("«الفئات»: move a group's members from January next year, with a preview", async ({
  page,
}) => {
  await page.goto("/committee/settings");
  const groups = page.getByRole("region", { name: "الفئات والمستحقات الشهرية" });
  await groups.getByRole("button", { name: "انقل أعضاءها" }).last().click();
  const sheet = page.getByRole("dialog", { name: "انقل أعضاء إلى فئة" });
  await expect(sheet.getByRole("button", { name: "ابتداءً من شهر" })).toContainText("يناير 2027");
  await sheet.getByRole("button", { name: "راجع النقل" }).click();
  await expect(sheet.getByRole("status")).toContainText(
    /سينتقل \d+ عضوًا إلى الفئة .+ ابتداءً من يناير 2027/,
  );
  await sheet.getByRole("button", { name: "انقل", exact: true }).click();
  await expect(page.getByText(/انتقل \d+ عضوًا إلى الفئة/)).toBeVisible();
});

test("a new لوحة on chosen members uses the shared member picker", async ({ page }) => {
  await page.goto("/committee/campaigns");
  await page.getByRole("radio", { name: /لوحات/ }).click();
  await page.getByRole("button", { name: "لوحة جديدة" }).click();
  const sheet = page.getByRole("dialog", { name: "لوحة جديدة" });
  await sheet.getByLabel("العنوان").fill("لوحة تجربة");
  await sheet.getByLabel("المبلغ على كل عضو").fill("500");
  await sheet.getByRole("radio", { name: "أختارهم" }).click();
  const find = sheet.getByLabel("أضف عضوًا");
  await find.fill("ب 2");
  await sheet
    .getByRole("button", { name: /عبد الله ولد الشيخ/ })
    .first()
    .click();
  await find.fill("");
  await expect(sheet.getByText("من اخترتهم:")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "أنشئ اللوحة على عضو واحد" })).toBeEnabled();
});

test("a new member's statement in التقارير: the shared member picker", async ({ page }) => {
  await page.goto("/committee/reports");
  await page.getByRole("button", { name: /كشف عضو/ }).click();
  const sheet = page.getByRole("dialog", { name: "كشف أي عضو؟" });
  await sheet.getByLabel("ابحث عن العضو").fill("أ4");
  await sheet.getByRole("button", { name: /الشيخ ولد سيدي/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: /الشيخ ولد سيدي/ })).toBeVisible();
});
