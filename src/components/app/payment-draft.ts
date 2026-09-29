// The money rules of «سجّل دفعة», pure: totals, the first thing still missing, and the payment
// sent to recordPayment. record.tsx keeps the state and the screen; the server re-validates.
import type { RecordPaymentInput } from "@/lib/data/schemas";
import type { PaymentMethod } from "@/lib/data/types";
import { monthStates } from "@/lib/data/month-code";
import { parseAmount } from "@/lib/money";
import { fmt } from "./derive";

export type Step = "months" | "method" | "payer" | "amount" | "credit";
export type Block = { msg: string; step?: Step } | null;

export type DraftRow = {
  m: {
    memberId: string;
    groupCode: string;
    /** "YYYY-MM" → price when not the current-group price of this year (null = none set) */
    prices?: Record<string, number | null>;
  };
  /** chosen months of this year (1–12) */
  months: number[];
  /** chosen late months of earlier years, "YYYY-MM" */
  past?: string[];
};
export type Draft = {
  rows: DraftRow[];
  /** this year's monthly fee per group code */
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

/**
 * The months a payment can cover (from the 12-letter code): late or upcoming. Paid months and
 * «غير مستحق» ones (before joining, exempt, left) are out; the server refuses them anyway.
 * `late` = the open ones already due.
 */
export function payableMonths(code: string, dueMonth: number) {
  const open = monthStates(code).flatMap((st, i) =>
    st === "late" || st === "upcoming" ? [i + 1] : [],
  );
  return { open, late: open.filter((k) => k <= dueMonth) };
}

export const ymKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/**
 * Every chosen month of a row, oldest first (earlier years, then this year), with the price the
 * server expects: the month's own price when the row carries one, else this year's group price.
 * null = no price set for that year.
 */
export function rowMonths(d: Pick<Draft, "prices" | "year">, r: DraftRow) {
  const list = [
    ...(r.past ?? []).map((k) => ({ year: Number(k.slice(0, 4)), month: Number(k.slice(5, 7)) })),
    ...r.months.map((month) => ({ year: d.year, month })),
  ];
  return list.map((x) => {
    const k = ymKey(x.year, x.month);
    const own = r.m.prices && k in r.m.prices ? r.m.prices[k] : undefined;
    const price = own !== undefined ? own : d.prices[r.m.groupCode] || null;
    return { ...x, price };
  });
}

/** Months chosen in a row, all years. */
export const rowCount = (r: DraftRow) => r.months.length + (r.past?.length ?? 0);

/** Keep only the first n chosen months (oldest first). */
export function fitRow<R extends DraftRow>(r: R, n: number): R {
  const past = r.past ?? [];
  return { ...r, past: past.slice(0, n), months: r.months.slice(0, Math.max(0, n - past.length)) };
}

export function summarize(d: Draft) {
  const { rows } = d;
  const all = rows.flatMap((r) => rowMonths(d, r));
  const feeTotal = all.reduce((s, x) => s + (x.price ?? 0), 0);
  const campAmt = d.campaignId ? Math.max(0, Math.round(parseAmount(d.campaignText) ?? 0)) : 0;
  const total = feeTotal + campAmt;
  const sent = d.sentText.trim() ? Math.round(parseAmount(d.sentText) ?? 0) : null;
  const diff = sent === null ? 0 : sent - total;
  const unpriced = all.find((x) => x.price === null);
  const missingPrice = !!unpriced;
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
    : unpriced
      ? { msg: `حدد الرسوم الشهرية لسنة ${unpriced.year} أولًا.` }
      : total <= 0
        ? { msg: "اختر شهرًا واحدًا على الأقل أو أضف مساهمة.", step: "months" }
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
    const ms = rowMonths(d, rows[0]);
    let left = sent - campAmt;
    let n = 0;
    for (const x of ms) {
      if (!x.price || x.price > left) break;
      left -= x.price;
      n++;
    }
    return n >= 1 && n < ms.length ? n : null;
  })();

  return { feeTotal, campAmt, total, sent, diff, missingPrice, creditTo, credit, block, fitMonths };
}

/** The recordPayment input for a draft with nothing blocking (method set). */
export function toRecordInput(
  d: Draft & { method: PaymentMethod },
  extra: { id: string; paidOn: string; txnRef?: string; proofPath?: string; proofHash?: string },
): RecordPaymentInput {
  const { total, campAmt, credit, creditTo } = summarize(d);
  return {
    id: extra.id,
    payerName: d.payerName,
    method: d.method,
    amount: total + credit,
    paidOn: extra.paidOn,
    allocations: [
      ...d.rows.flatMap((row) =>
        rowMonths(d, row).map((x) => ({
          kind: "months" as const,
          memberId: row.m.memberId,
          year: x.year,
          month: x.month,
          amount: x.price ?? 0,
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
