import { expect, test } from "@playwright/test";
import {
  admin,
  COMMITTEE,
  E2E_MEMBERS,
  latestPayment,
  memberId,
  monthStates,
} from "../../supabase/tests/e2e/helpers";
import { monthsText } from "../../src/lib/reports/doc";
import { reportText } from "./numbers";
import { asCommittee, committeePhone, openPage, recordTransfer, undoFromSaved } from "./steps";

const M = E2E_MEMBERS.pay; // B-901: group B, 500 a month, nothing paid yet
const due = new Date().getMonth() + 1; // months owed so far this year (Africa/Nouakchott = UTC)
const paidCount = (s: Record<number, string>) =>
  Object.values(s).filter((v) => v === "paid").length;

test("a committee member records a transfer from a screenshot: confirmed at once, the same months everywhere; the recorder can undo it right after", async ({
  browser,
  baseURL,
}) => {
  const { ctx, page } = await committeePhone(browser, baseURL!, "treasurer"); // a plain member
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  expect(paidCount(await monthStates(M.ref))).toBe(0);

  // recorded → confirmed at once (m29: no review queue)
  await recordTransfer(page, M.name);
  const first = await latestPayment(M.ref, { status: "confirmed" });
  expect(first.method).toBe("bankily");
  // another committee member cannot take it back (no screen offers it; the database refuses)
  const other = await asCommittee("committee");
  expect((await other.rpc("undo_payment", { p_payment_id: first.id })).error).not.toBeNull();
  // the recorder's «تراجع» within 30 s
  await undoFromSaved(page);
  await expect.poll(async () => paidCount(await monthStates(M.ref))).toBe(0);
  expect((await latestPayment(M.ref)).status).not.toBe("confirmed");

  // recorded again: the same months paid on the statement, the members list and the report grid
  await recordTransfer(page, M.name);
  const paid = await latestPayment(M.ref, { status: "confirmed" });
  expect(paid.id).not.toBe(first.id);
  expect(paidCount(await monthStates(M.ref))).toBe(due);

  const me = await asCommittee("treasurer");
  const st = await me.rpc("member_statement", { p_member_id: await memberId(M.ref) });
  expect(st.error).toBeNull();
  const statement = st.data as {
    months: { paid: boolean }[];
    payments: { status: string; recorded_by?: string; recordedBy?: string }[];
  };
  expect(statement.months.filter((m) => m.paid)).toHaveLength(due);

  await openPage(page, "/committee/members");
  const row = page.getByRole("link").filter({ hasText: M.name }).first();
  await expect(row).toContainText(due === 12 ? "دفع السنة كاملة" : /دفع حتى/);

  // «جدول الأشهر» (the paper grid) as text: his line ticks the same months
  const grid = await reportText(page, /^جدول الأشهر/);
  const line = grid
    .split("\n")
    .find((l) => l.startsWith(`${M.name}:`) || l.includes(` ${M.name}:`));
  expect(line, grid).toBeDefined();
  expect(line).toContain(`✓ ${monthsText(Array.from({ length: due }, (_, i) => i + 1))}`);

  // who recorded it is kept
  const { data: rec } = await admin()
    .from("payments")
    .select("created_by")
    .eq("id", paid.id)
    .single();
  expect(rec?.created_by).toBe(COMMITTEE.treasurer.userId);
});
