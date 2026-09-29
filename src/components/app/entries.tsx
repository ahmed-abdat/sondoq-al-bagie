"use client";
// Operations (payments, donations, expenses): list row, detail sheet, share buttons.
import { useState } from "react";
import { saveReceiptPng, shareReceipt } from "@/lib/share-receipt";
import { categoryLabel, dayWords, fmt } from "./derive";
import { I } from "./icons";
import { Num } from "./num";
import { ReceiptSheetBody } from "./cancel-payment";
import { toShareable, type ReceiptView } from "./receipt-model";
import type { LedgerEntry } from "./types";

export { EntryRow } from "./entry-row";

/** «أرسل الوصل عبر واتساب» + «حفظ صورة الوصل». */
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
        {I.wa(20)} أرسل الوصل عبر واتساب
      </button>
      <button
        type="button"
        className="bq-btn bq-btn-ghost bq-press"
        onClick={() => void saveReceiptPng(sh)}
      >
        {I.save(18)} حفظ صورة الوصل
      </button>
    </div>
  );
}

export function EntrySheetBody({ e, vt }: { e: LedgerEntry; vt: boolean }) {
  if (e.receipt)
    return (
      <ReceiptSheetBody
        r={e.receipt}
        paymentId={e.paymentId}
        style={{ viewTransitionName: vt ? "bq-rc" : undefined }}
      />
    );
  if (e.kind === "expense")
    return (
      <div className="bq-exp-sheet">
        <p className="bq-hint">{e.category ? categoryLabel(e.category) : "مصروف"}</p>
        <h2>{e.title}</h2>
        <p className="bq-big">
          <Num>{fmt(e.amount)}</Num> <span>أوقية</span>
        </p>
        <dl className="bq-facts">
          <div>
            <dt>التاريخ</dt>
            <dd>
              {dayWords(e.at)} <Num>{e.at.slice(0, 4)}</Num>
            </dd>
          </div>
          <div>
            <dt>صرفته</dt>
            <dd>اللجنة، بموافقة أمين الصندوق</dd>
          </div>
        </dl>
      </div>
    );
  return (
    <div className="bq-exp-sheet">
      <p className="bq-hint">{e.kind === "donation" ? "مساهمة في حملة" : "دفعة رسوم"}</p>
      <h2>{e.title}</h2>
      <p className="bq-big">
        <Num>{fmt(e.amount)}</Num> <span>أوقية</span>
      </p>
      <p className="bq-hint">
        {e.sub} · {e.when}
      </p>
    </div>
  );
}
