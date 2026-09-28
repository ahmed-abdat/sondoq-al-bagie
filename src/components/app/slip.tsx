"use client";
// A pending payment as a slip: everything needed to decide, one tap to confirm or reject.
// The stamp lands at once; the decision is sent after the 5 s inline «تراجع» window (or at once
// when the page is left), so undo never has to reverse a confirmed payment on the server.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { useAct } from "./act";
import type { PendingPayment } from "@/lib/data/types";
import { shareReceipt } from "@/lib/share-receipt";
import { MethodBadge } from "./bits";
import { fmt, monthsInWords, relativeAgo } from "./derive";
import { ShareBtns } from "./entries";
import { I } from "./icons";
import { Num, prefersReduced } from "./num";
import { ConfirmedMark, Proof, Stamp } from "./receipt";
import { fromPending, toShareable, type ReceiptView } from "./receipt-model";

const REASONS = ["المبلغ غير صحيح", "رقم العملية مكرر", "الصورة غير واضحة", "أخرى"];
const UNDO_MS = 5000;

type St =
  | { s: "pending"; error?: string }
  | {
      s: "confirmed" | "rejected";
      at: string;
      reason?: string;
      sent: boolean;
      code?: string | null;
      by?: string;
    };

export function PendingSlip({
  p,
  me,
  onFull,
  onDecided,
}: {
  p: PendingPayment;
  /** who is deciding: name + role label */
  me: { by: string; role: string };
  onFull: (r: ReceiptView) => void;
  /** true once decided here (for the waiting count), false after undo or a failed send */
  onDecided?: (decided: boolean) => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const { confirmPayment, rejectPayment } = useAct();
  const [st, setSt] = useState<St>({ s: "pending" });
  const [rejecting, setRejecting] = useState(false);
  const [pick, setPick] = useState("");
  const [other, setOther] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const timer = useRef<number | null>(null);
  const send = useRef<(() => Promise<void>) | null>(null);

  const base = fromPending(p);
  const multi = base.covers.length > 1;
  const reason = pick === "أخرى" ? other.trim() : pick;

  const flush = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
      void send.current?.();
    }
  };
  // leaving the page inside the undo window still sends the decision
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, []);

  const decide = (s: "confirmed" | "rejected", why?: string) => {
    onDecided?.(true);
    const at = new Date().toISOString();
    setSt({ s, at, reason: why, sent: false });
    setCollapsed(false);
    if (s === "confirmed" && !prefersReduced())
      window.setTimeout(() => navigator.vibrate?.(12), 250);
    send.current = async () => {
      const res =
        s === "confirmed"
          ? await confirmPayment({ id: p.id })
          : await rejectPayment({ id: p.id, reason: why ?? "" });
      if (!res.ok) {
        setSt({ s: "pending", error: res.message });
        onDecided?.(false);
        return;
      }
      const d = res.data as
        | { already?: boolean; decidedByName?: string | null; receiptCode?: string | null }
        | undefined;
      setSt((cur) =>
        cur.s === s
          ? {
              ...cur,
              sent: true,
              code: d?.receiptCode ?? null,
              by: d?.already ? (d.decidedByName ?? undefined) : undefined,
            }
          : cur,
      );
      router.refresh();
    };
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setCollapsed(true);
      void send.current?.();
    }, UNDO_MS);
  };
  const undo = () => {
    onDecided?.(false);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    send.current = null;
    setSt({ s: "pending" });
    setRejecting(false);
    setPick("");
    setOther("");
  };

  const done: ReceiptView | null =
    st.s === "confirmed"
      ? {
          ...base,
          code: st.code ?? null,
          status: { kind: "confirmed", by: st.by ?? me.by, role: st.by ? "" : me.role, at: st.at },
        }
      : null;

  if (collapsed && st.s !== "pending")
    return (
      <div className="bq-slip-one">
        {st.s === "confirmed" ? (
          <ConfirmedMark date={st.at} size={24} />
        ) : (
          <span className="bq-kind is-rej">مرفوض</span>
        )}
        <span className="bq-row-t">{p.payerName}</span>
        <Num className="bq-amt">{fmt(p.amount)}</Num>
        {done && toShareable(done) && (
          <button
            type="button"
            className="bq-icon-btn bq-press"
            onClick={() => void shareReceipt(toShareable(done)!)}
            aria-label={`أرسل إيصال ${p.payerName} عبر واتساب`}
          >
            {I.wa(22)}
          </button>
        )}
      </div>
    );

  return (
    <article className={`bq-slip is-${st.s}`} aria-label={`دفعة ${p.payerName}`}>
      <header className="bq-slip-h">
        <span>
          {st.s === "pending"
            ? "دفعة بانتظار التأكيد"
            : st.s === "confirmed"
              ? "دفعة مؤكَّدة"
              : "دفعة مرفوضة"}
        </span>
        {p.receiptNo && <Num className="bq-slip-no">№ {p.receiptNo}</Num>}
      </header>
      <p className="bq-slip-payer">{p.payerName}</p>
      <p className="bq-slip-amt">
        <Num>{fmt(p.amount)}</Num> <span>أوقية</span>
      </p>
      {base.covers.map((c) => (
        <p key={`${c.name}-${c.year}`} className="bq-slip-cov">
          عن: {multi || c.name !== p.payerName ? `${c.name} — ` : ""}رسوم{" "}
          {monthsInWords(c.months, c.year)}
        </p>
      ))}
      {base.campaigns.length > 0 && (
        <p className="bq-slip-cov">مساهمة في: {base.campaigns.join("، ")}</p>
      )}
      <p className="bq-slip-meth">
        <MethodBadge method={p.method} size={24} />
        {p.txnRef && (
          <bdi dir="ltr" className="bq-num bq-txn">
            {p.txnRef}
          </bdi>
        )}
      </p>
      <div className="bq-slip-proof">
        <Proof path={p.proofPath} amount={p.amount} method={p.method} />
        <p className="bq-hint">
          {p.createdByName ? <>سجّلها {p.createdByName}</> : "سُجّلت"}
          <br />
          {relativeAgo(p.createdAt)}
        </p>
      </div>
      {st.s !== "pending" && (
        <span className="bq-slip-stamp">
          <Stamp variant={st.s} date={st.at} size={104} press seed={p.id.charCodeAt(0) % 7} />
        </span>
      )}

      {st.s === "pending" && st.error && (
        <p className="bq-alert" role="alert">
          {st.error}
        </p>
      )}

      {st.s === "pending" && !rejecting && (
        <>
          <p className="bq-slip-hint">
            {I.search(18)}
            <span>طابِق المبلغ ورقم العملية مع محفظة الصندوق قبل التأكيد.</span>
          </p>
          <div className="bq-slip-btns">
            <button
              type="button"
              className="bq-btn bq-btn-primary bq-press"
              disabled={!online}
              onClick={() => decide("confirmed")}
            >
              {I.check(20)} تأكيد الاستلام
            </button>
            <button
              type="button"
              className="bq-btn bq-btn-tonal bq-press"
              disabled={!online}
              onClick={() => setRejecting(true)}
            >
              رفض
            </button>
          </div>
          <OfflineWriteHint />
          <button type="button" className="bq-link bq-press" onClick={() => onFull(base)}>
            عرض الوصل كاملًا {I.go(18)}
          </button>
        </>
      )}
      {st.s === "pending" && rejecting && (
        <div className="bq-rej">
          <p className="bq-rej-l" id={`rj-${p.id}`}>
            لماذا ترفض هذه الدفعة؟
          </p>
          <div className="bq-chips" role="radiogroup" aria-labelledby={`rj-${p.id}`}>
            {REASONS.map((x) => (
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
              aria-label="سبب الرفض"
            />
          )}
          <div className="bq-slip-btns">
            <button
              type="button"
              className="bq-btn bq-btn-tonal bq-press"
              disabled={!reason || !online}
              onClick={() => decide("rejected", reason)}
            >
              ارفض الدفعة
            </button>
            <button type="button" className="bq-btn bq-btn-ghost bq-press" onClick={undo}>
              رجوع
            </button>
          </div>
        </div>
      )}
      {st.s === "confirmed" && done && (
        <div className="bq-slip-after">
          <p className="bq-slip-done">
            {I.check(18)}{" "}
            {st.by
              ? `أكّدها ${st.by} قبلك`
              : `أكّدها ${me.by}${me.role ? `، ${me.role}` : ""}، الآن`}
          </p>
          {st.sent ? (
            <ShareBtns r={done} />
          ) : (
            <p className="bq-hint">يُرسل التأكيد بعد ثوانٍ، ثم يظهر زر إرسال الإيصال.</p>
          )}
          {!st.sent && (
            <button type="button" className="bq-link bq-press" onClick={undo}>
              {I.undo(18)} تراجع عن التأكيد
            </button>
          )}
        </div>
      )}
      {st.s === "rejected" && (
        <div className="bq-slip-after">
          <p className="bq-slip-done is-rej">رُفضت: {st.reason}</p>
          {!st.sent && (
            <div className="bq-slip-btns">
              <button type="button" className="bq-btn bq-btn-tonal bq-press" onClick={undo}>
                {I.undo(18)} تراجع
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
