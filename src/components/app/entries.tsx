"use client";
// The receipt's share buttons.
import { useState } from "react";
import { saveReceiptPng, shareReceipt } from "@/lib/share-receipt";
import { I } from "./icons";
import { toShareable, type ReceiptView } from "./receipt-model";

/** «شارك الوصل» + «حفظ صورة الوصل»; sharing opens a sheet or a draft, it does not send. */
export function ShareBtns({ r, phone }: { r: ReceiptView; phone?: string | null }) {
  const sh = toShareable(r);
  const [busy, setBusy] = useState(false);
  if (!sh) return null;
  return (
    <div className="bq-share">
      <button
        type="button"
        className="bq-btn bq-btn-primary bq-press"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await shareReceipt(sh, { phone });
          } finally {
            setBusy(false);
          }
        }}
      >
        {I.wa(20)} شارك الوصل
      </button>
      <button
        type="button"
        className="bq-btn bq-btn-ghost bq-press"
        onClick={() => void saveReceiptPng(sh)}
      >
        {I.save(18)} حفظ صورة الوصل
      </button>
      <p className="bq-hint">اختر واتساب ثم اضغط إرسال.</p>
    </div>
  );
}
