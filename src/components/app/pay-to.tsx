"use client";
import type { FundAccount } from "@/lib/data/types";
import { METHOD_LABELS } from "@/lib/methods";
import { MethodBadge } from "./bits";
import { I } from "./icons";
import { useSnack } from "./shell";

/** The fund's wallet numbers with a copy button each («كيف أدفع الرسوم؟», «كيف أساهم؟»). */
export function PayTo({ accounts }: { accounts: FundAccount[] }) {
  const say = useSnack();
  const live = accounts.filter((a) => a.active);
  if (!live.length) return <p className="bq-hint">لم تُضف اللجنة أرقامًا بعد.</p>;
  return (
    <ul className="bq-pay">
      {live.map((a) => (
        <li key={a.id}>
          <MethodBadge method={a.method} size={32} label={false} />
          <span className="bq-row-m">
            <bdi dir="ltr" className="bq-num bq-pay-n">
              {a.accountNumber}
            </bdi>
            <span className="bq-row-s">
              {METHOD_LABELS[a.method]} · باسم {a.holderName}
            </span>
          </span>
          <button
            type="button"
            className="bq-copy bq-press"
            onClick={() => {
              navigator.clipboard?.writeText(a.accountNumber).catch(() => {});
              say(`نُسخ رقم ${METHOD_LABELS[a.method]}`);
            }}
            aria-label={`نسخ رقم ${METHOD_LABELS[a.method]}`}
          >
            {I.copy(18)} نسخ
          </button>
        </li>
      ))}
    </ul>
  );
}
