"use client";
// The transfer picture (Proof) and the compact confirmed mark.
// No receipts (owner). Styles: `rc-` in globals.css.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAct } from "./act";
import { safeReceiptSrc } from "@/lib/receipt";
import { I } from "./icons";
import type { ReceiptView } from "./receipt-model";

export { ConfirmedMark } from "./mark";

/** Stand-in drawing while the real screenshot loads (or when it cannot be shown). */
function ShotMock({ large }: { large?: boolean }) {
  // a neutral placeholder while the signed picture arrives: no fake wallet name or amount (C21)
  return (
    <svg viewBox="0 0 90 160" className={large ? "rc-shot-l" : "rc-shot"} aria-hidden="true">
      <rect width="90" height="160" rx="10" fill="#F2F4F3" />
      <rect width="90" height="34" rx="10" fill="#1A5F2E" />
      <rect y="24" width="90" height="10" fill="#1A5F2E" />
      <circle cx="45" cy="56" r="11" fill="#CFE7D4" />
      {[80, 98, 108, 118, 128].map((y, i) => (
        <rect key={y} x="14" y={y} width={i % 2 ? 46 : 62} height="4" rx="2" fill="#CDD5D0" />
      ))}
    </svg>
  );
}

/**
 * Committee only: the transfer screenshot (signed URL, 5 min). Tap opens it full screen like a
 * WhatsApp photo (UX-PATTERNS P8); the phone's Back closes it (one history entry). `wide`: a
 * large thumbnail cropped to the top, so the amount reads without opening. `actions` (the slip's
 * «أكّد الاستلام» / «رفض») show under the full-screen picture and close it when used.
 */
export function Proof({
  path,
  wide = false,
  actions,
  onFail,
}: {
  path: string | null;
  amount?: number;
  method?: ReceiptView["method"];
  wide?: boolean;
  actions?: ReactNode;
  /** the picture could not be loaded (the slip then blocks «أكّد الاستلام») */
  onFail?: (failed: true) => void;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const pushed = useRef(false);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { proofUrl } = useAct();
  useEffect(() => {
    if (!path) return;
    let live = true;
    proofUrl({ path })
      .then((r) => {
        if (!live) return;
        const u = r.ok ? safeReceiptSrc(r.data) : null;
        if (u) setSrc(u);
        else {
          setFailed(true);
          onFail?.(true);
        }
      })
      .catch(() => {
        if (!live) return;
        setFailed(true);
        onFail?.(true);
      });
    return () => {
      live = false;
    };
  }, [path, proofUrl, onFail]);
  // Back closes the picture, as in WhatsApp
  useEffect(() => {
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      dlg.current?.close();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const open = () => {
    dlg.current?.showModal();
    if (!pushed.current) {
      pushed.current = true;
      history.pushState(history.state, "", window.location.href);
    }
  };
  const close = () => dlg.current?.close();
  // closed by a button or Escape: take our history entry back off
  const onClose = () => {
    if (!pushed.current) return;
    pushed.current = false;
    history.back();
  };
  if (!path) return <span className="rc-sub">لا توجد صورة</span>;
  return (
    <>
      <button
        type="button"
        className={`rc-proof bq-press ${wide ? "is-wide" : ""}`}
        onClick={open}
        aria-haspopup="dialog"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img
            src={src}
            alt=""
            className="rc-shot"
            onError={() => {
              setSrc(null);
              setFailed(true);
              onFail?.(true);
            }}
          />
        ) : (
          <ShotMock />
        )}
        <span className="rc-proof-t">
          <span>صورة التحويل</span>
          <span className="rc-proof-s">{I.expand(16)} اضغط للتكبير</span>
        </span>
      </button>
      <dialog
        ref={dlg}
        className={`rc-dlg ${actions ? "is-full" : ""}`}
        aria-label="صورة التحويل"
        onClose={onClose}
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        {actions && (
          <button
            type="button"
            className="bq-icon-btn rc-dlg-x bq-press"
            onClick={close}
            aria-label="إغلاق"
          >
            {I.x(22)}
          </button>
        )}
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={src} alt="صورة التحويل" className="rc-shot-l" />
        ) : failed ? (
          // the error replaces the picture, never both (audit C20)
          <p className="rc-dlg-n">تعذّر تحميل الصورة الآن. حاول مرة أخرى بعد الاتصال.</p>
        ) : (
          <ShotMock large />
        )}
        {actions ? (
          // any action closes the picture after it runs (the click bubbles here)
          <div className="rc-dlg-acts" onClick={close}>
            {actions}
          </div>
        ) : (
          <button type="button" className="bq-btn bq-btn-soft bq-press" onClick={close}>
            إغلاق
          </button>
        )}
      </dialog>
    </>
  );
}
