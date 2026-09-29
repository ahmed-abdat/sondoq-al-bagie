// The money rules of «سجّل دفعة», pure: totals, the first thing still missing, and the payment
// sent to recordPayment. record.tsx keeps the state and the screen; the server re-validates.
import type { RecordPaymentInput } from "@/lib/data/schemas";
import type { PaymentMethod } from "@/lib/data/types";
import { parseAmount } from "@/lib/money";
import { fmt } from "./derive";

export type Step = "months" | "method" | "payer" | "amount" | "credit";
export type Block = { msg: string; step?: Step } | null;

export type DraftRow = { m: { memberId: string; groupCode: string }; months: number[] };
export type Draft = {
  rows: DraftRow[];
  /** monthly fee per group code */
  prices: Record<string, number>;
  method: PaymentMethod | null;
  payerName: string;
  /** «المبلغ المحوّل» as typed ("" = not given) */
  sentText: string;
  /** who keeps the rest of a bigger transfer (checked against the rows) */
  creditFor: string | null;
  campaignId: string | null;
  /** the contribution as typed */
  campaignText: string;
  year: number;
};

export function summarize(d: Draft) {
  const priceOf = (m: DraftRow["m"]) => d.prices[m.groupCode] ?? 0;
  const { rows } = d;
  const feeTotal = rows.reduce((s, r) => s + r.months.length * priceOf(r.m), 0);
  const campAmt = d.campaignId ? Math.max(0, Math.round(parseAmount(d.campaignText) ?? 0)) : 0;
  const total = feeTotal + campAmt;
  const sent = d.sentText.trim() ? Math.round(parseAmount(d.sentText) ?? 0) : null;
  const diff = sent === null ? 0 : sent - total;
  const missingPrice = rows.some((r) => r.months.length > 0 && !priceOf(r.m));
  // one member: the rest of a bigger transfer is kept for them unless someone else is chosen
  const creditTo =
    d.creditFor && rows.some((r) => r.m.memberId === d.creditFor)
      ? d.creditFor
      : rows.length === 1
        ? rows[0].m.memberId
        : null;
  const credit = diff > 0 && creditTo ? diff : 0;

  const block: Block = !rows.length
    ? { msg: "اختر العضو أولًا." }
    : total <= 0
      ? { msg: "اختر شهرًا واحدًا على الأقل أو أضف مساهمة.", step: "months" }
      : missingPrice
        ? { msg: "لا نعرف الرسوم الشهرية لفئة هذا العضو. راجع المسؤول." }
        : !d.method
          ? { msg: "بقي أن تختار كيف دفع.", step: "method" }
          : !d.payerName
            ? { msg: "اكتب اسم الدافع.", step: "payer" }
            : diff < 0
              ? {
                  msg: `المبلغ المحوّل أقل من المجموع بـ ${fmt(-diff)} أوقية.`,
                  step: "amount",
                }
              : diff > 0 && !creditTo
                ? {
                    msg: `المبلغ المحوّل أكبر من المجموع بـ ${fmt(diff)} أوقية. اختر لمن يُحفظ الباقي.`,
                    step: "credit",
                  }
                : null;

  // short transfer, one member: offer to record only the months the money covers
  const fitMonths = (() => {
    if (diff >= 0 || sent === null || rows.length !== 1) return null;
    const p = priceOf(rows[0].m);
    const n = p ? Math.floor((sent - campAmt) / p) : 0;
    return n >= 1 && n < rows[0].months.length ? n : null;
  })();

  return { feeTotal, campAmt, total, sent, diff, missingPrice, creditTo, credit, block, fitMonths };
}

/** The recordPayment input for a draft with nothing blocking (method set). */
export function toRecordInput(
  d: Draft & { method: PaymentMethod },
  extra: { id: string; paidOn: string; txnRef?: string; proofPath?: string; proofHash?: string },
): RecordPaymentInput {
  const { total, campAmt, credit, creditTo } = summarize(d);
  const priceOf = (m: DraftRow["m"]) => d.prices[m.groupCode] ?? 0;
  return {
    id: extra.id,
    payerName: d.payerName,
    method: d.method,
    amount: total + credit,
    paidOn: extra.paidOn,
    allocations: [
      ...d.rows.flatMap((row) =>
        row.months.map((month) => ({
          kind: "months" as const,
          memberId: row.m.memberId,
          year: d.year,
          month,
          amount: priceOf(row.m),
        })),
      ),
      ...(d.campaignId && campAmt > 0
        ? [
            {
              kind: "campaign" as const,
              campaignId: d.campaignId,
              memberId: d.rows[0].m.memberId,
              amount: campAmt,
            },
          ]
        : []),
      ...(credit && creditTo
        ? [{ kind: "credit" as const, memberId: creditTo, amount: credit }]
        : []),
    ],
    txnRef: extra.txnRef,
    proofPath: extra.proofPath,
    proofHash: extra.proofHash,
  };
}
