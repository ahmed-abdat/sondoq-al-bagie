import { describe, expect, it, vi } from "vitest";
import { monthName } from "./dates";
import { THIN } from "./format";

// Month spelling comes from dates.ts (owner may change it), so tests build names with monthName().
const M = monthName;
import {
  coverLine,
  drawReceipt,
  monthsInWords,
  receiptFileName,
  receiptShareText,
  shareReceipt,
  verifyUrl,
  type ShareableReceipt,
} from "./share-receipt";

const R: ShareableReceipt = {
  no: "0231",
  payer: "محمد ولد أحمد",
  covers: [{ name: "محمد ولد أحمد", year: 2026, months: [7, 8, 9] }],
  amountMro: 3000,
  methodLabel: "بنكيلي",
  txnRef: "1234567890123456789",
  code: "BQ-7K2M-0231",
  status: { kind: "confirmed", by: "سيدي محمد", role: "أمين الصندوق" },
};

describe("monthsInWords", () => {
  it("groups consecutive months into ranges", () => {
    expect(monthsInWords([9, 7, 8], 2026)).toBe(`من ${M(7)} إلى ${M(9)} 2026`);
    expect(monthsInWords([1, 3, 4], 2026)).toBe(`${M(1)}، من ${M(3)} إلى ${M(4)} 2026`);
    expect(monthsInWords([5], 2026)).toBe(`${M(5)} 2026`);
  });
  it("says full year for 12 months", () => {
    expect(
      monthsInWords(
        [...Array(12)].map((_, i) => i + 1),
        2026,
      ),
    ).toBe("السنة كاملة 2026");
  });
});

describe("coverLine", () => {
  it("names the member only when needed", () => {
    expect(coverLine(R.covers[0], R.payer, false)).toBe(`عن: رسوم من ${M(7)} إلى ${M(9)} 2026`);
    expect(coverLine({ name: "علي", year: 2026, months: [1] }, R.payer, false)).toBe(
      `عن: علي، رسوم ${M(1)} 2026`,
    );
  });
});

it("verifyUrl and file name", () => {
  expect(verifyUrl("BQ-7K2M-0231", "https://x.app/")).toBe("https://x.app/r/BQ-7K2M-0231");
  expect(receiptFileName("02/31")).toBe("وصل-0231.png");
});

describe("receiptShareText", () => {
  it("contains the amount in both currencies, months, code and link", () => {
    const t = receiptShareText(R, "https://x.app/r/BQ-7K2M-0231");
    expect(t).toContain("رقم الوصل: \u20660231\u2069");
    expect(t).toContain("رمز التحقق: \u2066BQ-7K2M-0231\u2069");
    expect(t).toContain("\u20661234567890123456789\u2069");
    expect(t).toContain(`المبلغ: 3${THIN}000 أوقية (300 أوقية جديدة)`);
    expect(t).toContain(`عن: رسوم من ${M(7)} إلى ${M(9)} 2026`);
    expect(t).toContain("أكّدها: سيدي محمد، أمين الصندوق");
    expect(t).toContain("https://x.app/r/BQ-7K2M-0231");
  });
  it("marks cancelled receipts", () => {
    expect(receiptShareText({ ...R, status: { kind: "cancelled" } }, "u")).toContain("وصل ملغى");
  });
});

describe("drawReceipt", () => {
  it("draws the key fields and a QR", () => {
    const texts: string[] = [];
    let rects = 0;
    const ctx = {
      fillStyle: "",
      font: "",
      textAlign: "right",
      direction: "rtl",
      fillRect: () => void rects++,
      fillText: (t: string) => void texts.push(t),
      measureText: (t: string) => ({ width: t.length * 20 }),
      beginPath() {},
      arc() {},
      fill() {},
      clip() {},
      save() {},
      restore() {},
      drawImage() {},
    } as unknown as Parameters<typeof drawReceipt>[0];
    drawReceipt(ctx, R, {
      url: "https://x.app/r/BQ-7K2M-0231",
      fonts: { display: "a", body: "b" },
    });
    expect(texts).toEqual(
      expect.arrayContaining([
        "وصل استلام",
        "№ 0231",
        R.payer,
        `3${THIN}000`,
        "BQ-7K2M-0231",
        "✓ تم الاستلام",
      ]),
    );
    expect(rects).toBeGreaterThan(200); // QR modules
  });
});

describe("shareReceipt", () => {
  it("falls back to a wa.me text link when files cannot be shared", async () => {
    const open = vi.fn();
    const res = await shareReceipt(R, {
      origin: "https://x.app",
      nav: {} as never,
      open,
      phone: "36123456",
    });
    expect(res).toBe("whatsapp");
    expect(open.mock.calls[0][0]).toMatch(/^https:\/\/wa\.me\/22236123456\?text=/);
    expect(decodeURIComponent(open.mock.calls[0][0])).toContain("BQ-7K2M-0231");
  });
});
