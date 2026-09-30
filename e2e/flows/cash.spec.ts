import { expect, test } from "@playwright/test";
import { E2E_MEMBERS, latestPayment, monthStates } from "../../supabase/tests/e2e/helpers";
import { committeePhone } from "./steps";

const M = E2E_MEMBERS.cash;

test("the committee records cash: the member's months are paid, with a receipt code", async ({
  browser,
  baseURL,
}) => {
  const committee = await committeePhone(browser, baseURL!);
  const c = committee.page;
  await c.goto("/committee");
  await c.getByRole("button", { name: /^سجّل دفعة$/ }).click();
  const sheet = c.getByRole("dialog", { name: "سجّل دفعة" });
  await sheet.getByPlaceholder("اكتب الاسم أو الرقم، مثل ب 12").fill(M.name);
  await sheet.locator(".bq-pick button.bq-row").filter({ hasText: M.name }).first().click();
  const foot = sheet.locator(".bq-rec-foot");
  const btn = foot.getByRole("button");
  await expect(btn).toHaveText("اختر كيف دفع");
  await btn.click();
  await sheet.getByRole("radio", { name: "نقدًا" }).click();
  await expect(btn).toHaveText("سجّل الدفعة");
  await btn.click();

  // recorded → confirmed at once (m29)
  const p = await latestPayment(M.ref, { status: "confirmed" });
  expect(p.method).toBe("cash");
  expect(p.receiptCode).toMatch(/^BQ-/);
  const months = await monthStates(M.ref);
  expect(months[1]).toBe("paid");

  // (committee-only: no member link or public receipt check to look at any more)
});
