// Field checks the app can run without knowing the truth (docs/research/receipt-ocr/bench/validate.js).
// A failed check → second pass on a preprocessed image, then «تحقق» on the confirmation screen.
import { mruToMro } from "@/lib/money";
import type { ParsedReceipt, Wallet } from "./parse";

export type OcrAccount = { method: string; accountNumber: string; holderName: string };

export type ReceiptChecks = {
  method: boolean;
  amount: boolean;
  txnRef: boolean;
  date: boolean;
  recipient: boolean;
};

const REF_FORMAT: Record<Wallet, RegExp> = {
  bankily: /^\d{19}$/,
  sedad: /^TR\d{11}$/,
  masrvi: /^\d{9}$/,
};

function validDate(s: string | null, now: Date): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s ?? "");
  if (!m) return false;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
  const yearAgo = now.getTime() - 400 * 86_400_000;
  return (
    !Number.isNaN(d.getTime()) &&
    d.getTime() <= now.getTime() + 86_400_000 &&
    d.getTime() >= yearAgo
  );
}

/** Bankily ids seem to carry yymmddhhmmss at positions 3–14 (seen on one receipt): ±10 min of the date. */
function bankilyRefMatchesDate(ref: string, date: string | null): boolean {
  if (!date) return true;
  const toMs = (d: string) =>
    Date.parse(
      `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}T${d.slice(6, 8)}:${d.slice(8, 10)}:${d.slice(10, 12)}Z`,
    );
  const fromRef = toMs(ref.slice(2, 14));
  const fromDate = toMs(date.replace(/\D/g, "").slice(2));
  if (Number.isNaN(fromRef) || Number.isNaN(fromDate)) return true;
  return Math.abs(fromRef - fromDate) < 10 * 60_000;
}

const latinTokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

/** ≥70 % of the account holder's name tokens appear (allowing small OCR slips) in the read name. */
export function nameMatches(read: string | null, holder: string): boolean {
  const got = latinTokens(read ?? "");
  const want = latinTokens(holder);
  if (!got.length || !want.length) return false;
  const hits = want.filter((w) =>
    got.some((g) => lev(w, g) <= Math.max(1, Math.floor(w.length / 4))),
  ).length;
  return hits / want.length >= 0.7;
}

const digits = (s: string) => s.replace(/\D/g, "").slice(-8);

export function checkReceipt(
  r: ParsedReceipt,
  opts: { expectedMro?: number; accounts: OcrAccount[]; now?: Date },
): ReceiptChecks {
  const now = opts.now ?? new Date();
  const amountMro = r.amountMru !== null ? mruToMro(r.amountMru) : null;
  const method = r.method !== null;
  const txnRef =
    !!r.method &&
    REF_FORMAT[r.method].test(r.txnRef ?? "") &&
    (r.method !== "bankily" || bankilyRefMatchesDate(r.txnRef ?? "", r.date));
  const accounts = opts.accounts.filter((a) => !r.method || a.method === r.method);
  const recipient =
    (!!r.recipientNumber &&
      accounts.some((a) => digits(a.accountNumber) === digits(r.recipientNumber ?? ""))) ||
    (!!r.recipientName && accounts.some((a) => nameMatches(r.recipientName, a.holderName)));
  return {
    method,
    amount:
      amountMro !== null &&
      amountMro > 0 &&
      amountMro <= 1_000_000 &&
      (opts.expectedMro === undefined || amountMro === opts.expectedMro),
    txnRef,
    date: validDate(r.date, now),
    recipient,
  };
}

/** Take each failed field from the second pass when it passes there. */
export function mergePasses(
  a: { parsed: ParsedReceipt; checks: ReceiptChecks },
  b: { parsed: ParsedReceipt; checks: ReceiptChecks },
): { parsed: ParsedReceipt; checks: ReceiptChecks } {
  const parsed = { ...a.parsed };
  const checks = { ...a.checks };
  const fields: Record<keyof ReceiptChecks, (keyof ParsedReceipt)[]> = {
    method: ["method"],
    amount: ["amountMru"],
    txnRef: ["txnRef"],
    date: ["date"],
    recipient: ["recipientNumber", "recipientName"],
  };
  for (const check of Object.keys(fields) as (keyof ReceiptChecks)[]) {
    if (checks[check] || !b.checks[check]) continue;
    checks[check] = true;
    for (const f of fields[check]) Object.assign(parsed, { [f]: b.parsed[f] });
  }
  return { parsed, checks };
}

export const allPassed = (c: ReceiptChecks) => Object.values(c).every(Boolean);
