import { expect, test } from "@playwright/test";

// «سجّل دفعة» on the demo committee (fixtures build): writes are simulated in the browser.

test("the footer button leads to the missing step, then saves with a summary", async ({ page }) => {
  await page.goto("/committee");
  await page.getByRole("button", { name: /^سجّل دفعة$/ }).click();
  const sheet = page.getByRole("dialog", { name: "سجّل دفعة" });
  await sheet.locator(".bq-pick button.bq-row").first().click();

  // late months by default, said in the footer before anything is saved
  const foot = sheet.locator(".bq-rec-foot");
  await expect(foot).toContainText("سيُسجَّل");
  await expect(foot).toContainText("رسوم");

  // nothing chosen yet: the one button names the step instead of sitting disabled
  const btn = foot.getByRole("button");
  await expect(btn).toHaveText("اختر كيف دفع");
  await btn.click();
  await sheet.getByRole("radio", { name: "بنكيلي" }).click();
  await expect(foot).toContainText("بنكيلي");

  // a short transfer names the gap and offers to fit the months
  await sheet.getByRole("button", { name: /تفاصيل أخرى/ }).click();
  await sheet.getByRole("textbox", { name: /المبلغ المحوّل/ }).fill("1");
  await expect(btn).toHaveText("صحّح المبلغ");
  await sheet.getByRole("textbox", { name: /المبلغ المحوّل/ }).fill("");

  await expect(btn).toHaveText("سجّل الدفعة");
  await btn.click();
  await expect(page.getByText(/تنتظر التأكيد/)).toBeVisible();
});
