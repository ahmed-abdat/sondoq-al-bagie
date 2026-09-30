import { expect, test } from "@playwright/test";
import { E2E_MEMBERS, latestPayment, monthStates } from "../../supabase/tests/e2e/helpers";
import { committeePhone, openPage } from "./steps";

const M = E2E_MEMBERS.cash;

test("the committee records cash: the member's months are paid, with a receipt code", async ({
  browser,
  baseURL,
}) => {
  const { page } = await committeePhone(browser, baseURL!);
  await openPage(page, "/committee");
  await page
    .getByRole("link", { name: /سجّل دفعة/ })
    .first()
    .click();
  await page.waitForURL("**/committee/record");
  await page.getByLabel("ابحث عن العضو", { exact: true }).fill(M.name);
  await page.getByRole("button").filter({ hasText: M.name }).first().click();
  const btn = page.locator(".r2-foot").getByRole("button");
  await expect(btn).toHaveText("كيف دفع؟");
  await page.getByRole("button", { name: /نقدًا/ }).click();
  await expect(btn).toHaveText(/^\s*سجّل\s*$/);
  await btn.click();
  await expect(page.getByRole("status").filter({ hasText: "سُجّلت الدفعة" })).toBeVisible();

  // recorded → confirmed at once (m29)
  const p = await latestPayment(M.ref, { status: "confirmed" });
  expect(p.method).toBe("cash");
  expect(p.receiptCode).toMatch(/^BQ-/);
  const months = await monthStates(M.ref);
  expect(months[1]).toBe("paid");

  // (committee-only: no member link or public receipt check to look at any more)
});
