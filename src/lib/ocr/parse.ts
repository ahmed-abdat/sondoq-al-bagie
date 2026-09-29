// Receipt text → fields. Label-anchored per wallet, ported from docs/research/receipt-ocr/bench/
// parse2.js (164/168 fields on the benchmark). Pure; unit tested. Amounts on receipts are MRU.
import { parseAmount, toWesternDigits } from "@/lib/money";

export type Wallet = "bankily" | "sedad" | "masrvi";

export type ParsedReceipt = {
  method: Wallet | null;
  amountMru: number | null;
  txnRef: string | null;
  /** "YYYY-MM-DD HH:MM:SS" as printed (local time) */
  date: string | null;
  /** recipient phone number when the receipt shows one (Bankily, Sedad) */
  recipientNumber: string | null;
  /** recipient name in Latin letters when shown (Sedad, Masrvi) */
  recipientName: string | null;
};

const BIDI = /[‎‏‪-‮⁦-⁩]/g;
/** Strip direction marks, Arabic/Persian digits → Western, Arabic separators → ASCII. */
export function cleanText(raw: string): string {
  return toWesternDigits(raw.replace(BIDI, "")).replace(/٫/g, ",").replace(/٬/g, ".");
}

const N = String.raw`(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)`;

function detectWallet(t: string): Wallet | null {
  if (/SEDAD|السداد|رقم المعاملة/i.test(t)) return "sedad";
  if (/Masr|المرجع|MRU\s*\d+[.,]\d\d\s*\(/i.test(t)) return "masrvi";
  if (/معرف المعاملة|المستفيد|النقل ناجح|Bankily|بنكيلي/i.test(t)) return "bankily";
  return null;
}

const first = (s: string, ...res: RegExp[]) => {
  for (const re of res) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
};

function parseDate(flat: string): string | null {
  let d = flat.match(/(\d{2})-(\d{2})-(\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  if (d) return `20${d[1]}-${d[2]}-${d[3]} ${d[4]}`;
  d = flat.match(/(\d{2}:\d{2}:\d{2})\s+(\d{2})-(\d{2})-(\d{2})\b(?!\d)/);
  if (d) return `20${d[2]}-${d[3]}-${d[4]} ${d[1]}`;
  d = flat.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (d) {
    const time = flat.match(/\d{2}:\d{2}:\d{2}/)?.[0] ?? "00:00:00";
    return `${d[3]}-${d[2]}-${d[1]} ${time}`;
  }
  return null;
}

const NOT_NAMES = /^(MRU|OK|Masr\w*|Vous|LTE|Terminer|SEDAD|TR\w*)$/;

export function parseReceipt(raw: string): ParsedReceipt {
  const t = cleanText(raw);
  const flat = t.replace(/\n/g, " ");
  const method = detectWallet(t);
  let amount: string | null = null;
  let txnRef: string | null = null;
  let recipientNumber: string | null = null;
  let recipientName: string | null = null;

  if (method === "bankily") {
    amount = first(
      flat,
      new RegExp(String.raw`المرسل\s*:?\s*` + N),
      new RegExp(N + String.raw`\s*MRU`),
    );
    txnRef = first(flat, /المعاملة\s*:?\s*(\d{15,22})/, /\b(\d{17,21})\b/);
    recipientNumber = first(flat, /المستفيد\s*:?\s*([234]\d{7})\b/, /\b([234]\d{7})\b/);
  } else if (method === "sedad") {
    amount = first(
      flat,
      new RegExp(N + String.raw`\s*أوقية`),
      new RegExp(String.raw`بإرسال\s*` + N),
    );
    const ref = first(flat, /\b(T[RB][O0-9]{9,13})\b/, /رقم المعاملة\s*([A-Z]{2}[O0-9]{6,})/);
    txnRef = ref && ref.slice(0, 2) + ref.slice(2).replace(/O/g, "0");
    recipientNumber = first(flat, /\b([234]\d{7})\b/);
    recipientName =
      first(
        flat,
        /إلى\s*([A-Za-z'’ .]{3,})/,
        /([A-Z][A-Za-z'’]+ [A-Z][A-Za-z'’]+)\s*إلى/,
      )?.trim() ?? null;
  } else if (method === "masrvi") {
    // earliest amount next to "MRU", whichever side OCR put the label on (the first is the sent amount)
    const hits = [
      ...flat.matchAll(new RegExp(String.raw`MRU\)?\s*` + N, "g")),
      ...flat.matchAll(new RegExp(N + String.raw`\s*\(?MRU`, "g")),
    ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    amount = hits[0]?.[1] ?? null;
    txnRef = first(flat, /المرجع\s*(\d{8,10})/, /(\d{8,10})\s*المرجع/, /\b(\d{9})\b/);
    const words = (flat.match(/[A-Z][A-Za-z'’]+(?:\s+[A-Za-z'’]+)*/g) ?? []).filter(
      (w) => !NOT_NAMES.test(w),
    );
    recipientName = words.join(" ") || null;
  }

  const amountMru = amount ? parseAmount(amount) : null;
  return {
    method,
    amountMru: amountMru !== null && amountMru > 0 ? amountMru : null,
    txnRef,
    date: parseDate(flat),
    recipientNumber,
    recipientName,
  };
}
