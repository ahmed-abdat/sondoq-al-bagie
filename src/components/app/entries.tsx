"use client";
// Operations (payments, donations, expenses): list row, detail sheet, share buttons.
import { useState } from "react";
import { saveReceiptPng, shareReceipt } from "@/lib/share-receipt";
import { MethodBadge } from "./bits";
import { categoryLabel, dayWords, fmt } from "./derive";
import { I } from "./icons";
import { Num } from "./num";
import { ConfirmedMark, Receipt } from "./receipt";
import { toShareable, type ReceiptView } from "./receipt-model";
import type { LedgerEntry } from "./types";

export function EntryRow({ e, onOpen }: { e: LedgerEntry; onOpen: (e: LedgerEntry, el: HTMLElement) => void }) {
  const inn = e.kind !== "expense";
  const st = e.receipt?.status;
  return (
    <li>
      <button
        type="button"
        className="bq-row bq-press"
        onClick={(ev) => onOpen(e, ev.currentTarget)}
        aria-label={`${e.title}، ${fmt(e.amount)} أوقية — افتح التفاصيل`}
      >
        <span className={`bq-disc ${inn ? "is-in" : ""}`}>
          {e.kind === "donation" ? I.heart(22) : inn ? I.coins(22) : I.bag(22)}
        </span>
        <span className="bq-row-m">
          <span className="bq-row-t">{e.title}</span>
          <span className="bq-row-s bq-row-sm">
            {e.method && <MethodBadge method={e.method} size={20} label={false} />}
            <span>
              {e.sub} · {e.when}
            </span>
          </span>
          {st?.kind === "confirmed" && <ConfirmedMark date={st.at} size={22} />}
        </span>
        <span className="bq-row-e">
          <Num className={`bq-amt ${inn ? "a-in" : ""}`}>{`${inn ? "+" : "−"}${fmt(e.amount)}`}</Num>
          <span className={`bq-kind ${inn ? "is-in" : ""}`}>{inn ? "دخل" : "مصروف"}</span>
        </span>
      </button>
    </li>
  );
}

/** «أرسل الإيصال عبر واتساب» + «حفظ صورة الوصل». */
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
        {I.wa(20)} أرسل الإيصال عبر واتساب
      </button>
      <button type="button" className="bq-btn bq-btn-ghost bq-press" onClick={() => void saveReceiptPng(sh)}>
        {I.save(18)} حفظ صورة الوصل
      </button>
    </div>
  );
}

export function EntrySheetBody({ e, vt }: { e: LedgerEntry; vt: boolean }) {
  if (e.receipt)
    return (
      <div className="bq-rc-sheet" style={{ viewTransitionName: vt ? "bq-rc" : undefined }}>
        <Receipt r={e.receipt} audience="public" />
        {e.receipt.status.kind === "confirmed" && <ShareBtns r={e.receipt} />}
      </div>
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
