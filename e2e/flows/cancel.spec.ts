import { expect, test } from "@playwright/test";
import {
  COMMITTEE,
  E2E_MEMBERS,
  latestPayment,
  monthStates,
} from "../../supabase/tests/e2e/helpers";
import { asCommittee, committeePhone, errorText, openPage, recordTransfer } from "./steps";

const M = E2E_MEMBERS.reject; // B-902
const paidCount = (s: Record<number, string>) =>
  Object.values(s).filter((v) => v === "paid").length;

/** From «الدفعات الأخيرة»: open the member's payment, «إلغاء هذه الدفعة», a reason, confirm. */
async function tryCancel(page: import("@playwright/test").Page, name: string, reason: string) {
  await openPage(page, "/committee/payments");
  await page.getByRole("button").filter({ hasText: name }).first().click();
  const start = page.getByRole("button", { name: /إلغاء هذه الدفعة/ });
  if (!(await start.isVisible().catch(() => false))) return false; // not offered to this member
  await start.click();
  await page.getByRole("radio", { name: reason }).click();
  await page.getByRole("button", { name: /^ألغِ الدفعة$/ }).click();
  return true;
}

test("only «مسؤول» cancels, with a reason: the months are unpaid again and the log says who and why", async ({
  browser,
  baseURL,
}) => {
  const rec = await committeePhone(browser, baseURL!, "treasurer");
  await recordTransfer(rec.page, M.name);
  const pay = await latestPayment(M.ref, { status: "confirmed" });
  const paidBefore = paidCount(await monthStates(M.ref));
  expect(paidBefore).toBeGreaterThan(0);

  // a plain committee member: the database refuses, and the app says it in its words
  const plain = await asCommittee("committee");
  const refused = await plain.rpc("cancel_payment", {
    p_payment_id: pay.id,
    p_reason: "دفعة مكررة",
  });
  expect(errorText(refused.error)).toBe("هذا الإجراء للمسؤول فقط.");
  // …and on the screen: no cancel offered, or the same words if it is
  const plainPhone = await committeePhone(browser, baseURL!, "committee");
  if (await tryCancel(plainPhone.page, M.name, "دفعة مكررة"))
    await expect(plainPhone.page.getByRole("alert")).toHaveText("هذا الإجراء للمسؤول فقط.");
  expect((await latestPayment(M.ref)).status).toBe("confirmed");

  // «مسؤول» cancels it from the payment
  const boss = await committeePhone(browser, baseURL!, "admin");
  expect(await tryCancel(boss.page, M.name, "دفعة مكررة")).toBe(true);
  await expect.poll(async () => (await latestPayment(M.ref)).status).toBe("cancelled");
  expect(paidCount(await monthStates(M.ref))).toBe(0);

  // «سجل العمليات»: who cancelled which payment, and why (read until its screen lands)
  const log = await (await asCommittee("admin")).rpc("activity_log", { p_limit: 20 });
  expect(log.error).toBeNull();
  const entry = (
    log.data as { actor_name: string | null; subject: string | null; reason: string | null }[]
  ).find((e) => e.reason === "دفعة مكررة");
  expect(entry).toMatchObject({
    actor_name: COMMITTEE.admin.name,
    subject: expect.stringContaining(M.name),
  });
});
