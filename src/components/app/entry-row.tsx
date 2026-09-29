"use client";
// One operation row (payment, donation, expense). Light: no receipt or share code here.
import { MethodBadge } from "./bits";
import { fmt } from "./derive";
import { I } from "./icons";
import { ConfirmedMark } from "./mark";
import { Amount } from "./money";
import type { LedgerEntry } from "./types";

export function EntryRow({
  e,
  onOpen,
}: {
  e: LedgerEntry;
  onOpen: (e: LedgerEntry, el: HTMLElement) => void;
}) {
  const inn = e.kind !== "expense";
  const st = e.receipt?.status;
  return (
    <li>
      <button
        type="button"
        className="bq-row bq-press"
        onClick={(ev) => onOpen(e, ev.currentTarget)}
        aria-label={
          e.amount === null
            ? `${e.title}. افتح التفاصيل`
            : `${e.title}، ${fmt(e.amount)} أوقية. افتح التفاصيل`
        }
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
          <Amount v={e.amount} sign={inn ? "+" : "−"} className={`bq-amt ${inn ? "a-in" : ""}`} />
          <span className={`bq-kind ${inn ? "is-in" : ""}`}>{inn ? "دخل" : "مصروف"}</span>
        </span>
      </button>
    </li>
  );
}
