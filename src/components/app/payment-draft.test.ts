import { describe, expect, it } from "vitest";
import { fitRow, payableMonths, summarize, toRecordInput, type Draft } from "./payment-draft";

const A1 = { memberId: "m-a1", groupCode: "A" };
const B2 = { memberId: "m-b2", groupCode: "B" };
const base: Draft = {
  rows: [{ m: A1, months: [7, 8, 9] }],
  prices: { A: 1000, B: 500 },
  method: "bankily",
  payerName: "محمد",
  sentText: "",
  creditFor: null,
  campaignId: null,
  campaignText: "",
  year: 2026,
};
const d = (p: Partial<Draft>): Draft => ({ ...base, ...p });

describe("summarize: the first thing still missing, in order", () => {
  it("no rows", () => {
    expect(summarize(d({ rows: [] })).block).toEqual({ msg: "اختر العضو أولًا." });
  });
  it("zero total", () => {
    expect(summarize(d({ rows: [{ m: A1, months: [] }] })).block?.step).toBe("months");
  });
  it("missing price", () => {
    const b = summarize(d({ prices: { B: 500 } })).block;
    expect(b?.msg).toBe("حدد الرسوم الشهرية لسنة 2026 أولًا.");
    expect(b?.step).toBeUndefined();
  });
  it("no method", () => {
    expect(summarize(d({ method: null })).block?.step).toBe("method");
  });
  it("no payer", () => {
    expect(summarize(d({ payerName: "" })).block?.step).toBe("payer");
  });
  it("underpaid", () => {
    const s = summarize(d({ sentText: "2500" }));
    expect(s.diff).toBe(-500);
    expect(s.block).toEqual({ msg: "المبلغ المحوّل أقل من المجموع بـ 500 أوقية.", step: "amount" });
  });
  it("overpaid with two members and no one chosen for the rest", () => {
    const s = summarize(
      d({
        rows: [
          { m: A1, months: [9] },
          { m: B2, months: [9] },
        ],
        sentText: "2000",
      }),
    );
    expect(s.diff).toBe(500);
    expect(s.block?.step).toBe("credit");
  });
  it("nothing missing", () => {
    const s = summarize(base);
    expect(s).toMatchObject({ feeTotal: 3000, total: 3000, sent: null, diff: 0, block: null });
  });
});

describe("summarize: amounts", () => {
  it("one member keeps the rest of a bigger transfer", () => {
    const s = summarize(d({ sentText: "3500" }));
    expect(s).toMatchObject({ diff: 500, creditTo: "m-a1", credit: 500, block: null });
  });
  it("a chosen member keeps the rest", () => {
    const s = summarize(
      d({
        rows: [
          { m: A1, months: [9] },
          { m: B2, months: [9] },
        ],
        sentText: "2000",
        creditFor: "m-b2",
      }),
    );
    expect(s).toMatchObject({ creditTo: "m-b2", credit: 500, block: null });
  });
  it("Arabic-Indic digits in the typed amounts", () => {
    expect(summarize(d({ sentText: "٣٠٠٠" })).sent).toBe(3000);
  });
  it("short transfer, one member: how many months the money covers", () => {
    expect(summarize(d({ sentText: "2000" })).fitMonths).toBe(2);
    expect(summarize(d({ sentText: "500" })).fitMonths).toBeNull();
  });
  it("a contribution counts only with a campaign", () => {
    expect(summarize(d({ campaignText: "1000" })).total).toBe(3000);
    expect(summarize(d({ campaignId: "c1", campaignText: "1000" })).total).toBe(4000);
  });
});

describe("toRecordInput", () => {
  const extra = { id: "p1", paidOn: "2026-09-28" };
  it("one allocation per month at the member's price", () => {
    const r = toRecordInput({ ...base, method: "bankily" }, extra);
    expect(r).toMatchObject({ id: "p1", payerName: "محمد", method: "bankily", amount: 3000 });
    expect(r.allocations).toEqual(
      [7, 8, 9].map((month) => ({
        kind: "months",
        memberId: "m-a1",
        year: 2026,
        month,
        amount: 1000,
      })),
    );
  });
  it("overpaid with credit: a credit allocation of the difference", () => {
    const r = toRecordInput({ ...base, method: "bankily", sentText: "3500" }, extra);
    expect(r.amount).toBe(3500);
    expect(r.allocations.at(-1)).toEqual({ kind: "credit", memberId: "m-a1", amount: 500 });
  });
  it("campaign plus months: the contribution carries the first row's member", () => {
    const r = toRecordInput(
      {
        ...base,
        method: "cash",
        rows: [
          { m: B2, months: [9] },
          { m: A1, months: [9] },
        ],
        campaignId: "c1",
        campaignText: "2000",
      },
      extra,
    );
    expect(r.amount).toBe(3500);
    expect(r.allocations.find((a) => a.kind === "campaign")).toEqual({
      kind: "campaign",
      campaignId: "c1",
      memberId: "m-b2",
      amount: 2000,
    });
  });
});

describe("payableMonths: only owed months", () => {
  it("a June joiner: January to May are not owed, never offered", () => {
    // N×5, paid June, late July to September, upcoming after
    expect(payableMonths("NNNNNPLLLUUU", 9)).toEqual({
      open: [7, 8, 9, 10, 11, 12],
      late: [7, 8, 9],
    });
  });
  it("exempt from October: nothing after it", () => {
    expect(payableMonths("PPPPPPPPLNNN", 9)).toEqual({ open: [9], late: [9] });
  });
  it("everything paid or not owed", () => {
    expect(payableMonths("NNNNNNNNNNNN", 9)).toEqual({ open: [], late: [] });
  });
});

describe("earlier years and per-month prices", () => {
  const withPast = {
    m: { ...A1, prices: { "2025-11": 800, "2025-12": 800 } },
    months: [9],
    past: ["2025-11", "2025-12"],
  };
  it("each month carries its year and its own price", () => {
    const input = toRecordInput(
      { ...d({ rows: [withPast] }), method: "bankily" },
      { id: "p1", paidOn: "2026-09-28" },
    );
    expect(input.amount).toBe(2600);
    expect(input.allocations).toEqual([
      { kind: "months", memberId: "m-a1", year: 2025, month: 11, amount: 800 },
      { kind: "months", memberId: "m-a1", year: 2025, month: 12, amount: 800 },
      { kind: "months", memberId: "m-a1", year: 2026, month: 9, amount: 1000 },
    ]);
  });
  it("a group change mid-year prices the months before it differently", () => {
    const row = { m: { ...A1, prices: { "2026-07": 500 } }, months: [7, 8] };
    expect(summarize(d({ rows: [row] })).total).toBe(1500);
  });
  it("a year with no price blocks with that year", () => {
    const row = { m: { ...A1, prices: { "2025-12": null } }, months: [], past: ["2025-12"] };
    expect(summarize(d({ rows: [row] })).block?.msg).toBe("حدد الرسوم الشهرية لسنة 2025 أولًا.");
  });
  it("a short transfer fits the oldest months first", () => {
    const s = summarize(d({ rows: [withPast], sentText: "1600" }));
    expect(s.fitMonths).toBe(2);
    expect(fitRow(withPast, 2)).toMatchObject({ past: ["2025-11", "2025-12"], months: [] });
    expect(fitRow(withPast, 1)).toMatchObject({ past: ["2025-11"], months: [] });
  });
});
