import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  admin,
  campaignProgress,
  E2E_CAMPAIGN_ID,
  E2E_MEMBERS,
  memberId,
} from "../../supabase/tests/e2e/helpers";
import { messageFor } from "../../src/lib/data/errors";
import { asCommittee, committeePhone, errorText, openPage } from "./steps";

const today = new Date().toISOString().slice(0, 10);

/** record_payment as a committee member (the record screen for levies/donations is being rebuilt). */
async function record(
  who: "treasurer" | "committee" | "admin",
  payer: string,
  allocations: {
    kind: "campaign";
    campaign_id: string;
    member_id: string | null;
    amount: number;
  }[],
) {
  const c = await asCommittee(who);
  return c.rpc("record_payment", {
    p_id: randomUUID(),
    p_payer_name: payer,
    p_method: "cash",
    p_amount: allocations.reduce((s, a) => s + a.amount, 0),
    p_paid_on: today,
    p_allocations: allocations,
  });
}

test("a contribution to a donation, then a لوحة: full share only, and only «مسؤول» exempts", async ({
  browser,
  baseURL,
}) => {
  const give = E2E_MEMBERS.campaign; // B-903
  const other = E2E_MEMBERS.cash; // B-904
  const giveId = await memberId(give.ref);
  const otherId = await memberId(other.ref);

  // a donation, recorded by a plain committee member: confirmed at once, the total moves
  const before = await campaignProgress();
  const gift = await record("treasurer", give.name, [
    { kind: "campaign", campaign_id: E2E_CAMPAIGN_ID, member_id: giveId, amount: 1000 },
  ]);
  expect(gift.error).toBeNull();
  await expect.poll(async () => (await campaignProgress()).collected).toBe(before.collected + 1000);

  // a لوحة of 2 000 on both (created by «مسؤول»)
  const levyId = randomUUID();
  const plain = await asCommittee("treasurer");
  const notAdmin = await plain.rpc("create_levy", {
    p_id: randomUUID(),
    p_title: "لوحة الاختبار",
    p_amount: 2000,
    p_member_ids: [giveId, otherId],
  });
  expect(errorText(notAdmin.error)).toBe("هذا الإجراء للمسؤول فقط.");
  const boss = await asCommittee("admin");
  expect(
    (
      await boss.rpc("create_levy", {
        p_id: levyId,
        p_title: "لوحة الاختبار",
        p_amount: 2000,
        p_member_ids: [giveId, otherId],
      })
    ).error,
  ).toBeNull();

  // a share is paid whole or not at all
  const half = await record("treasurer", give.name, [
    { kind: "campaign", campaign_id: levyId, member_id: giveId, amount: 1000 },
  ]);
  expect(errorText(half.error)).toBe(messageFor("levy_full_share"));
  const whole = await record("treasurer", give.name, [
    { kind: "campaign", campaign_id: levyId, member_id: giveId, amount: 2000 },
  ]);
  expect(whole.error).toBeNull();

  // exempting the other share: «مسؤول» only
  const refused = await plain.rpc("exempt_levy_share", {
    p_id: levyId,
    p_member_id: otherId,
    p_reason: "طالب",
  });
  expect(errorText(refused.error)).toBe("هذا الإجراء للمسؤول فقط.");
  expect(
    (await boss.rpc("exempt_levy_share", { p_id: levyId, p_member_id: otherId, p_reason: "طالب" }))
      .error,
  ).toBeNull();

  const shares = await admin()
    .from("campaign_participants")
    .select("member_id, expected_amount, exempt_reason, exempted_by")
    .eq("campaign_id", levyId);
  expect(shares.error).toBeNull();
  const byMember = Object.fromEntries((shares.data ?? []).map((s) => [s.member_id, s]));
  expect(byMember[otherId]).toMatchObject({ exempt_reason: "طالب" });
  expect(byMember[otherId].exempted_by).toBeTruthy();
  const levy = await campaignProgress(levyId);
  expect(levy.collected).toBe(2000);

  // the campaigns page still opens with the new totals behind it
  const { page } = await committeePhone(browser, baseURL!, "treasurer");
  await openPage(page, "/committee/campaigns");
  await expect(page.getByText("ترميم المسجد").first()).toBeVisible();
});
