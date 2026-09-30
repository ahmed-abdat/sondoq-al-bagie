"use client";
// Committee «الدفعات الأخيرة»: confirmed payments, newest first, so a wrong one can be found and
// cancelled from its receipt. Cancelled ones stay, dimmed, with «ملغى».
import { useState } from "react";
import type { PendingPayment } from "@/lib/data/types";
import { MethodBadge, MemberNo } from "../bits";
import { ReceiptSheetBody } from "../cancel-payment";
import { dayWords, fmt, memberCount, monthCount } from "../derive";
import { I } from "../icons";
import { Num } from "../num";
import { fromPending } from "../receipt-model";
import { Sheet } from "../sheet";
import { SubHead } from "./committee";

export function RecentPaymentsPage({
  payments,
  campaignTitles,
}: {
  payments: PendingPayment[];
  /** campaign id → title for contributions */
  campaignTitles?: Record<string, string>;
}) {
  const [gone, setGone] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<PendingPayment | null>(null);
  const list = payments
    .filter((p) => p.status === "confirmed" || p.status === "cancelled")
    .map((p) =>
      gone[p.id] ? { ...p, status: "cancelled" as const, cancelReason: gone[p.id] } : p,
    );
  return (
    <>
      <SubHead
        title="الدفعات الأخيرة"
        lead="افتح الدفعة لترى تفاصيلها ومن سجّلها."
      />
      <section className="bq-sec bq-sec-first">
        {list.length ? (
          <ul className="bq-list">
            {list.map((p) => (
              <PaymentRow key={p.id} p={p} onOpen={() => setOpen(p)} />
            ))}
          </ul>
        ) : (
          <p className="bq-hint">لا توجد دفعات مؤكدة بعد.</p>
        )}
      </section>
      {open && (
        <Sheet key={open.id} label="وصل استلام" onDone={() => setOpen(null)}>
          <ReceiptSheetBody
            r={fromPending(open, { campaignTitles })}
            paymentId={open.id}
            onCancelled={(reason) => setGone((g) => ({ ...g, [open.id]: reason }))}
          />
        </Sheet>
      )}
    </>
  );
}

function PaymentRow({ p, onOpen }: { p: PendingPayment; onOpen: () => void }) {
  const cancelled = p.status === "cancelled";
  const months = p.allocations.filter((a) => a.kind === "months");
  const first = months[0];
  const people = new Set(months.map((a) => a.memberId)).size;
  return (
    <li>
      <button
        type="button"
        className={`bq-row bq-press ${cancelled ? "is-off" : ""}`}
        onClick={onOpen}
        aria-label={`${p.payerName}، ${fmt(p.amount)} أوقية${cancelled ? "، ملغى" : ""}. افتح الوصل`}
      >
        <span className={`bq-disc ${cancelled ? "" : "is-in"}`}>
          {cancelled ? I.ban(22) : I.coins(22)}
        </span>
        <span className="bq-row-m">
          <span className="bq-row-t">{p.payerName}</span>
          <span className="bq-row-s bq-row-sm">
            <MethodBadge method={p.method} size={20} label={false} />
            <span>
              {first ? (
                <>
                  {people === 1 ? (
                    <MemberNo m={{ memberRef: `${first.listCode}-${first.number}` }} />
                  ) : (
                    memberCount(people)
                  )}{" "}
                  ·{" "}
                  {people === 1 && months.length >= 12
                    ? "رسوم السنة كاملة"
                    : `رسوم ${monthCount(months.length, "obl")}`}
                </>
              ) : (
                "مساهمة في حملة"
              )}{" "}
              · {dayWords(p.paidOn)}
            </span>
          </span>
          {cancelled && p.cancelReason && (
            <span className="bq-row-s">أُلغيت: {p.cancelReason}</span>
          )}
        </span>
        <span className="bq-row-e">
          <Num className={`bq-amt ${cancelled ? "" : "a-in"}`}>{`+${fmt(p.amount)}`}</Num>
          {cancelled ? (
            <span className="bq-kind is-rej">ملغى</span>
          ) : (
            p.receiptNo && <Num className="bq-row-s">{p.receiptNo}</Num>
          )}
        </span>
      </button>
    </li>
  );
}
