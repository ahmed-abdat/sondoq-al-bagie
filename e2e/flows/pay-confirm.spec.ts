import { expect, test } from "@playwright/test";
import { E2E_MEMBERS, latestPayment } from "../../supabase/tests/e2e/helpers";
import { committeePhone, memberPhone, openSlip, payOwnFees, strangerPhone, youCard } from "./steps";

const M = E2E_MEMBERS.pay;
/** «دفع 59 من 95» under «من دفع كل شهر» on /accounts, for January. */
const januaryPaid = async (page: import("@playwright/test").Page) => {
  await page.goto("/accounts");
  const t = await page
    .getByText(/^دفع \d+ من \d+$/)
    .first()
    .textContent();
  return Number(/دفع (\d+)/.exec(t ?? "")![1]);
};

// Committee-only (2026-09-30): member links and the public pages are gone. This flow will be
// rewritten as a committee-recorded payment (docs/COMMITTEE-ONLY-PLAN.md §1 Lane B); skipped now.
test.skip(true, "member-link flow retired; rewrite as committee-recorded (plan §1)");

test("a member pays by link, the committee confirms: paid everywhere, with a receipt a stranger can check", async ({
  browser,
  baseURL,
}) => {
  const s = await strangerPhone(browser, baseURL!);
  const janBefore = await januaryPaid(s.page);

  const member = await memberPhone(browser, baseURL!, M.ref);
  await expect(youCard(member.page)).toContainText("لم تدفع هذا العام");
  await payOwnFees(member.page);
  await expect(youCard(member.page)).toContainText("وصلتنا الصورة. اللجنة تراجعها.");
  const pending = await latestPayment(M.ref, { status: "pending" });
  expect(pending.submittedViaLink).toBe(true); // sent through the member's own link

  const committee = await committeePhone(browser, baseURL!);
  const c = committee.page;
  await (await openSlip(c, M.name)).getByRole("button", { name: "أكّد الاستلام" }).click();
  const paid = await latestPayment(M.ref, { status: "confirmed" });
  expect(paid.receiptCode).toMatch(/^BQ-/);

  // the member's card: paid up to this month, a ✓ in each month paid
  const m = member.page;
  await m.reload();
  const card = youCard(m);
  await expect(card).toContainText(/دفعت حتى/);
  const months = new Date().getMonth() + 1; // Africa/Nouakchott is UTC
  await expect(card.locator(".bq-you-cells li svg")).toHaveCount(months);

  // anyone with the code checks the receipt (no phone, no picture)
  await s.page.goto(`/r/${paid.receiptCode}`);
  const r = s.page.locator("main");
  await expect(r).toContainText("وصل صحيح");
  await expect(r).toContainText(M.name);
  await expect(r).toContainText(/4\s500 أوقية/);
  await expect(r).toContainText(paid.receiptCode!);

  // the same months paid on the public lists, the report and the accounts count
  await s.page.goto(`/members?m=${M.ref}`);
  const sheet = s.page.getByRole("dialog").first();
  await expect(sheet).toContainText(M.name);
  await expect(sheet.locator("li svg")).toHaveCount(months);
  await s.page.goto("/report");
  const row = s.page.locator("tr").filter({ hasText: M.name }).first();
  await expect(row.locator(".bq-check")).toHaveCount(months);
  expect(await januaryPaid(s.page)).toBe(janBefore + 1);
});
