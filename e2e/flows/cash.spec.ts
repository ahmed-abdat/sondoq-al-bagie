import { expect, test } from "@playwright/test";
import { E2E_MEMBERS, latestPayment, monthStates } from "../../supabase/tests/e2e/helpers";
import { committeePhone, memberPhone, openSlip, strangerPhone, youCard } from "./steps";

const M = E2E_MEMBERS.cash;

test("the committee records cash: the member's months are paid, with a receipt", async ({
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

  // recorded by the treasurer: confirmed at once, or waiting for a second committee member
  let p = await latestPayment(M.ref);
  if (p.status === "pending") {
    const admin = await committeePhone(browser, baseURL!, "admin");
    await (
      await openSlip(admin.page, M.name)
    )
      .getByRole("button", { name: "أكّد الاستلام" })
      .click();
  }
  p = await latestPayment(M.ref, { status: "confirmed" });
  expect(p.method).toBe("cash");
  expect(p.receiptCode).toMatch(/^BQ-/);
  const months = await monthStates(M.ref);
  expect(months[1]).toBe("paid");

  // the member's own link: paid; the receipt opens for anyone who has its code
  const member = await memberPhone(browser, baseURL!, M.ref);
  await expect(youCard(member.page)).toContainText("دفعت حتى");
  const s = await strangerPhone(browser, baseURL!);
  await s.page.goto(`/r/${p.receiptCode}`);
  await expect(s.page.getByText("وصل صحيح")).toBeVisible();
  await expect(s.page.locator("main")).toContainText(M.name);
});
