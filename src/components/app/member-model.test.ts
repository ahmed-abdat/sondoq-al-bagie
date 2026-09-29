import { describe, expect, it } from "vitest";
import {
  coverLines,
  historySections,
  pendingCounts,
  waitingLine,
  youCard,
  youDots,
  youStatus,
} from "./member-model";
import type { MemberHistoryItem } from "@/lib/data/member-types";

const alloc = (memberId: string, fullName: string, month: number, year = 2026) => ({
  kind: "months" as const,
  memberId,
  memberRef: "A-3",
  fullName,
  year,
  month,
  amount: 1000,
  campaignTitle: null,
});
const item = (p: Partial<MemberHistoryItem>): MemberHistoryItem => ({
  id: "x",
  status: "confirmed",
  amount: 1000,
  method: "bankily",
  paidOn: "2026-09-01",
  createdAt: "2026-09-01T10:00:00Z",
  decidedAt: null,
  receiptCode: null,
  rejectReason: null,
  payerName: "سيدي",
  sentByMe: true,
  forMe: true,
  allocations: [],
  ...p,
});

describe("youStatus", () => {
  it("says regular, late with count and amount, or exempt", () => {
    expect(youStatus({ status: "active", monthsBehind: 0, amountOwed: 0 })).toEqual({
      late: false,
      text: "أنت منتظم",
    });
    expect(
      youStatus({ status: "active", monthsBehind: 3, amountOwed: 3000 }, "PPPPPPLLLUUU").text,
    ).toMatch(/^دفعت حتى يونيو · عليك 3\s000 أوقية$/);
    expect(
      youStatus({ status: "active", monthsBehind: 1, amountOwed: 0 }, "LLLLLLLLLUUU").text,
    ).toBe("لم تدفع هذا العام");
    expect(youStatus({ status: "exempt", monthsBehind: 0, amountOwed: 0 }).late).toBe(false);
  });
});

describe("youCard", () => {
  const on = { status: "active" as const, monthsBehind: 0, amountOwed: 0 };
  it("whole year paid (months before joining do not count)", () => {
    expect(youCard(on, "PPPPPPPPPPPP", 2026)).toEqual({
      kind: "full",
      text: "دفعت رسوم 2026 كاملة",
    });
    expect(youCard(on, "NNNNNPPPPPPP", 2026).kind).toBe("full");
  });
  it("up to date: paid up to the last paid month", () => {
    expect(youCard(on, "PPPPPPPPPUUU", 2026)).toEqual({ kind: "upto", text: "دفعت حتى سبتمبر" });
    expect(youCard(on, "UUUUUUUUUUUU", 2026).text).toBe("أنت منتظم");
  });
  it("late and exempt", () => {
    const late = youCard({ ...on, monthsBehind: 3, amountOwed: 3000 }, "PPPPPPLLLUUU", 2026);
    expect(late.kind).toBe("late");
    expect(late.text).toMatch(/^دفعت حتى يونيو · عليك 3\s000 أوقية$/);
    // proof sent and waiting: the card says so, the late words give way (audit M1)
    expect(youCard({ ...on, monthsBehind: 3, amountOwed: 3000 }, "PPPPPPLLLUUU", 2026, 1)).toEqual({
      kind: "pending",
      text: "أرسلت صورة التحويل. تنتظر تأكيد اللجنة.",
    });
    expect(youCard({ ...on, status: "exempt" }, "NNNNNNNNNNNN", 2026).kind).toBe("exempt");
  });
});

describe("youDots and waitingLine", () => {
  it("maps the month code to twelve dots", () => {
    const d = youDots("PPPPPPLLLUUN");
    expect(d).toHaveLength(12);
    expect(d[0]).toMatchObject({ month: 1, name: "يناير", state: "paid" });
    expect(d[6].state).toBe("late");
    expect(d[9].state).toBe("upcoming");
    expect(d[11].state).toBe("off");
  });
  it("counts waiting submissions in words", () => {
    expect(waitingLine(0)).toBe("");
    expect(waitingLine(1)).toBe("دفعة بانتظار التأكيد");
    expect(waitingLine(2)).toBe("دفعتان بانتظار التأكيد");
    expect(waitingLine(4)).toBe("4 دفعات بانتظار التأكيد");
  });
});

describe("coverLines", () => {
  it("says the months only when the payment is just for me", () => {
    const x = item({ allocations: [7, 8, 9].map((m) => alloc("me", "سيدي", m)) });
    expect(coverLines(x, "me")).toEqual(["رسوم من يوليو إلى سبتمبر 2026"]);
  });
  it("names each member when it covers several, me as «عنك»", () => {
    const x = item({
      allocations: [alloc("me", "سيدي", 9), alloc("b", "الحسن", 8), alloc("b", "الحسن", 9)],
    });
    const lines = coverLines(x, "me");
    expect(lines[0]).toMatch(/^عنك: رسوم/);
    expect(lines[1]).toMatch(/^عن الحسن: رسوم/);
  });
});

describe("historySections", () => {
  it("splits waiting, rejected, mine and for others; drops cancelled", () => {
    const s = historySections([
      item({ id: "1", status: "pending" }),
      item({ id: "2", status: "rejected", rejectReason: "الصورة غير واضحة" }),
      item({ id: "3", status: "confirmed" }),
      item({ id: "4", status: "confirmed", forMe: false }),
      item({ id: "5", status: "cancelled" }),
    ]);
    expect(s.waiting.map((x) => x.id)).toEqual(["1"]);
    expect(s.rejected.map((x) => x.id)).toEqual(["2"]);
    expect(s.mine.map((x) => x.id)).toEqual(["3"]);
    expect(s.forOthers.map((x) => x.id)).toEqual(["4"]);
  });
});

describe("pendingCounts (audit B09)", () => {
  it("proof sent for someone else counts as sent, never as mine", () => {
    const items = [
      item({ id: "a", status: "pending", allocations: [alloc("b1", "بلال", 9)] }),
      item({ id: "b", status: "pending", allocations: [alloc("me", "سيدي", 7)] }),
      item({ id: "c", status: "confirmed", allocations: [alloc("me", "سيدي", 6)] }),
      item({ id: "d", status: "pending", sentByMe: false, allocations: [alloc("me", "سيدي", 8)] }),
    ];
    expect(pendingCounts(items, "me")).toEqual({ sent: 2, mine: 1 });
    expect(pendingCounts(items.slice(0, 1), "me")).toEqual({ sent: 1, mine: 0 });
  });
  it("a late member who paid only for another keeps «ادفع الآن»", () => {
    const late = { status: "active" as const, monthsBehind: 3, amountOwed: 3000 };
    const { mine } = pendingCounts(
      [item({ status: "pending", allocations: [alloc("b1", "بلال", 9)] })],
      "me",
    );
    expect(youCard(late, "PPPPPPLLLUUU", 2026, mine).kind).toBe("late");
  });
});
