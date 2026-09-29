// Every RPC-backed action: valid input → the right RPC with snake_case args; public cache
// expired only when public numbers can change.
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const updateTag = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/push/send", () => ({ notifyConfirmers: async () => {} }));
vi.mock("next/cache", () => ({ updateTag: (t: string) => updateTag(t) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("./committee", () => ({ getCommitteeSession: async () => null }));
vi.mock("@/lib/supabase/admin", () => ({ tryCreateAdminClient: () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

const a = await import("./actions");

const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const member = "0f8fad5b-d9cb-469f-a165-70867728950e";

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: id, error: null });
  updateTag.mockReset();
});

type Case = [string, () => Promise<unknown>, string, Record<string, unknown>, boolean];

const cases: Case[] = [
  [
    "updateMyProfile",
    () => a.updateMyProfile({ displayName: "  أحمد ", memberId: member }),
    "update_my_profile",
    { p_display_name: "أحمد", p_member_id: member },
    false,
  ],
  [
    "savePushSubscription",
    () =>
      a.savePushSubscription({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
        userAgent: "Android",
      }),
    "save_push_subscription",
    {
      p_endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      p_p256dh: "B".repeat(87),
      p_auth: "a".repeat(22),
      p_user_agent: "Android",
    },
    false,
  ],
  [
    "deletePushSubscription",
    () => a.deletePushSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/abc" }),
    "delete_push_subscription",
    { p_endpoint: "https://fcm.googleapis.com/fcm/send/abc" },
    false,
  ],
  [
    "cancelPayment",
    () => a.cancelPayment({ id, reason: "خطأ" }),
    "cancel_payment",
    { p_payment_id: id, p_reason: "خطأ" },
    true,
  ],
  [
    "rejectPayment",
    () => a.rejectPayment({ id, reason: "صورة غير واضحة" }),
    "reject_payment",
    { p_payment_id: id },
    false,
  ],
  ["undoPayment", () => a.undoPayment({ id }), "undo_payment", { p_payment_id: id }, true],
  [
    "recordExpense",
    () =>
      a.recordExpense({
        id,
        spentOn: "2026-09-01",
        category: "sports",
        amount: 7500,
        note: "كرات",
      }),
    "record_expense",
    { p_id: id, p_spent_on: "2026-09-01", p_category: "sports", p_amount: 7500, p_note: "كرات" },
    true,
  ],
  [
    "cancelExpense",
    () => a.cancelExpense({ id, reason: "مكرر" }),
    "cancel_expense",
    { p_expense_id: id },
    true,
  ],
  [
    "logReminder",
    () => a.logReminder({ kind: "individual", memberId: member }),
    "log_reminder",
    { p_kind: "individual", p_member_id: member },
    false,
  ],
  [
    "addMember",
    () =>
      a.addMember({
        listCode: "B",
        number: 71,
        fullName: "عضو",
        groupCode: "B",
        fromMonth: "2026-10-01",
      }),
    "add_member",
    {
      p_number: 71,
      p_group_code: "B",
      p_from_month: "2026-10-01",
      p_status: "active",
      p_list_code: "B",
    },
    true,
  ],
  [
    "updateMember",
    () => a.updateMember({ memberId: member, fullName: "عضو", phone: null, note: null }),
    "update_member",
    { p_member_id: member, p_phone: null, p_note: null },
    true,
  ],
  [
    "changeMemberStatus",
    () =>
      a.changeMemberStatus({
        memberId: member,
        fromMonth: "2026-10-01",
        status: "left",
        reason: "سفر",
      }),
    "change_member_status",
    { p_member_id: member, p_status: "left", p_reason: "سفر" },
    true,
  ],
  [
    "cancelLastPeriod",
    () => a.cancelLastPeriod({ memberId: member, reason: "خطأ" }),
    "cancel_last_period",
    { p_member_id: member, p_reason: "خطأ" },
    true,
  ],
  [
    "setJoinMonth",
    () => a.setJoinMonth({ memberId: member, fromMonth: "2026-03-01", reason: "خطأ" }),
    "set_join_month",
    { p_member_id: member, p_from_month: "2026-03-01", p_reason: "خطأ" },
    true,
  ],
  [
    "setGroupPrice",
    () => a.setGroupPrice({ groupCode: "A", year: 2027, monthlyAmount: 1000 }),
    "set_group_price",
    { p_group_code: "A", p_year: 2027, p_monthly_amount: 1000 },
    true,
  ],
  [
    "setCommitteeMember",
    () =>
      a.setCommitteeMember({ userId: id, displayName: "النائب", role: "deputy", memberId: null }),
    "set_committee_member",
    { p_user_id: id, p_role: "deputy", p_active: true, p_member_id: null },
    false,
  ],
  [
    "addFundAccount",
    () => a.addFundAccount({ method: "click", accountNumber: "4444 5555", holderName: "الصندوق" }),
    "add_fund_account",
    { p_method: "click", p_account_number: "44445555", p_sort_order: 0 },
    true,
  ],
  [
    "updateFundAccount",
    () =>
      a.updateFundAccount({ id, holderName: "الصندوق", note: null, sortOrder: 1, active: false }),
    "update_fund_account",
    { p_id: id, p_active: false },
    true,
  ],
  [
    "createCampaign",
    () =>
      a.createCampaign({
        id,
        title: "ترميم المسجد",
        amountMode: "fixed",
        participants: [{ memberId: member, expectedAmount: 5000 }],
      }),
    "create_campaign",
    {
      p_id: id,
      p_amount_mode: "fixed",
      p_participants: [{ member_id: member, expected_amount: 5000 }],
    },
    true,
  ],
  [
    "updateCampaign",
    () =>
      a.updateCampaign({ id, title: "ترميم", purpose: null, targetAmount: 30000, deadline: null }),
    "update_campaign",
    { p_id: id, p_target_amount: 30000, p_deadline: null },
    true,
  ],
  [
    "closeCampaign",
    () => a.closeCampaign({ id, surplusAction: "to_fund" }),
    "close_campaign",
    { p_id: id, p_surplus_action: "to_fund" },
    true,
  ],
  ["startHandover", () => a.startHandover({ id }), "start_handover", { p_id: id }, false],
  [
    "updateHandoverDraft",
    () =>
      a.updateHandoverDraft({
        id,
        countedLines: [{ label: "نقداً", method: "cash", amount: 7000 }],
        carryOver: [member],
      }),
    "update_handover_draft",
    {
      p_id: id,
      p_counted_lines: [{ label: "نقداً", method: "cash", account_id: null, amount: 7000 }],
      p_carry_over: [member],
    },
    false,
  ],
  ["submitHandover", () => a.submitHandover({ id }), "submit_handover", { p_id: id }, false],
  ["acceptHandover", () => a.acceptHandover({ id }), "accept_handover", { p_id: id }, true],
  [
    "cancelHandover",
    () => a.cancelHandover({ id, reason: "خطأ" }),
    "cancel_handover",
    { p_id: id, p_reason: "خطأ" },
    false,
  ],
  [
    "setCommitteeActive",
    () => a.setCommitteeActive({ userId: id, active: false }),
    "set_committee_active",
    { p_user_id: id, p_active: false },
    false,
  ],
];

describe("every RPC action", () => {
  it.each(cases)("%s", async (_name, call, fn, args, touchesPublic) => {
    const r = await call();
    expect(r).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith(fn, expect.objectContaining(args));
    expect(updateTag).toHaveBeenCalledTimes(touchesPublic ? 1 : 0);
  });

  it("maps a database refusal for any of them", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", hint: "not_admin", message: "x" },
    });
    expect(
      await a.setGroupPrice({ groupCode: "A", year: 2027, monthlyAmount: 1000 }),
    ).toMatchObject({
      ok: false,
      code: "not_admin",
    });
    expect(updateTag).not.toHaveBeenCalled();
  });
});
