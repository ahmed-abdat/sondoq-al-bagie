"use client";
// A payment's details (no receipt: owner) and the cancel reasons shared by every cancel sheet.
import { dayDate, fmt } from "./derive";
import { METHOD_LABELS } from "@/lib/methods";
import { MONTHS_AR } from "@/lib/dates";
import { Num } from "./num";
import { Proof } from "./receipt";
import type { ReceiptView } from "./receipt-model";

export const CANCEL_REASONS = ["تسجيل خاطئ", "مبلغ خاطئ", "دفعة مكررة", "تجربة", "أخرى"];

const monthsText = (ms: number[]) => ms.map((m) => MONTHS_AR[m - 1]).join("، ");

/** What the payment was, who recorded it, and the transfer picture: plain lines, no receipt. */
export function PaymentDetails({ r }: { r: ReceiptView }) {
  const st = r.status;
  return (
    <div className="bq-pay-details">
      <h2>{r.payer}</h2>
      <p className="bq-lead">
        <Num>{fmt(r.amount)}</Num> أوقية · {METHOD_LABELS[r.method]} · {dayDate(r.paidOn)}
      </p>
      <dl className="bq-facts">
        {r.covers.map((c, i) => (
          <div key={i}>
            <dt>{c.name}</dt>
            <dd>
              مستحقات {monthsText(c.months)} <Num>{c.year}</Num>
            </dd>
          </div>
        ))}
        {r.campaigns.map((c) => (
          <div key={c}>
            <dt>مساهمة</dt>
            <dd>{c}</dd>
          </div>
        ))}
        {r.txn && (
          <div>
            <dt>رقم العملية</dt>
            <dd>
              <bdi dir="ltr">{r.txn}</bdi>
            </dd>
          </div>
        )}
        {r.recordedBy && (
          <div>
            <dt>سجّلها</dt>
            <dd>{r.recordedBy}</dd>
          </div>
        )}
      </dl>
      {(st.kind === "cancelled" || st.kind === "rejected") && (
        <p className="bq-alert">
          أُلغيت{st.by ? ` (${st.by})` : ""}. السبب: {st.reason}
        </p>
      )}
      {r.proofPath && <Proof path={r.proofPath} amount={r.amount} method={r.method} />}
    </div>
  );
}
