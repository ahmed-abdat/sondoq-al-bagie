"use client";
// A receipt in a sheet, with the committee-only «إلغاء هذه الدفعة» under it (admin, treasurer,
// deputy). Cancelling never deletes: the payment stays in the record with its reason, and its
// months leave the member's account.
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { useAct } from "./act";
import { fmt } from "./derive";
import { ShareBtns } from "./entries";
import { Num } from "./num";
import { Receipt } from "./receipt";
import type { ReceiptView } from "./receipt-model";
import { useSnack } from "./shell";
import { useCanceller } from "./viewer";

export const CANCEL_REASONS = ["تسجيل خاطئ", "مبلغ خاطئ", "دفعة مكررة", "تجربة", "أخرى"];

export function ReceiptSheetBody({
  r: initial,
  paymentId,
  audience = "public",
  style,
  onCancelled,
}: {
  r: ReceiptView;
  /** the payment behind the receipt; without it there is nothing to cancel */
  paymentId?: string | null;
  audience?: "public" | "committee";
  style?: CSSProperties;
  onCancelled?: (reason: string) => void;
}) {
  const me = useCanceller();
  const [r, setR] = useState(initial);
  const [asking, setAsking] = useState(false);
  const canCancel = !!me && !!paymentId && r.status.kind === "confirmed";
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
      <Receipt r={r} audience={audience} />
      {r.status.kind === "confirmed" && <ShareBtns r={r} />}
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
        {r.no && (
          <>
            وصل <Num>{r.no}</Num> ·{" "}
          </>
        )}
        {r.payer} · <Num>{fmt(r.amount)}</Num> أوقية
      </p>
      <p className="bq-lead">تبقى في السجل مع السبب، وتُحذف أشهرها من حساب العضو.</p>
      <p className="bq-rej-l">لماذا تلغيها؟</p>
      <div className="bq-chips" role="radiogroup" aria-label="سبب الإلغاء">
        {CANCEL_REASONS.map((x) => (
          <button
            key={x}
            type="button"
            role="radio"
            aria-checked={pick === x}
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
