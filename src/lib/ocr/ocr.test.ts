import { describe, expect, it } from "vitest";
import { allPassed, checkReceipt, mergePasses, nameMatches } from "./check";
import * as F from "./fixtures";
import { cleanText, parseReceipt } from "./parse";

const now = new Date("2026-09-29T12:00:00Z");
const opts = (expectedMro?: number) => ({ accounts: F.ACCOUNTS, expectedMro, now });

describe("parseReceipt", () => {
  it("reads a Bankily receipt", () => {
    expect(parseReceipt(F.BANKILY)).toEqual({
      method: "bankily",
      amountMru: 100,
      txnRef: "0926092814484388261",
      date: "2026-09-28 14:48:45",
      recipientNumber: "22000001",
      recipientName: null,
    });
  });

  it("handles Arabic-Indic digits and direction marks", () => {
    expect(cleanText("‏١٢٣٫٥")).toBe("123,5");
    expect(parseReceipt(F.BANKILY_ARABIC_DIGITS)).toMatchObject({
      method: "bankily",
      amountMru: 100,
      txnRef: "0926092814484388261",
    });
  });

  it("reads Sedad with 1.500,00 amounts and fixes TRO → TR0", () => {
    expect(parseReceipt(F.SEDAD)).toMatchObject({
      method: "sedad",
      amountMru: 1500,
      txnRef: "TR07258252750",
      date: "2026-09-11 17:54:42",
      recipientNumber: "22000003",
      recipientName: "Sidi Mohamed",
    });
  });

  it("reads Masrvi (9-digit reference, recipient name only)", () => {
    expect(parseReceipt(F.MASRVI)).toMatchObject({
      method: "masrvi",
      amountMru: 500,
      txnRef: "266837993",
      date: "2026-09-03 10:15:55",
      recipientName: expect.stringContaining("Rabitat Albaqie"),
    });
  });

  it("every screenshot amount is new ouguiya (MRU), read whole: 1200 MRU is 1200, never 120", () => {
    // owner's example: Bankily «المبلغ المرسل: 1200 MRU» → 1200 MRU = 12 000 old ouguiya
    expect(parseReceipt(F.BANKILY_1200).amountMru).toBe(1200);
    expect(checkReceipt(parseReceipt(F.BANKILY_1200), opts(12_000)).amount).toBe(true);
    expect(checkReceipt(parseReceipt(F.BANKILY_1200), opts(1_200)).amount).toBe(false);
    expect(parseReceipt(F.BANKILY_GROUPED).amountMru).toBe(12_500);
    expect(parseReceipt(F.SEDAD_PLAIN).amountMru).toBe(1200);
    expect(parseReceipt(F.MASRVI_PLAIN).amountMru).toBe(1200);
    expect(parseReceipt(F.BANKILY).amountMru).toBe(100);
  });

  it("returns nothing useful for a random picture", () => {
    expect(parseReceipt(F.NOT_A_RECEIPT)).toMatchObject({
      method: null,
      amountMru: null,
      txnRef: null,
    });
  });
});

describe("checkReceipt", () => {
  it("passes a good receipt paying the expected dues (MRU × 10 = MRO)", () => {
    expect(checkReceipt(parseReceipt(F.BANKILY), opts(1000))).toEqual({
      method: true,
      amount: true,
      txnRef: true,
      date: true,
      recipient: true,
    });
    expect(allPassed(checkReceipt(parseReceipt(F.SEDAD), opts(15000)))).toBe(true);
    expect(allPassed(checkReceipt(parseReceipt(F.MASRVI), opts(5000)))).toBe(true);
  });

  it("flags a wrong amount and a recipient that is not a fund account", () => {
    const c = checkReceipt(parseReceipt(F.BANKILY.replace("22000001", "36999999")), opts(2000));
    expect(c.amount).toBe(false);
    expect(c.recipient).toBe(false);
  });

  it("flags a Bankily id whose embedded time does not match the receipt time", () => {
    const r = parseReceipt(F.BANKILY.replace("14:48:45", "09:00:00"));
    expect(checkReceipt(r, opts()).txnRef).toBe(false);
  });

  it("flags dates in the future", () => {
    const r = parseReceipt(F.SEDAD.replace("11/09/2026", "11/12/2026"));
    expect(checkReceipt(r, opts()).date).toBe(false);
  });

  it("matches recipient names despite small OCR slips", () => {
    expect(nameMatches("Rabltat Albaqie", "Rabitat Albaqie")).toBe(true);
    expect(nameMatches("Someone Else", "Rabitat Albaqie")).toBe(false);
    expect(nameMatches(null, "Rabitat Albaqie")).toBe(false);
  });
});

describe("mergePasses", () => {
  it("fills failed fields from the second pass only", () => {
    const first = {
      parsed: parseReceipt(F.MASRVI_BAD_FIRST_PASS),
      checks: checkReceipt(parseReceipt(F.MASRVI_BAD_FIRST_PASS), opts(5000)),
    };
    expect(first.checks.amount).toBe(false);
    expect(first.checks.txnRef).toBe(false);
    const secondParsed = parseReceipt(F.MASRVI);
    const second = { parsed: secondParsed, checks: checkReceipt(secondParsed, opts(5000)) };
    const merged = mergePasses(first, second);
    expect(merged.parsed.amountMru).toBe(500);
    expect(merged.parsed.txnRef).toBe("266837993");
    expect(allPassed(merged.checks)).toBe(true);
  });
});
