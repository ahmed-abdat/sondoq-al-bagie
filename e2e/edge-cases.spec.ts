import { expect, test } from "@playwright/test";

// Edge cases from docs/EDGE-CASES.md on the demo committee (fixtures build, simulated writes).

test("a transfer typed in new ouguiya is caught and fixed ×10 (M16)", async ({ page }) => {
  await page.goto("/committee");
  await page.getByRole("button", { name: /^سجّل دفعة$/ }).click();
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
  await page.getByRole("button", { name: /^سجّل دفعة$/ }).click();
  const sheet = page.getByRole("dialog", { name: "سجّل دفعة" });
  await sheet.getByLabel("ابحث عن العضو", { exact: true }).fill("ب 12");
  await sheet.locator(".bq-pick button.bq-row").first().click();
  await expect(sheet.locator(".bq-rec-row").first()).toContainText("من يوليو إلى سبتمبر");
  await sheet.getByRole("button", { name: "تغيير الأشهر" }).click();
  await expect(sheet.getByRole("button", { name: /يناير/ })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: /يناير/ })).toContainText("غير مستحق");
});

test("last year's late months are on the record screen, each at its own price (M8/M11)", async ({
  page,
}) => {
  await page.goto("/committee");
  await page.getByRole("button", { name: /^سجّل دفعة$/ }).click();
  const sheet = page.getByRole("dialog", { name: "سجّل دفعة" });
  await sheet.getByLabel("ابحث عن العضو", { exact: true }).fill("أ 4");
  await sheet.locator(".bq-pick button.bq-row").first().click();
  const row = sheet.locator(".bq-rec-row").first();
  await expect(row).toContainText("من نوفمبر إلى ديسمبر 2025");
  // 2 × 800 (2025) + 9 × 1000
  await expect(row).toContainText("10 600");
});

test("settings: next year's fees and the last backup (M12/D2)", async ({ page }) => {
  await page.goto("/committee/settings?prices=1");
  await expect(page.getByRole("heading", { name: "الرسوم الشهرية لسنة 2027" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "آخر نسخة احتياطية" })).toBeVisible();
});

test("pay late months from a member's credit (M7)", async ({ page }) => {
  await page.goto("/committee/members");
  await page.getByLabel("ابحث عن عضو", { exact: false }).first().fill("ب 12");
  await page.locator("button.bq-row").first().click();
  const s = page.getByRole("dialog").last();
  await expect(s).toContainText(/له رصيد 2\s000 أوقية\./);
  await s.getByRole("button", { name: "ادفع من الرصيد" }).click();
  await expect(s).toContainText("من يوليو إلى سبتمبر 2026");
  await s.getByRole("button", { name: "ادفع 3 أشهر" }).click();
  await expect(page.getByText(/دُفعت رسوم 3 أشهر من رصيد/)).toBeVisible();
  // the demo store takes the months off her arrears and the credit down to 500
  await page.locator("button.bq-row").first().click();
  const again = page.getByRole("dialog").last();
  await expect(again).toContainText(/له رصيد 500 أوقية، لا يكفي لشهر كامل\./);
  await expect(again).not.toContainText("متأخر");
});

test("a second payment for months already waiting says so (M5)", async ({ page }) => {
  await page.goto("/committee");
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: /^سجّل دفعة$/ }).click();
    const sheet = page.getByRole("dialog", { name: "سجّل دفعة" });
    await sheet.getByLabel("ابحث عن العضو", { exact: true }).fill("أ 4");
    await sheet.locator(".bq-pick button.bq-row").first().click();
    await sheet.getByRole("radio", { name: "بنكيلي" }).click();
    await sheet.locator(".bq-rec-foot").getByRole("button", { name: "سجّل الدفعة" }).click();
    await expect(sheet).toBeHidden();
  }
  await expect(page.getByText(/يوجد دفعة أخرى بانتظار التأكيد لنفس الشهر\./)).toBeVisible();
});
