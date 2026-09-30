"use client";
// A payment's details in a sheet (no receipt: owner), with «إلغاء هذه الدفعة» for «مسؤول» only.
// Cancelling never deletes: the payment stays in the record with its reason, and its months
// leave the member's account.
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { useAct } from "./act";
import { dayDate, fmt, ROLE_LABEL } from "./derive";
import { METHOD_LABELS } from "@/lib/methods";
import { MONTHS_AR } from "@/lib/dates";
import { Num } from "./num";
import { Proof } from "./receipt";
import type { ReceiptView } from "./receipt-model";
import { useSnack } from "./shell";
import { useCanceller } from "./viewer";
import { radioKeys, radioTab } from "./radio-keys";

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

export function PaymentSheetBody({
  r: initial,
  paymentId,
  style,
  onCancelled,
}: {
  r: ReceiptView;
  /** the payment behind the receipt; without it there is nothing to cancel */
  paymentId?: string | null;
  style?: CSSProperties;
  onCancelled?: (reason: string) => void;
}) {
  const me = useCanceller();
  const [r, setR] = useState(initial);
  const [asking, setAsking] = useState(false);
  // cancelling is «مسؤول» only (plan §8); the server checks it too
  const canCancel =
    !!me && me.role === ROLE_LABEL.admin && !!paymentId && r.status.kind === "confirmed";
  if (asking && canCancel)
    return (
      <CancelForm
        r={r}
        paymentId={paymentId!}
        onBack={() => setAsking(false)}
        onDone={(reason) => {
          setR({
            ...r,
            status: {
              kind: "cancelled",
              reason,
              by: me!.by,
              role: me!.role,
              at: new Date().toISOString(),
            },
          });
          setAsking(false);
          onCancelled?.(reason);
        }}
      />
    );
  return (
    <div className="bq-rc-sheet" style={style}>
      <PaymentDetails r={r} />
      {canCancel && (
        <button
          type="button"
          className="bq-link bq-link-quiet bq-press bq-cancel-pay"
          onClick={() => setAsking(true)}
        >
          إلغاء هذه الدفعة
        </button>
      )}
    </div>
  );
}

function CancelForm({
  r,
  paymentId,
  onBack,
  onDone,
}: {
  r: ReceiptView;
  paymentId: string;
  onBack: () => void;
  onDone: (reason: string) => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const say = useSnack();
  const { cancelPayment } = useAct();
  const [pick, setPick] = useState("");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const reason = pick === "أخرى" ? other.trim() : pick;
  return (
    <div className="bq-rec bq-cancel">
      <h2>إلغاء هذه الدفعة</h2>
      <p className="bq-hint">
        {r.payer} · <Num>{fmt(r.amount)}</Num> أوقية
      </p>
      <p className="bq-lead">تبقى في السجل مع السبب، ولا تُحسب أشهرها للعضو بعد الآن.</p>
      <p className="bq-rej-l">لماذا تلغيها؟</p>
      <div className="bq-chips" role="radiogroup" onKeyDown={radioKeys} aria-label="سبب الإلغاء">
        {CANCEL_REASONS.map((x, i, all) => (
          <button
            key={x}
            type="button"
            role="radio"
            aria-checked={pick === x}
            tabIndex={radioTab(
              pick === x,
              i,
              all.some((y) => y === pick),
            )}
            className="bq-chip bq-press"
            onClick={() => setPick(x)}
          >
            {x}
          </button>
        ))}
      </div>
      {pick === "أخرى" && (
        <input
          className="bq-input"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="اكتب السبب باختصار"
          aria-label="سبب الإلغاء"
          autoFocus
        />
      )}
      {err && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
      <div className="bq-rec-foot">
        <button
          type="button"
          className="bq-btn bq-btn-danger bq-btn-lg bq-press"
          disabled={!reason || !online || busy}
          aria-busy={busy || undefined}
          onClick={async () => {
            setBusy(true);
            setErr("");
            const res = await cancelPayment({ id: paymentId, reason });
            setBusy(false);
            if (!res.ok) return setErr(res.message ?? "لم يتم الإلغاء. حاول مرة أخرى.");
            say("أُلغيت الدفعة");
            router.refresh();
            onDone(reason);
          }}
        >
          {busy ? "جارٍ الإلغاء…" : "ألغِ الدفعة"}
        </button>
        <button type="button" className="bq-btn bq-btn-ghost bq-press" onClick={onBack}>
          رجوع
        </button>
        <OfflineWriteHint />
      </div>
    </div>
  );
}
