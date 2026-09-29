import { describe, expect, it } from "vitest";
import { monthName } from "@/lib/dates";
import { formatNumber, ltr } from "@/lib/format";
import { groupReminderText, monthsList, reminderLink, reminderText } from "./reminders";
import type { Arrear } from "./types";

const arrear: Arrear = {
  memberId: "m",
  listCode: "A",
  number: 7,
  memberRef: "A-7",
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
      holderName: "الرابطة",
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
    expect(t).toContain(`${formatNumber(2000)} أوقية (${formatNumber(200)} أوقية جديدة)`);
    expect(t).not.toContain("MRU");
    expect(t).toContain(`بنكيلي: ${ltr("22000001")} (الرابطة)`);
    expect(t).toContain(ltr("+22200000000"));
  });

  it("personal reminder links to «ادفع الآن» (/?pay=1) instead of the public list (P4)", () => {
    const t = reminderText(arrear, {
      ...ctx,
      publicUrl: "https://x.test/members",
      payUrl: "https://x.test/?pay=1",
    });
    expect(t).toContain(`ادفع وأرسل صورة التحويل من هنا: ${ltr("https://x.test/?pay=1")}`);
    expect(t).not.toContain("x.test/members");
    expect(reminderText(arrear, { ...ctx, publicUrl: "https://x.test/members" })).toContain(
      "حالة الرسوم الشهرية",
    );
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
});
