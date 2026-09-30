import { expect, test, type Page } from "@playwright/test";

// Edge cases from docs/EDGE-CASES.md on the demo committee (fixtures build, simulated writes).

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
  await page.getByRole("button", { name: "أرسل المحضر للجنة الجديدة" }).click();
  await expect(page.getByText(/زاد الرصيد بـ .* أوقية منذ إرسال التسليم/)).toBeVisible();
  await expect(page.getByText(/أكّدها أو ارفضها قبل القبول\./)).toBeVisible();
});

/** «سجّل دفعة» for one member (committee-only record screen). */
async function recordFor(page: Page, who: string) {
  await page.goto("/committee/record");
  await page.getByLabel("ابحث عن العضو", { exact: true }).fill(who);
  await page.locator(".pa-rows button.pa-row").first().click();
}

test("a mid-year joiner is never offered the months before joining (M9)", async ({ page }) => {
  await recordFor(page, "ب 12");
  await expect(page.locator(".r2-line").first()).toContainText("من يوليو إلى سبتمبر");
  await page.getByRole("radio", { name: "اختر" }).click();
  const months = page.getByRole("group", { name: /^أشهر \d{4}$/ });
  await expect(months.getByRole("button", { name: /يناير/ })).toBeDisabled();
  await expect(months.getByRole("button", { name: /يوليو/ })).toBeEnabled();
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
