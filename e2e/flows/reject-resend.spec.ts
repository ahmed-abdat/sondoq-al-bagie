import { expect, test } from "@playwright/test";
import { E2E_MEMBERS, latestPayment } from "../../supabase/tests/e2e/helpers";
import { committeePhone, memberPhone, openSlip, payOwnFees, sendProof, youCard } from "./steps";

const M = E2E_MEMBERS.reject;

// Committee-only (2026-09-30): member links and the public pages are gone. This flow will be
// rewritten as a committee-recorded payment (docs/COMMITTEE-ONLY-PLAN.md §1 Lane B); skipped now.
test.skip(true, "member-link flow retired; rewrite as committee-recorded (plan §1)");

test("the committee rejects with a reason, the member sees it, sends again, and it is confirmed", async ({
  browser,
  baseURL,
}) => {
  const member = await memberPhone(browser, baseURL!, M.ref);
  await payOwnFees(member.page);
  const first = await latestPayment(M.ref, { status: "pending" });

  const committee = await committeePhone(browser, baseURL!);
  const c = committee.page;
  let slip = await openSlip(c, M.name);
  await slip.getByRole("button", { name: "رفض", exact: true }).click();
  await expect(slip).toContainText("يصل السبب إلى العضو.");
  await slip.getByRole("radio", { name: "الصورة غير واضحة" }).click();
  await slip.getByRole("button", { name: "ارفض الدفعة" }).click();
  const rejected = await latestPayment(M.ref, { status: "rejected" });
  expect(rejected.id).toBe(first.id);
  expect(rejected.rejectReason).toBe("الصورة غير واضحة");

  // the member reads the reason on «دفعاتي» and sends a new picture from there
  const m = member.page;
  await m.goto("/me");
  await expect(m.getByText("رفضتها اللجنة").first()).toBeVisible();
  await expect(m.getByText("السبب: الصورة غير واضحة")).toBeVisible();
  await m.getByRole("button", { name: "أرسل صورة جديدة" }).click();
  await sendProof(m);
  const again = await latestPayment(M.ref, { status: "pending" });
  expect(again.id).not.toBe(first.id);

  slip = await openSlip(c, M.name);
  await slip.getByRole("button", { name: "أكّد الاستلام" }).click();
  const paid = await latestPayment(M.ref, { status: "confirmed" });
  expect(paid.id).toBe(again.id);
  await m.goto("/");
  await expect(youCard(m)).toContainText("دفعت حتى");
  await expect(youCard(m).getByRole("button", { name: "ادفع الآن" })).toHaveCount(0);
});
