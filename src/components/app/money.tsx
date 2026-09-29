"use client";
// Money on public pages (docs/MONEY-PRIVACY.md). Pages are static and the same for everyone;
// figures arrive here, in the browser, only for the committee or a member with their link.
// Strangers never ask and see «••• •••» (one width for every figure) plus one calm hint.
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { MemberLinkPaste } from "@/components/providers";
import { fmt } from "./derive";
import { I } from "./icons";
import { loadMoney, loadReportMoney } from "./money-action";
import { MONEY_COOKIE_RE, type ClientMoney } from "./money-model";
import { Num } from "./num";
import { waLink } from "@/lib/whatsapp";
import type { ReportData } from "@/lib/data/types";

type Slot<T> = { v: T | null | undefined; at: number; asking: boolean; subs: Set<() => void> };
const slot = <T,>(): Slot<T> => ({ v: undefined, at: 0, asking: false, subs: new Set() });
const bundle = slot<ClientMoney>();
const report = slot<ReportData>();

const mayAsk = () => MONEY_COOKIE_RE.test(document.cookie);

function setSlot<T>(s: Slot<T>, x: T | null | undefined) {
  s.v = x;
  s.at = Date.now();
  s.subs.forEach((cb) => cb());
}

/** Ask the server once (then again when older than `maxAge`), only when a cookie says maybe. */
function ask<T>(s: Slot<T>, load: () => Promise<T | null>, maxAge: number) {
  if (!mayAsk()) {
    if (s.v !== null) setSlot(s, null);
    return;
  }
  if (s.asking || (s.v !== undefined && Date.now() - s.at < maxAge)) return;
  s.asking = true;
  load()
    .then(
      (x) => setSlot(s, x),
      () => s.v === undefined && setSlot(s, null),
    )
    .finally(() => (s.asking = false));
}

function useSlot<T>(s: Slot<T>, load: () => Promise<T | null>, maxAge = 30_000) {
  const v = useSyncExternalStore(
    (cb) => {
      s.subs.add(cb);
      return () => s.subs.delete(cb);
    },
    () => s.v,
    () => undefined,
  );
  useEffect(() => ask(s, load, maxAge), [s, load, maxAge]);
  return v;
}

/** undefined = not known yet (dots), null = a stranger (dots + hint), else the figures. */
export const useMoney = () => useSlot(bundle, loadMoney);
export const useReportMoney = () => useSlot(report, loadReportMoney);

/** Sign-out / «إزالة من هذا الهاتف»: nothing of the money stays in this tab. */
export function clearMoney() {
  for (const s of [bundle, report] as Slot<unknown>[]) setSlot(s, undefined);
}

/** «••• •••»: drawn dots, one fixed width for every figure (never hints at the size). */
export function Dots({ className = "" }: { className?: string }) {
  return (
    <span className={`bq-dots ${className}`} role="img" aria-label="مخفي">
      <span>
        <i />
        <i />
        <i />
      </span>
      <span>
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

/** A figure, or the dots when it is not ours to show. `sign` like «+» / «−». */
export function Amount({
  v,
  sign = "",
  className = "",
  dots = "",
}: {
  v: number | null | undefined;
  sign?: string;
  className?: string;
  dots?: string;
}) {
  if (v === null || v === undefined) return <Dots className={dots} />;
  return <Num className={className}>{`${sign}${fmt(v)}`}</Num>;
}

const ASK_TEXT = "السلام عليكم، أريد رابطًا جديدًا لصندوق الرابطة.";
/** «اطلب رابطًا جديدًا في واتساب»: a message to the fund's WhatsApp (null without a number). */
export const askLinkHref = (whatsapp?: string | null) =>
  whatsapp ? waLink(whatsapp, ASK_TEXT) : null;
const HINT = "مبالغ الصندوق للأعضاء واللجنة. افتح رسالة اللجنة في واتساب لتراها.";

/** «لديك رابط؟»: what to do, the paste box (installed app), and «اطلب رابطك». */
function LinkHelp({
  dlg,
  whatsapp,
}: {
  dlg: React.RefObject<HTMLDialogElement | null>;
  whatsapp?: string | null;
}) {
  const ask = askLinkHref(whatsapp);
  return (
    <dialog ref={dlg} className="bq-mdlg" aria-labelledby="bq-mdlg-h">
      <h2 id="bq-mdlg-h">افتح رابطك الخاص</h2>
      <p>
        أرسلت لك اللجنة رابطًا خاصًا بك على واتساب. اضغطه مرة واحدة، وستظهر لك أرقام الصندوق على هذا
        الهاتف.
      </p>
      <MemberLinkPaste />
      {ask && (
        <a
          className="bq-btn bq-btn-soft bq-btn-lg bq-press"
          href={ask}
          target="_blank"
          rel="noreferrer"
        >
          {I.wa(20)} اطلب رابطًا جديدًا في واتساب
        </a>
      )}
      <button
        type="button"
        className="bq-btn bq-btn-ghost bq-btn-lg bq-press"
        onClick={() => dlg.current?.close()}
      >
        حسنًا
      </button>
    </dialog>
  );
}

/** One calm line where money first appears (hidden before paint for maybe-allowed browsers). */
export function MoneyHint({
  tone = "paper",
  whatsapp,
}: {
  tone?: "paper" | "green";
  whatsapp?: string | null;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const m = useMoney();
  if (m) return null;
  return (
    <div className={`bq-money-hint is-${tone}`}>
      <span className="bq-money-hint-i" aria-hidden="true">
        {I.lock(18)}
      </span>
      <p>
        {HINT}{" "}
        <button
          type="button"
          className="bq-money-hint-a bq-press"
          onClick={() => dlg.current?.showModal()}
        >
          افتح رسالة اللجنة
        </button>
      </p>
      <LinkHelp dlg={dlg} whatsapp={whatsapp} />
    </div>
  );
}

/** /accounts, strangers: the soft green card in place of the balance breakdown (variant C). */
export function MoneyCard({
  whatsapp,
  children,
}: {
  whatsapp?: string | null;
  children?: ReactNode;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const ask = askLinkHref(whatsapp);
  return (
    <div className="bq-money-card">
      <span className="bq-money-key" aria-hidden="true">
        {I.lock(20)}
      </span>
      <div>
        <p className="bq-money-card-t">الحساب كاملًا يظهر للأعضاء</p>
        <p className="bq-hint">ما كان في الصندوق، وما جُمع، وما صُرف. افتح رابطك الخاص لتراه.</p>
        <div className="bq-money-card-acts">
          <button
            type="button"
            className="bq-link bq-press"
            onClick={() => dlg.current?.showModal()}
          >
            افتح رسالة اللجنة {I.go(18)}
          </button>
          {ask && (
            <a className="bq-link bq-press" href={ask} target="_blank" rel="noreferrer">
              {I.wa(18)} اطلب رابطًا جديدًا
            </a>
          )}
        </div>
        {children}
      </div>
      <LinkHelp dlg={dlg} whatsapp={whatsapp} />
    </div>
  );
}
