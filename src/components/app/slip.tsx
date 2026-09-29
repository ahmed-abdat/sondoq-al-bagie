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
import { MemberNo, MethodBadge } from "./bits";
import { dayWords, fmt, monthsInWords, relativeAgo } from "./derive";
import { ShareBtns } from "./entries";
import { I } from "./icons";
import { Num, prefersReduced, useNow } from "./num";
import { ConfirmedMark, Proof, Stamp } from "./receipt";
import { fromPending, toShareable, type ReceiptView } from "./receipt-model";
import { radioKeys, radioTab } from "./radio-keys";

const REASONS = ["المبلغ غير صحيح", "رقم العملية مكرر", "الصورة غير واضحة", "أخرى"];
const UNDO_MS = 5000;
/** no answer after this long: say so and offer to send again */
const STALL_MS = 15000;

type St =
  | { s: "pending"; error?: string }
  | {
      s: "confirmed" | "rejected";
      at: string;
      reason?: string;
      sent: boolean;
      code?: string | null;
      by?: string;
      /** the server refused or could not be reached: keep the card, say why, offer a retry */
      failed?: string;
    };

export function PendingSlip({
  p,
  me,
  onFull,
  onDecided,
}: {
  p: PendingPayment;
  /** who is deciding: name + role label; may they confirm, and their own member id */
  me: { by: string; role: string; canConfirm?: boolean; memberId?: string | null };
  onFull: (r: ReceiptView) => void;
  /** true once decided here (for the waiting count), false after undo or a failed send */
  onDecided?: (decided: boolean) => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const now = useNow();
  const { confirmPayment, rejectPayment } = useAct();
  const [st, setSt] = useState<St>({ s: "pending" });
  const [rejecting, setRejecting] = useState(false);
  const [pick, setPick] = useState("");
  const [other, setOther] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  /** bumped on every send; the stall timer restarts with it */
  const [tries, setTries] = useState(0);
  const [stalled, setStalled] = useState(false);
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
      setTries((n) => n + 1);
      setStalled(false);
      const res =
        s === "confirmed"
          ? await confirmPayment({ id: p.id })
          : await rejectPayment({ id: p.id, reason: why ?? "" });
      if (!res.ok) {
        setCollapsed(false);
        // stale_app has no message (the update toast speaks); the card still needs one
        const why = res.message || "حدّث التطبيق ثم أعد المحاولة.";
        setSt((cur) => (cur.s === s ? { ...cur, failed: why } : cur));
        return;
      }
      const d = res.data as
        | { already?: boolean; decidedByName?: string | null; receiptCode?: string | null }
        | undefined;
      setSt((cur) =>
        cur.s === s
          ? {
              ...cur,
              failed: undefined,
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
  // sent but no answer yet (slow network, or the request was dropped): after a while say so
  const waiting = collapsed && st.s !== "pending" && !st.sent && !st.failed;
  useEffect(() => {
    if (!waiting) return;
    const t = window.setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(t);
  }, [waiting, tries]);
  const retry = () => {
    setSt((cur) => (cur.s === "pending" ? cur : { ...cur, failed: undefined }));
    void send.current?.();
  };
  const own = !!me.memberId && p.allocations.some((a) => a.memberId === me.memberId);
  const mayDecide = (me.canConfirm ?? true) && !own;
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

  if (waiting)
    return (
      <div className="bq-slip-one is-sending" role="status">
        <span className="bq-row-t">{p.payerName}</span>
        <Num className="bq-amt">{fmt(p.amount)}</Num>
        {stalled ? (
          <>
            <p className="bq-hint bq-slip-one-w">
              لم يصل {st.s === "confirmed" ? "التأكيد" : "الرفض"} بعد. تحقق من الإنترنت ثم اضغط أعد
              المحاولة.
            </p>
            <button
              type="button"
              className="bq-btn bq-btn-tonal bq-press"
              disabled={!online}
              onClick={retry}
            >
              أعد المحاولة
            </button>
          </>
        ) : (
          <span className="bq-hint">جارٍ الإرسال…</span>
        )}
      </div>
    );
  if (collapsed && st.s !== "pending" && st.sent && !st.failed)
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
            className="bq-btn bq-btn-soft bq-press bq-slip-one-wa"
            onClick={() => void shareReceipt(toShareable(done)!)}
            aria-label={`أرسل وصل ${p.payerName} عبر واتساب`}
          >
            {/* icon plus a word (audit C19) */}
            {I.wa(20)} الوصل
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
          {multi || c.name !== p.payerName ? (
            <>
              عن {c.name}
              {c.ref && (
                <>
                  {" "}
                  (<MemberNo m={{ memberRef: c.ref }} />)
                </>
              )}
              : رسوم {monthsInWords(c.months, c.year)}
            </>
          ) : (
            // payer = the member: no second name (audit C12)
            <>
              عن: رسوم {monthsInWords(c.months, c.year)}
              {c.ref && (
                <>
                  {" "}
                  (<MemberNo m={{ memberRef: c.ref }} />)
                </>
              )}
            </>
          )}
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
        <Proof
          path={p.proofPath}
          wide
          actions={
            st.s === "pending" && !rejecting && mayDecide ? (
              <>
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
              </>
            ) : undefined
          }
        />
        <p className="bq-hint">
          {p.submittedByMember ? (
            <>أرسلها العضو {p.submittedByMember.fullName} عبر رابطه</>
          ) : p.createdByName ? (
            <>سجّلها {p.createdByName}</>
          ) : (
            "سُجّلت"
          )}
          <br />
          {now ? relativeAgo(p.createdAt, now) : dayWords(p.createdAt)}
        </p>
      </div>
      {st.s !== "pending" && (
        <span className="bq-slip-stamp">
          <Stamp
            variant={st.s}
            date={st.at}
            size={104}
            press
            seed={p.id.charCodeAt(0) % 7}
            role={st.by ? "" : me.role}
          />
        </span>
      )}

      {st.s === "pending" && st.error && (
        <p className="bq-alert" role="alert">
          {st.error}
        </p>
      )}

      {st.s === "pending" && !rejecting && !mayDecide && (
        <>
          <p className="bq-slip-hint">
            {I.clock(18)}
            <span>
              {own
                ? "هذه الدفعة عنك؛ يؤكدها عضو آخر من اللجنة."
                : "التأكيد لأمين الصندوق أو نائبه."}
            </span>
          </p>
          <button type="button" className="bq-link bq-press" onClick={() => onFull(base)}>
            عرض الوصل كاملًا {I.go(18)}
          </button>
        </>
      )}
      {st.s === "pending" && !rejecting && mayDecide && (
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
          {p.submittedByMember && <p className="bq-hint">يصل السبب إلى العضو.</p>}
          <div
            className="bq-chips"
            role="radiogroup"
            onKeyDown={radioKeys}
            aria-labelledby={`rj-${p.id}`}
          >
            {REASONS.map((x, i, all) => (
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
      {st.s !== "pending" && st.failed && (
        <div className="bq-slip-after">
          <p className="bq-alert" role="alert">
            لم يُحفظ {st.s === "confirmed" ? "التأكيد" : "الرفض"}: {st.failed}
          </p>
          <div className="bq-slip-btns">
            <button
              type="button"
              className="bq-btn bq-btn-primary bq-press"
              disabled={!online}
              onClick={retry}
            >
              إعادة المحاولة
            </button>
            <button type="button" className="bq-btn bq-btn-ghost bq-press" onClick={undo}>
              رجوع
            </button>
          </div>
        </div>
      )}
      {st.s === "confirmed" && done && !st.failed && (
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
      {st.s === "rejected" && !st.failed && (
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
