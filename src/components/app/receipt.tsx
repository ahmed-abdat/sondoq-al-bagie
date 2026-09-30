"use client";
// The payment receipt («وصل استلام»), the association rubber stamp and the compact confirmed
// mark. Styles: `rc-` in globals.css. Committee only: everything shown, no QR and no link.
import Image from "next/image";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useAct } from "./act";
import { METHOD_LABELS, methodLogo } from "@/lib/methods";
import { safeReceiptSrc } from "@/lib/receipt";
import {
  amountInWords,
  ASSOC,
  clock,
  dayDate,
  dayWords,
  dotDate,
  fmt,
  FUND,
  monthCount,
  monthsInWords,
} from "./derive";
import { MemberNo } from "./bits";
import { RIM_BOTTOM, RIM_TOP } from "./stamp-rim";
import { copyText } from "./copy";
import { I } from "./icons";
import type { ReceiptView } from "./receipt-model";

function Num({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={`rc-num ${className}`}>
      {children}
    </bdi>
  );
}

/* ═══════════════════════════ THE STAMP ═══════════════════════════
   viewBox 200: outer ring r95, thin ring r89.5, inner ring r63; rim text on arcs r73.45 / r79.15
   (outline paths from scripts/stamp-rim.mjs, «رابطة شباب قرية البقيع» / «صندوق الرابطة»);
   separators (stars) at the gaps' midpoints; a dater band across the middle. */
const C = 100;
function star(cx: number, cy: number, R: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? R * 0.45 : R;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}
const polar = (deg: number, r: number) =>
  [C + r * Math.cos((deg * Math.PI) / 180), C - r * Math.sin((deg * Math.PI) / 180)] as const;
const SEP = [-11.6, 191.6].map((d) => polar(d, 76.3));

export function Stamp({
  variant = "confirmed",
  date,
  size = 120,
  press = false,
  seed = 3,
  role = "",
  className = "",
}: {
  variant?: "confirmed" | "rejected" | "cancelled";
  date: string;
  /** the dater band: who stamped it (أمين الصندوق / نائب أمين الصندوق / المسؤول); empty = none */
  role?: string;
  size?: number;
  press?: boolean;
  seed?: number;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ink = `rci${uid}`;
  const word = variant === "rejected" ? "مرفوض" : variant === "cancelled" ? "ملغى" : "مؤكَّد";
  return (
    <span
      className={`rc-stamp ${variant !== "confirmed" ? "is-rej" : ""} ${press ? "is-press" : ""} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`ختم ${ASSOC}: ${word} ${dayDate(date)}`}
    >
      <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden="true">
        <defs>
          {/* ink: a hair of edge roughness + uneven density + rare voids — rubber on paper */}
          <filter
            id={ink}
            x="-4%"
            y="-4%"
            width="108%"
            height="108%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              seed={seed}
              result="grain"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="grain"
              scale="1.05"
              xChannelSelector="R"
              yChannelSelector="G"
              result="rough"
            />
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.028"
              numOctaves="3"
              seed={seed + 7}
              result="blotch"
            />
            <feColorMatrix
              in="blotch"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.75 0 0 0 1.27"
              result="density"
            />
            <feTurbulence
              type="fractalNoise"
              baseFrequency="1.6"
              numOctaves="1"
              seed={seed + 13}
              result="speck"
            />
            <feColorMatrix
              in="speck"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -10 0 0 0 7.7"
              result="voids"
            />
            <feComposite in="density" in2="voids" operator="in" result="mask" />
            <feComposite in="rough" in2="mask" operator="in" />
          </filter>
        </defs>
        <g className="rc-ink" filter={`url(#${ink})`} fill="currentColor">
          <g fill="none" stroke="currentColor">
            <circle cx={C} cy={C} r="95" strokeWidth="4.5" />
            <circle cx={C} cy={C} r="89.5" strokeWidth="1.2" />
            <circle cx={C} cy={C} r="63" strokeWidth="1.6" />
            <path
              d={`M ${C - 61} 91 H ${C + 61} M ${C - 60.4} 115 H ${C + 60.4}`}
              strokeWidth="1.4"
            />
          </g>
          {/* rim texts as pre-shaped outlines: <textPath> breaks Arabic in WebKit (stamp-rim.ts) */}
          <path d={RIM_TOP} />
          <path d={RIM_BOTTOM} />
          {SEP.map(([x, y], i) => (
            <polygon key={i} points={star(x, y, 3.6)} />
          ))}
          <text
            x={C}
            y="83"
            textAnchor="middle"
            fontSize="22"
            fontWeight="800"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {word}
          </text>
          <text
            x={C}
            y="108.5"
            textAnchor="middle"
            fontSize="15"
            fontWeight="700"
            direction="ltr"
            style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}
          >
            {dotDate(date)}
          </text>
          <text
            x={C}
            y="132"
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {role}
          </text>
        </g>
      </svg>
    </span>
  );
}

export { ConfirmedMark } from "./mark";

function MethodTile({ method }: { method: ReceiptView["method"] }) {
  const logo = methodLogo(method);
  return (
    <span className="rc-wallet">
      <span className="rc-wallet-tile">
        {logo ? <Image src={logo} alt="" width={28} height={28} /> : I.cash(18)}
      </span>
      {METHOD_LABELS[method]}
    </span>
  );
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button
      type="button"
      className="rc-copy bq-press"
      aria-label={copied ? "نُسخ رقم العملية" : "نسخ رقم العملية"}
      onClick={async () => {
        // «نُسخ» only when it really was (QA pass 5); the number stays visible to copy by hand
        if ((await copyText(value)) !== "copied") return;
        setCopied(true);
        clearTimeout(t.current);
        t.current = setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? I.check(18) : I.copy(18)}
      <span aria-live="polite">{copied ? "نُسخ" : "نسخ"}</span>
    </button>
  );
}

/** Full reference, ellipsised in the MIDDLE only when it can't fit; the last 6 always show. */
function TxnRef({ value }: { value: string }) {
  return (
    <span className="rc-txn-v" dir="ltr" title={value}>
      <span className="rc-txn-h">{value.slice(0, -6)}</span>
      <span className="rc-txn-t">{value.slice(-6)}</span>
    </span>
  );
}

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

function StatusBlock({ r, press }: { r: ReceiptView; press: boolean }) {
  const st = r.status;
  const pending = (
    <div className="rc-st-body">
      <span className="rc-st-ico">{I.clock(22)}</span>
      <div>
        <p className="rc-st-h">بانتظار تأكيد أمين الصندوق</p>
        <p className="rc-st-s">لا تُحسب الدفعة قبل التأكيد</p>
      </div>
    </div>
  );
  if (st.kind === "pending")
    return (
      <section className="rc-status" aria-label="حالة الوصل">
        {pending}
      </section>
    );
  const who = [st.by, st.role].filter(Boolean).join("، ");
  const when = (
    <p className="rc-st-s">
      {dayDate(st.at)}
      <span className="rc-st-t">
        الساعة <Num>{clock(st.at)}</Num>
      </span>
    </p>
  );
  let body: ReactNode;
  if (st.kind === "confirmed")
    body = (
      <div className="rc-st-body has-stamp">
        <div>
          <p className="rc-st-h is-ok">{I.check(20)} تم الاستلام</p>
          {st.by && (
            <p className="rc-st-p">
              <span className="rc-st-k">أكّدها:</span> <strong className="rc-who">{st.by}</strong>
            </p>
          )}
          {st.role && <p className="rc-st-role">{st.role}</p>}
          {when}
        </div>
      </div>
    );
  else if (st.kind === "rejected")
    body = (
      <div className="rc-st-body has-stamp">
        <div>
          <p className="rc-st-h is-rej">{I.xc(20)} مرفوض</p>
          {st.reason && (
            <p className="rc-st-p">
              <span className="rc-st-k">السبب:</span> {st.reason}
            </p>
          )}
          {who && (
            <p className="rc-st-p">
              <span className="rc-st-k">رفضها:</span> {who}
            </p>
          )}
          {when}
        </div>
      </div>
    );
  else
    body = (
      <div className="rc-st-body has-stamp">
        <div>
          <p className="rc-st-h is-rej">{I.ban(20)} أُلغي هذا الوصل</p>
          {st.reason && (
            <p className="rc-st-p">
              <span className="rc-st-k">السبب:</span> {st.reason}
            </p>
          )}
          <p className="rc-st-s">هذا الوصل لا يُحسب.</p>
        </div>
      </div>
    );
  return (
    <section
      className={`rc-status ${press ? "is-swap" : ""}`}
      aria-label="حالة الوصل"
      aria-live="polite"
    >
      {press && (
        <div className="rc-st-layer is-out" aria-hidden="true">
          {pending}
        </div>
      )}
      <div className={`rc-st-layer ${press ? "is-in" : ""}`}>{body}</div>
      {(st.kind === "confirmed" || st.kind === "rejected" || st.kind === "cancelled") && (
        <Stamp
          variant={st.kind}
          date={st.at}
          press={press}
          seed={Number((r.no ?? "").slice(-2)) || 3}
          role={"role" in st ? st.role : ""}
          className="rc-st-stamp"
        />
      )}
    </section>
  );
}

export function Receipt({
  r,
  press = false,
  children,
}: {
  r: ReceiptView;
  press?: boolean;
  children?: ReactNode;
}) {
  const void_ = r.status.kind === "rejected" || r.status.kind === "cancelled";
  const multi = r.covers.length > 1;
  const ref = r.txn;
  return (
    <article className="rc" aria-label={`وصل استلام${r.no ? ` رقم ${r.no}` : ""}`}>
      <div className={`rc-shadow ${press ? "is-impact" : ""}`}>
        <div className={`rc-paper ${void_ ? "is-void" : ""}`}>
          <header className="rc-head">
            <span className="rc-logo">
              <Image src="/logo.jpg" alt="" width={44} height={44} />
            </span>
            <span className="rc-org">
              <strong>{FUND}</strong>
              <span>{ASSOC}</span>
            </span>
          </header>

          <div className="rc-title">
            <h3>وصل استلام</h3>
            {r.no && (
              <p className="rc-no">
                <span>رقم الوصل</span>
                <Num>{r.no}</Num>
              </p>
            )}
          </div>

          <div className="rc-from">
            <span className="rc-k">استلمنا من</span>
            <p className="rc-payer">{r.payer}</p>
          </div>

          <div className="rc-amount">
            <span className="rc-k">مبلغًا قدره</span>
            <p className="rc-amt">
              <Num>{fmt(r.amount)}</Num>
              <span className="rc-amt-u">أوقية</span>
            </p>
            <p className="rc-amt-words">{amountInWords(r.amount)} أوقية</p>
            <p className="rc-amt-new">
              أي <Num>{fmt(r.amount / 10)}</Num> أوقية جديدة
            </p>
          </div>

          <dl className="rc-grid">
            {r.covers.length > 0 && (
              <div className="rc-row">
                <dt>عن رسوم</dt>
                <dd>
                  {r.covers.map((c) => (
                    <span key={`${c.name}-${c.year}`} className="rc-cover">
                      {(multi || c.name !== r.payer || c.ref) && (
                        <span className="rc-for">
                          عن: {c.name}
                          {c.ref && (
                            <>
                              {" "}
                              (<MemberNo m={{ memberRef: c.ref }} />)
                            </>
                          )}
                        </span>
                      )}
                      <span className="rc-months">{monthsInWords(c.months, c.year)}</span>
                      <span className="rc-count">{monthCount(c.months.length)}</span>
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {r.campaigns.length > 0 && (
              <div className="rc-row">
                <dt>مساهمة في</dt>
                <dd>{r.campaigns.join("، ")}</dd>
              </div>
            )}
            <div className="rc-row">
              <dt>طريقة الدفع</dt>
              <dd>
                <MethodTile method={r.method} />
              </dd>
            </div>
            {ref && (
              <div className="rc-row">
                <dt>
                  رقم العملية
                  {r.txn && <CopyBtn value={r.txn} />}
                </dt>
                <dd>
                  <TxnRef value={ref} />
                </dd>
              </div>
            )}
            <div className="rc-row">
              <dt>تاريخ الدفع</dt>
              <dd>{dayDate(r.paidOn)}</dd>
            </div>
            {
              <>
                <div className="rc-row is-top">
                  <dt>الإثبات</dt>
                  <dd>
                    <Proof path={r.proofPath} />
                  </dd>
                </div>
                {r.recordedBy && (
                  <div className="rc-row">
                    <dt>سجّلها</dt>
                    <dd>
                      {r.recordedBy}
                      {r.recordedAt && (
                        <span className="rc-sub">
                          {dayWords(r.recordedAt)} <span aria-hidden="true">·</span>{" "}
                          <Num>{clock(r.recordedAt)}</Num>
                        </span>
                      )}
                    </dd>
                  </div>
                )}
              </>
            }
          </dl>

          <StatusBlock r={r} press={press} />

          {r.code && (
            // committee-only app: the code as plain text, no QR and no link (2026-09-30)
            <footer className="rc-foot is-pub">
              <div>
                <span className="rc-k">رمز الوصل</span>
                <p className="rc-code">
                  <Num>{r.code}</Num>
                </p>
              </div>
            </footer>
          )}
        </div>
      </div>
      {children}
    </article>
  );
}
