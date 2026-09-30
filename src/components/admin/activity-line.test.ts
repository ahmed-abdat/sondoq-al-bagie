import { describe, expect, it } from "vitest";
import { activityLine } from "./activity-line";

const e = (action: string, p: Partial<Parameters<typeof activityLine>[0]> = {}) => ({
  id: 1,
  at: "2026-09-30T11:48:00Z",
  actorName: "أحمد",
  action,
  table: "t",
  rowId: null,
  subject: null,
  amount: null,
  reason: null,
  ...p,
});

describe("«سجل العمليات» lines", () => {
  it("says what matters in Arabic, with the amount and the reason", () => {
    expect(
      activityLine(e("cancel_payment", { subject: "محمد", amount: 3000, reason: "مكررة" })),
    ).toMatchObject({
      what: expect.stringMatching(/^ألغى دفعة محمد \(3\s000 أوقية\)\. السبب: مكررة$/),
      kind: "no",
    });
    expect(activityLine(e("record_payment"))?.settings).toBeUndefined();
  });
  it("marks settings changes (المسؤول only) and hides actions without a sentence", () => {
    expect(activityLine(e("deactivate fund account", { subject: "بنكيلي" }))).toMatchObject({
      what: "أوقف المحفظة بنكيلي",
      settings: true,
    });
    expect(activityLine(e("set_push_kinds"))).toBeNull();
    expect(activityLine(e("some_new_code"))).toBeNull();
  });
  it("never shows Latin text", () => {
    const actions = [
      "record_payment",
      "update_fund_account",
      "create_levy",
      "move_members_to_group",
    ];
    for (const a of actions) expect(activityLine(e(a))?.what ?? "").not.toMatch(/[A-Za-z]/);
  });
});
