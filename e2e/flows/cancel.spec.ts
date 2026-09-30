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

/** From the member's page («الدفعات»): «ألغِ الدفعة» on the payment, a reason, confirm. */
async function tryCancel(page: import("@playwright/test").Page, ref: string, reason: string) {
  await openPage(page, `/committee/members/${ref}`);
  const pays = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "الدفعات", exact: true }) });
  const row = pays.getByRole("listitem").filter({ hasNotText: "أُلغيت" }).first();
  await expect(row).toBeVisible(); // the statement has loaded, with the confirmed payment
  const start = row.getByRole("button", { name: "ألغِ الدفعة" });
  if (!(await start.isVisible())) return false; // not offered to this member
  await start.click();
  const sheet = page.getByRole("dialog", { name: "ألغِ الدفعة" });
  await sheet
    .getByRole("radiogroup", { name: "السبب" })
    .getByRole("radio", { name: reason })
    .click();
  await sheet.getByRole("button", { name: "ألغِ الدفعة" }).click();
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
  if (await tryCancel(plainPhone.page, M.ref, "دفعة مكررة"))
    await expect(plainPhone.page.getByRole("alert")).toHaveText("هذا الإجراء للمسؤول فقط.");
  expect((await latestPayment(M.ref)).status).toBe("confirmed");

  // «مسؤول» cancels it from the payment
  const boss = await committeePhone(browser, baseURL!, "admin");
  expect(await tryCancel(boss.page, M.ref, "دفعة مكررة")).toBe(true);
  await expect.poll(async () => (await latestPayment(M.ref)).status).toBe("cancelled");
  expect(paidCount(await monthStates(M.ref))).toBe(0);

  // «سجل العمليات»: who cancelled which payment, and why (on the screen, and the actor's name)
  await openPage(boss.page, "/committee/activity");
  const row = boss.page.getByRole("listitem").filter({ hasText: "دفعة مكررة" }).first();
  await expect(row).toContainText(M.name);
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
