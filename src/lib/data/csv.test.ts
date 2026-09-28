import { describe, expect, it } from "vitest";
import { expensesCsv, membersCsv, paymentsCsv, toCsv } from "./csv";
import type { CampaignProgress, MemberAdmin, PendingPayment } from "./types";

const lines = (csv: string) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

describe("csv", () => {
  it("starts with a BOM, quotes separators and blocks formulas in free text", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        ["x,y", 'say "hi"'],
        [null, 5],
      ],
    );
    expect(csv.startsWith("﻿a,b\r\n")).toBe(true);
    expect(lines(csv)).toEqual(["a,b", '"x,y","say ""hi"""', ",5"]);
    const m = membersCsv([
      {
        memberId: "m",
        listCode: "A",
        number: 3,
        memberRef: "A-3",
        fullName: "=HYPERLINK(1)",
        phone: "+22233334444",
        note: null,
        groupCode: "A",
        status: "exempt",
        monthsPaidThisYear: 4,
        monthsBehind: 0,
        amountOwed: 1500,
        joinedMonth: "2026-01-01",
      } satisfies MemberAdmin,
    ]);
    expect(lines(m)[1]).toBe("A-3,A,3,'=HYPERLINK(1),+22233334444,A,معفى,4,0,1500,150,2026-01,");
  });

  it("lists payment members, months, campaign gifts and credit", () => {
    const campaigns = [{ campaignId: "c1", title: "ملعب" }] as CampaignProgress[];
    const p: PendingPayment = {
      id: "p",
      status: "confirmed",
      payerName: "أحمد",
      method: "bankily",
      amount: 3500,
      paidOn: "2026-03-02",
      txnRef: "123",
      proofPath: null,
      note: null,
      createdAt: "2026-03-02T10:15:00+00:00",
      createdByName: "أمين",
      decidedAt: null,
      decidedByName: null,
      rejectReason: null,
      cancelReason: null,
      receiptCode: "BQ-ABCD-0001",
      receiptNo: "2026-0001",
      allocations: [
        {
          kind: "months",
          memberId: "m",
          listCode: "A",
          number: 1,
          fullName: "س",
          year: 2026,
          month: 1,
          amount: 1000,
        },
        {
          kind: "months",
          memberId: "m",
          listCode: "A",
          number: 1,
          fullName: "س",
          year: 2026,
          month: 2,
          amount: 1000,
        },
        {
          kind: "campaign",
          campaignId: "c1",
          memberId: null,
          listCode: null,
          number: null,
          fullName: null,
          amount: 1000,
        },
        { kind: "credit", memberId: "m", listCode: "A", number: 1, fullName: "س", amount: 500 },
      ],
    };
    const row = lines(paymentsCsv([p], campaigns))[1];
    expect(row).toBe(
      "2026-0001,BQ-ABCD-0001,2026-03-02,أحمد,بنكيلي,3500,350,مؤكدة,A-1 س,A-1: 2026-01 2026-02,ملعب: 1000,500,123,أمين,2026-03-02 10:15,,,,",
    );
  });

  it("marks cancelled expenses and names the campaign", () => {
    const csv = expensesCsv(
      [
        {
          id: "e",
          spentOn: "2026-04-01",
          category: "teaching",
          amount: 2000,
          note: "كتب",
          campaignId: "c1",
          receiptPath: null,
          createdAt: "2026-04-01T08:00:00Z",
          cancelledAt: "x",
          cancelReason: "خطأ",
        },
      ],
      [{ campaignId: "c1", title: "ملعب" }] as CampaignProgress[],
    );
    expect(lines(csv)[1]).toBe("2026-04-01,التدريس,2000,200,كتب,ملعب,ملغاة,خطأ,2026-04-01 08:00");
  });
});
