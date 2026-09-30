import { expect, test, type Page } from "@playwright/test";
import { latestPayment, memberId, monthStates } from "../../supabase/tests/e2e/helpers";
import { home, memberMonths, reportText, statsPage, truth, type Home, type Truth } from "./numbers";
import { asCommittee, committeePhone, recordTransfer, undoFromSaved } from "./steps";

// Accuracy first (owner, plan §12): after each step a committee member takes, every screen shows
// the same numbers, and they are the database's: home, «الإحصاءات», the member's page, the
// reports («الملخص», «المتأخرات»). A step moves the balance by exactly its amount, never more.

const M = { ref: "B-905", name: "اختبار الأرقام", number: 905 }; // added here: group B, 500 a month
const FEE = 500;
const due = new Date().getMonth() + 1; // months owed so far this year (Africa/Nouakchott = UTC)
const paid = (s: Record<number, string>) => Object.values(s).filter((v) => v === "paid").length;
const year = new Date().getUTCFullYear();

/** «المحافظ» report: this year's money in and out of the wallet `name` (all its accounts). */
async function wallet(boss: Awaited<ReturnType<typeof asCommittee>>, name: string) {
  const w = await boss.from("wallet_types").select("id").eq("name", name).single();
  expect(w.error).toBeNull();
  const r = await boss.rpc("report_wallets", { p_from: `${year}-01-01`, p_to: `${year}-12-31` });
  expect(r.error).toBeNull();
  const rows = (
    r.data as { wallet_type_id: number | null; in_amount: number; out_amount: number }[]
  ).filter((x) => x.wallet_type_id === w.data!.id);
  return {
    in: rows.reduce((sum, x) => sum + Number(x.in_amount), 0),
    out: rows.reduce((sum, x) => sum + Number(x.out_amount), 0),
  };
}

/** Every screen against the database, and against each other. */
async function sameEverywhere(page: Page, t: Truth): Promise<Home> {
  const h = await home(page);
  expect(h.balance, "home balance = database").toBe(t.balance);
  expect([h.paidUp, h.active], "home fees = report_fee_stats").toEqual([t.paidUp, t.active]);

  const s = await statsPage(page);
  expect([s.paidUp, s.active], "«الإحصاءات» = report_fee_stats").toEqual([t.paidUp, t.active]);
  expect(s.pct, "home % = «الإحصاءات» %").toBe(h.pct);

  const summary = await reportText(page, /^الملخص/);
  // this year's «الملخص» ends today: the fund part of its closing is home's balance
  const closing =
    /منها في الصندوق:\s*([\d\s]+)/.exec(summary) ??
    /في الصندوق آخر [^:]+:\s*([\d\s]+)/.exec(summary);
  expect(closing, summary).not.toBeNull();
  expect(Number(closing![1].replace(/\D/g, "")), "«الملخص» «في الصندوق» = home balance").toBe(
    t.balance,
  );
  return h;
}

/** The member on every screen: ticked months = the database's paid months; late or not. */
async function memberEverywhere(page: Page, months: number) {
  expect(paid(await monthStates(M.ref)), "database months").toBe(months);
  expect(await memberMonths(page, M.ref), "member page months").toBe(months);
  const late = await reportText(page, /^المتأخرات/);
  if (months < due) expect(late, "«المتأخرات» lists him").toContain(M.name);
  else expect(late, "«المتأخرات» no longer lists him").not.toContain(M.name);
}

test("every screen shows the database's numbers after each step, and each step moves them by exactly its amount", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(300_000);
  const boss = await asCommittee("admin");
  if (
    (await boss.from("members").select("id").eq("number", M.number).eq("list_code", "B")).data
      ?.length === 0
  ) {
    const added = await boss.rpc("add_member", {
      p_number: M.number,
      p_full_name: M.name,
      p_group_code: "B",
      p_list_code: "B",
      p_from_month: `${year}-01-01`,
    });
    expect(added.error).toBeNull();
  }
  await memberId(M.ref);

  const { ctx, page } = await committeePhone(browser, baseURL!, "treasurer");
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);

  // 0 · before anything
  const t0 = await truth();
  const h0 = await sameEverywhere(page, t0);
  await memberEverywhere(page, 0);
  const w0 = await wallet(boss, "بنكيلي");

  // 1 · a transfer for his late months: the balance and «هذا الشهر» move by exactly its amount
  await recordTransfer(page, M.name);
  const pay = await latestPayment(M.ref, { status: "confirmed" });
  expect(pay.amount).toBe(due * FEE);
  expect(await wallet(boss, "بنكيلي"), "«المحافظ»: بنكيلي += the transfer").toEqual({
    ...w0,
    in: w0.in + pay.amount,
  });
  const t1 = await truth();
  expect(t1.balance - t0.balance).toBe(pay.amount);
  expect(t1.paidUp - t0.paidUp).toBe(1);
  const h1 = await sameEverywhere(page, t1);
  // home counts the money received this month (what moved the balance), whatever months it pays
  expect(h1.monthIn - h0.monthIn, "«المداخيل هذا الشهر» += the transfer").toBe(pay.amount);
  expect(h1.monthOut, "«المصاريف» unchanged by a payment").toBe(h0.monthOut);
  await memberEverywhere(page, due);

  // 2 · «مسؤول» cancels the payment: back to step 0, months unpaid again
  const cancelled = await boss.rpc("cancel_payment", {
    p_payment_id: pay.id,
    p_reason: "دفعة مكررة",
  });
  expect(cancelled.error).toBeNull();
  const t2 = await truth();
  expect(t2).toEqual(t0);
  expect(await wallet(boss, "بنكيلي"), "«المحافظ»: a cancelled payment is gone").toEqual(w0);
  await sameEverywhere(page, t2);
  await memberEverywhere(page, 0);

  // 3 · recorded again and undone by the recorder: nothing moved
  await recordTransfer(page, M.name);
  await undoFromSaved(page);
  const t3 = await truth();
  expect(t3).toEqual(t0);
  expect(await wallet(boss, "بنكيلي"), "«المحافظ»: an undone payment is gone").toEqual(w0);
  await sameEverywhere(page, t3);
  await memberEverywhere(page, 0);

  // 4 · an expense from home: the balance and «صرف» move by exactly its amount
  await page.goto("/committee");
  await page.getByRole("button", { name: /سجّل مصروفًا/ }).click();
  const sheet = page.getByRole("dialog", { name: "سجّل مصروفًا" });
  await sheet.getByLabel(/المبلغ/).fill("1500");
  await sheet.getByRole("radiogroup", { name: "النشاط" }).getByRole("radio").first().click();
  await sheet.getByLabel(/ماذا اشتُري/).fill("اختبار الأرقام");
  await sheet
    .getByRole("radiogroup", { name: "المحفظة" })
    .getByRole("radio", { name: "بنكيلي" })
    .click();
  const account = sheet.getByRole("radiogroup", { name: "أي حساب" });
  if (await account.count()) await account.getByRole("radio").first().click();
  await sheet.getByRole("button", { name: "سجّل المصروف" }).click();
  await expect(sheet).toBeHidden();
  const t4 = await truth();
  expect(t0.balance - t4.balance).toBe(1500);
  const h4 = await sameEverywhere(page, t4);
  expect(h4.monthOut - h0.monthOut, "«المصاريف» += the expense").toBe(1500);
  expect(h4.monthIn, "«المداخيل» unchanged by an expense").toBe(h0.monthIn);
  expect(await wallet(boss, "بنكيلي"), "«المحافظ»: بنكيلي out += the expense").toEqual({
    ...w0,
    out: w0.out + 1500,
  });
});
