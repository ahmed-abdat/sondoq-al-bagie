import { describe, expect, it } from "vitest";
import { activityLine, activityLines } from "./activity-line";
import { exemptWords } from "./stats";

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

describe("the log as the committee reads it (owner bug: one payment, two lines)", () => {
  // the production rows of payment 93b955d6…: one transaction, same moment, same actor
  const at = "2026-09-30T11:21:04.512Z";
  const pay = "93b955d6-0000-4000-8000-000000000001";
  const rows = [
    e("record_payment", {
      id: 11,
      at,
      table: "payments",
      rowId: pay,
      subject: "محمد يحي ولد سيدي",
      amount: 24000,
    }),
    e("confirm_payment", {
      id: 12,
      at,
      table: "payments",
      rowId: pay,
      subject: "محمد يحي ولد سيدي",
      amount: 24000,
    }),
    e("confirm_payment", {
      id: 13,
      at,
      table: "payment_months",
      rowId: "pm-1",
      subject: "محمد يحي ولد سيدي",
    }),
    e("update_fund_account", {
      id: 14,
      at: "2026-09-30T12:10:27Z",
      actorName: null,
      system: true,
      table: "fund_accounts",
    }),
  ];
  it("shows one «سجّل دفعة» line and no system row", () => {
    const out = activityLines(rows);
    expect(out).toHaveLength(1);
    expect(out[0].what).toMatch(/^سجّل دفعة محمد يحي ولد سيدي \(24\s000 أوقية\)$/);
  });
  it("an actor without a name stays, as «عضو في اللجنة»", () => {
    const out = activityLines([
      e("record_expense", { actorName: null, system: false, subject: "كرات" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].who).toBe("عضو في اللجنة");
  });
  it("an old payment counted later keeps its line, without «ثبّت»", () => {
    const later = e("confirm_payment", {
      id: 20,
      at: "2026-09-30T13:00:00Z",
      table: "payments",
      rowId: "old-1",
      subject: "عالي",
      amount: 1000,
    });
    const out = activityLines([later]);
    expect(out).toHaveLength(1);
    expect(out[0].what).not.toMatch(/ثبّت/);
    expect(out[0].what).toMatch(/^سجّل دفعة قديمة عالي/);
  });
});

describe("moves between wallets (m43)", () => {
  const move = e("record_wallet_transfer", {
    id: 30,
    table: "wallet_transfers",
    rowId: "t-1",
    subject: "بنكيلي → نقدًا",
    amount: 36000,
  });
  it("reads «حوّل مالًا من بنكيلي إلى النقد» (old moves still read well)", () => {
    const [l] = activityLines([move]);
    expect(l.what).toMatch(/^حوّل مالًا من بنكيلي إلى النقد \(36\s000 أوقية\)$/);
    const cancelled = activityLines([
      e("cancel_wallet_transfer", {
        ...move,
        id: 31,
        action: "cancel_wallet_transfer",
        reason: "خطأ",
      }),
      move,
    ]);
    expect(cancelled[0].what).toMatch(/^ألغى تحويلًا من بنكيلي إلى النقد .*السبب: خطأ$/);
  });
});

describe("exempt count", () => {
  it("never «1 معفون»", () => {
    expect(exemptWords(1)).toBe("عضو معفى");
    expect(exemptWords(2)).toBe("عضوان معفيان");
    expect(exemptWords(4)).toBe("4 أعضاء معفون");
    expect(exemptWords(12)).toBe("12 عضوًا معفى");
  });
});
