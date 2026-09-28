// Receipt OCR entry point for the record-payment screen:
//   warmOcr() when the screen opens; readReceipt(photo, { expectedMro, accounts }) after the
//   member picks the screenshot; show every field with ✓ or «تحقق» from `checks`.
// Reading only speeds things up: the member confirms the values and the treasurer reviews.
import { mruToMro } from "@/lib/money";
import { allPassed, checkReceipt, mergePasses, type OcrAccount, type ReceiptChecks } from "./check";
import { recognizeText } from "./engine";
import { parseReceipt, type Wallet } from "./parse";
import { preprocessImage } from "./preprocess";

export { terminateOcr, warmOcr } from "./engine";
export type { OcrAccount, ReceiptChecks } from "./check";
export type { Wallet } from "./parse";

export type ReceiptReading = {
  method: Wallet | null;
  amountMro: number | null;
  amountMru: number | null;
  txnRef: string | null;
  /** "YYYY-MM-DD HH:MM:SS" as printed */
  date: string | null;
  recipientNumber: string | null;
  recipientName: string | null;
  /** the money went to one of the fund's active accounts */
  recipientOk: boolean;
  /** per field: true = read and plausible, false = ask the member to check/type it */
  checks: ReceiptChecks;
  /** share of checks passed, 0–1 */
  confidence: number;
  /** a second read on a cleaned-up image was needed */
  secondPass: boolean;
  /** OCR text (first pass, then second if any), for the treasurer's review */
  raw: string;
};

export async function readReceipt(
  image: Blob,
  opts: { expectedMro?: number; accounts: OcrAccount[]; now?: Date },
): Promise<ReceiptReading> {
  const first = await recognizeText(image);
  const p1 = parseReceipt(first.text);
  let result = { parsed: p1, checks: checkReceipt(p1, opts) };
  let raw = first.text;
  let secondPass = false;

  if (!allPassed(result.checks)) {
    try {
      const second = await recognizeText(await preprocessImage(image));
      const p2 = parseReceipt(second.text);
      result = mergePasses(result, { parsed: p2, checks: checkReceipt(p2, opts) });
      raw = `${first.text}\n---\n${second.text}`;
      secondPass = true;
    } catch {
      // keep the first reading; the member types what is missing
    }
  }

  const { parsed, checks } = result;
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    method: parsed.method,
    amountMru: parsed.amountMru,
    amountMro: parsed.amountMru !== null ? mruToMro(parsed.amountMru) : null,
    txnRef: parsed.txnRef,
    date: parsed.date,
    recipientNumber: parsed.recipientNumber,
    recipientName: parsed.recipientName,
    recipientOk: checks.recipient,
    checks,
    confidence: passed / Object.keys(checks).length,
    secondPass,
    raw,
  };
}
