// What a receipt («وصل استلام») prints, built from the data layer's PendingPayment (committee).
// Pure: no React.
import type { PaymentMethod, PendingPayment } from "@/lib/data/types";

export type ReceiptActor = { by: string; role: string; at: string };
export type ReceiptStatus =
  | { kind: "pending" }
  | ({ kind: "confirmed" } & ReceiptActor)
  | ({ kind: "rejected"; reason: string } & ReceiptActor)
  | ({ kind: "cancelled"; reason: string } & ReceiptActor);

export type ReceiptCover = {
  name: string;
  /** memberRef «A-12» (internal key), shown as «أ 12» */
  ref?: string | null;
  year: number;
  months: number[];
};

export type ReceiptView = {
  /** printed number, e.g. 2026-0042; null while pending */
  no: string | null;
  /** verification code for /r/[code]; null while pending */
  code: string | null;
  payer: string;
  covers: ReceiptCover[];
  campaigns: string[];
  amount: number;
  method: PaymentMethod;
  /** full ref (committee) — public receipts get only `txnLast4` */
  txn: string | null;
  txnLast4: string | null;
  paidOn: string;
  recordedBy: string | null;
  recordedAt: string | null;
  proofPath: string | null;
  status: ReceiptStatus;
};

/** Group month allocations by member and year: one cover line per member per year. */
type CoverMember = {
  fullName: string;
  listCode?: string;
  number?: number;
  months: { year: number; month: number }[];
};
function coversOf(members: CoverMember[]) {
  const out: ReceiptCover[] = [];
  for (const m of members) {
    const byYear = new Map<number, number[]>();
    for (const x of m.months) byYear.set(x.year, [...(byYear.get(x.year) ?? []), x.month]);
    for (const [year, months] of [...byYear].sort((a, b) => a[0] - b[0]))
      out.push({
        name: m.fullName,
        ref: m.listCode && m.number ? `${m.listCode}-${m.number}` : null,
        year,
        months: months.sort((a, b) => a - b),
      });
  }
  return out;
}

/** Committee payment → receipt. `confirmer` fills in who decided when the row lacks it. */
export function fromPending(
  p: PendingPayment,
  opts: { campaignTitles?: Record<string, string>; deciderRole?: string } = {},
): ReceiptView {
  const members = new Map<string, CoverMember>();
  const campaigns: string[] = [];
  for (const a of p.allocations) {
    if (a.kind === "months") {
      const m = members.get(a.memberId) ?? {
        fullName: a.fullName,
        listCode: a.listCode,
        number: a.number,
        months: [],
      };
      m.months.push({ year: a.year, month: a.month });
      members.set(a.memberId, m);
    } else if (a.kind === "campaign") {
      campaigns.push(opts.campaignTitles?.[a.campaignId] ?? "حملة تبرعات");
    }
  }
  const actor = {
    by: p.decidedByName ?? "",
    role: opts.deciderRole ?? "",
    at: p.decidedAt ?? p.createdAt,
  };
  const status: ReceiptStatus =
    p.status === "confirmed"
      ? { kind: "confirmed", ...actor }
      : p.status === "rejected"
        ? { kind: "rejected", reason: p.rejectReason ?? "", ...actor }
        : p.status === "cancelled"
          ? { kind: "cancelled", reason: p.cancelReason ?? "", ...actor }
          : { kind: "pending" };
  const txn = p.txnRef;
  return {
    no: p.receiptNo,
    code: p.receiptCode,
    payer: p.payerName,
    covers: coversOf([...members.values()]),
    campaigns: [...new Set(campaigns)],
    amount: p.amount,
    method: p.method,
    txn,
    txnLast4: txn ? txn.replace(/\s+/g, "").slice(-4) : null,
    paidOn: p.paidOn,
    recordedBy: p.createdByName,
    recordedAt: p.createdAt,
    proofPath: p.proofPath,
    status,
  };
}
