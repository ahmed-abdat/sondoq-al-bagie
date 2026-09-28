import { describe, expect, it } from "vitest";
import { formatMonth, monthName } from "@/lib/dates";
import { formatMro } from "@/lib/format";
import {
  groupReminderText,
  monthsList,
  receiptText,
  reminderLink,
  reminderText,
} from "./reminders";
import type { Arrear } from "./types";

const arrear: Arrear = {
  memberId: "m",
  number: 7,
  fullName: "محمد ولد أحمد",
  phone: "+22236123456",
  groupCode: "A",
  status: "active",
  months: ["2026-08", "2026-09"],
  monthsCount: 2,
  amountOwed: 2000,
  credit: 0,
  lastRemindedAt: null,
};
const ctx = {
  accounts: [
    {
      id: "a",
      method: "bankily" as const,
      accountNumber: "22000001",
      holderName: "رابطة البقيع",
      sortOrder: 1,
      active: true,
    },
  ],
  whatsappContact: "+22200000000",
};

describe("reminders", () => {
  it("lists months with the year once", () => {
    expect(monthsList(["2026-08", "2026-09"])).toBe(`${monthName(8)}، ${monthName(9)} 2026`);
    expect(monthsList(["2025-12", "2026-01"])).toContain("2025");
  });

  it("writes a personal reminder with months, amount, accounts and contact", () => {
    const t = reminderText(arrear, ctx);
    expect(t).toContain("محمد ولد أحمد");
    expect(t).toContain("الرسوم الشهرية");
    expect(t).toContain("شهران");
    expect(t).toContain(`${formatMro(2000)} (`);
    expect(t).toContain("MRU)");
    expect(t).toContain("بنكيلي: 22000001 (رابطة البقيع)");
    expect(t).toContain("+22200000000");
  });

  it("links to the member's WhatsApp", () => {
    expect(reminderLink(arrear, ctx)).toMatch(/^https:\/\/wa\.me\/22236123456\?text=/);
    expect(reminderLink({ ...arrear, phone: null }, ctx)).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  it("keeps the group message free of names and amounts", () => {
    const t = groupReminderText({ ...ctx, lateCount: 12 });
    expect(t).toContain("12");
    expect(t).not.toContain("محمد");
    expect(t).not.toContain("أوقية");
  });

  it("writes a receipt message with the verification link", () => {
    const t = receiptText(
      {
        status: "valid",
        code: "BQ-ABCD-1234",
        receiptNo: "2026-0007",
        payerName: "محمد",
        amount: 1000,
        method: "bankily",
        paidOn: "2026-09-01",
        confirmedAt: "2026-09-01T10:00:00Z",
        confirmedByName: "الأمين",
        confirmedByRole: "treasurer",
        txnRefLast4: null,
        members: [{ number: 7, fullName: "محمد", months: [{ year: 2026, month: 9 }] }],
        campaignTitles: [],
      },
      "https://x.app/r/BQ-ABCD-1234",
    );
    expect(t).toContain("2026-0007");
    expect(t).toContain("https://x.app/r/BQ-ABCD-1234");
    expect(t).toContain(formatMonth("2026-09"));
  });
});
