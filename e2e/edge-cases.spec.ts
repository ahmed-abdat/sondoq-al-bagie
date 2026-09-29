import { expect, test } from "@playwright/test";

// Edge cases from docs/EDGE-CASES.md on the demo committee (fixtures build, simulated writes).

test("a transfer typed in new ouguiya is caught and fixed ×10 (M16)", async ({ page }) => {
  await page.goto("/committee");
  await page.locator(".bq-fab").click();
  const sheet = page.getByRole("dialog", { name: "سجّل دفعة" });
  await sheet.locator(".bq-pick button.bq-row").first().click();
  await sheet.getByRole("button", { name: /تفاصيل أخرى/ }).click();
  const amount = sheet.getByRole("textbox", { name: /المبلغ المحوّل/ });
  const total = Number((await amount.getAttribute("placeholder"))!.replace(/\D/g, ""));
  expect(total).toBeGreaterThan(0);
  await amount.fill(String(total / 10));
  await expect(
    sheet.getByText("يبدو أنك كتبت المبلغ بالأوقية الجديدة. اضربه في 10."),
  ).toBeVisible();
  await sheet.getByRole("button", { name: /أوقية قديمة/ }).click();
  await expect(amount).toHaveValue(String(total));
  await expect(sheet.getByText("يطابق المجموع.")).toBeVisible();
});

test("handover: pending payments before submit, balance change on accept (H1/H2)", async ({
  page,
}) => {
  await page.goto("/committee/handover");
  await page.getByRole("button", { name: "ابدأ التسليم" }).click();
  await expect(page.getByText(/بانتظار التأكيد\. أكّدها أو ارفضها قبل التسليم\./)).toBeVisible();
  await page
    .getByRole("textbox", { name: /^المبلغ: / })
    .first()
    .fill("1000");
  await page.getByRole("button", { name: "إرسال للتسليم" }).click();
  await expect(page.getByText(/زاد الرصيد بـ .* أوقية منذ إرسال التسليم/)).toBeVisible();
  await expect(page.getByText(/أكّدها أو ارفضها قبل القبول\./)).toBeVisible();
});

test("a mid-year joiner is never offered the months before joining (M9)", async ({ page }) => {
  await page.goto("/committee");
  await page.locator(".bq-fab").click();
  const sheet = page.getByRole("dialog", { name: "سجّل دفعة" });
  await sheet.getByLabel("ابحث عن العضو", { exact: true }).fill("ب 12");
  await sheet.locator(".bq-pick button.bq-row").first().click();
  await expect(sheet.locator(".bq-rec-row").first()).toContainText("من يوليو إلى سبتمبر");
  await sheet.getByRole("button", { name: "تغيير الأشهر" }).click();
  await expect(sheet.getByRole("button", { name: /يناير/ })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: /يناير/ })).toContainText("غير مستحق");
});
