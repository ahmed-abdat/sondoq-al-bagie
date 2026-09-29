import { expect, test } from "@playwright/test";
import { campaignProgress, E2E_MEMBERS, latestPayment } from "../../supabase/tests/e2e/helpers";
import { formatNumber } from "../../src/lib/format";
import { committeePhone, memberPhone, openSlip, shot, strangerPhone } from "./steps";

const M = E2E_MEMBERS.campaign;

test("a member gives to the campaign, the committee confirms: progress moves; a stranger sees «•••»", async ({
  browser,
  baseURL,
}) => {
  const before = await campaignProgress();

  const member = await memberPhone(browser, baseURL!, M.ref);
  const m = member.page;
  await m.goto("/donations");
  await expect(m.locator("#bq-camp-h")).toContainText("ترميم المسجد");
  await m.getByRole("radio", { name: "1 000" }).click();
  await m.locator(".bq-give-proof input[type=file]").setInputFiles(shot());
  await m.getByRole("button", { name: /^أرسل 1\s000 أوقية إلى اللجنة$/ }).click();
  await expect(m.getByText("وصلتنا الصورة. اللجنة تراجعها.")).toBeVisible();

  const committee = await committeePhone(browser, baseURL!);
  const c = committee.page;
  const slip = await openSlip(c, M.name);
  await expect(slip).toContainText("مساهمة في: ترميم المسجد");
  await slip.getByRole("button", { name: "أكّد الاستلام" }).click();
  const paid = await latestPayment(M.ref, { status: "confirmed" });
  expect(paid.amount).toBe(1000);

  await expect.poll(async () => (await campaignProgress()).collected).toBe(before.collected + 1000);

  // the member (with the link) sees the new total; a stranger sees the campaign without it
  const total = new RegExp(formatNumber(before.collected + 1000).replace(/\D+/g, "\\D?"));
  await m.reload();
  await expect(m.locator(".bq-give-sum")).toContainText(total);
  const s = await strangerPhone(browser, baseURL!);
  await s.page.goto("/donations");
  await expect(s.page.locator("#bq-camp-h")).toContainText("ترميم المسجد");
  await expect(s.page.locator(".bq-give-sum .bq-dots")).toBeVisible();
  expect(await s.page.content()).not.toMatch(total); // never in a stranger's HTML
});
