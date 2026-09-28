"use client";
// The payment receipt («وصل استلام»), the association rubber stamp and the compact confirmed
// mark. Styles: `rc-` in globals.css. Two audiences: public (masked ref, no proof/recorder/QR)
// and committee (everything).
import Image from "next/image";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAct } from "./act";
import { METHOD_LABELS, methodLogo } from "@/lib/methods";
import { qrMatrix } from "@/lib/qr";
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
import { I } from "./icons";
import { verifyPath, type ReceiptView } from "./receipt-model";

function Num({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={`rc-num ${className}`}>
      {children}
    </bdi>
  );
}

/* ═══════════════════════════ THE STAMP ═══════════════════════════
   viewBox 200: outer ring r95, thin ring r89.5, inner ring r63; rim text on arcs r73.45 / r79.15;
   separators (stars) at the gaps' midpoints; a dater band across the middle. */
const C = 100;
const arc = (r: number, sweep: 0 | 1) => `M ${C - r} ${C} A ${r} ${r} 0 0 ${sweep} ${C + r} ${C}`;
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
  className = "",
}: {
  variant?: "confirmed" | "rejected";
  date: string;
  size?: number;
  press?: boolean;
  seed?: number;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const top = `rct${uid}`;
  const bot = `rcb${uid}`;
  const ink = `rci${uid}`;
  const word = variant === "rejected" ? "مرفوض" : "مؤكَّد";
  return (
    <span
      className={`rc-stamp ${variant === "rejected" ? "is-rej" : ""} ${press ? "is-press" : ""} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`ختم ${ASSOC}: ${word} ${dayDate(date)}`}
    >
      <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden="true">
        <defs>
          <path id={top} d={arc(73.45, 1)} />
          <path id={bot} d={arc(79.15, 0)} />
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
          <g style={{ fontFamily: "var(--font-display)" }} fontWeight="700" fontSize="13">
            <text>
              <textPath href={`#${top}`} startOffset="50%" textAnchor="middle">
                {ASSOC}
              </textPath>
            </text>
            <text>
              <textPath href={`#${bot}`} startOffset="50%" textAnchor="middle">
                {FUND}
              </textPath>
            </text>
          </g>
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
            أمين الصندوق
          </text>
        </g>
      </svg>
    </span>
  );
}

/** Compact seal for list rows: ~24px mark + «مؤكَّد · 28 سبتمبر». */
export function ConfirmedMark({ date, size = 24 }: { date: string; size?: number }) {
  return (
    <span className="rc-mark">
      <svg viewBox="0 0 28 28" width={size} height={size} aria-hidden="true">
        <circle cx="14" cy="14" r="12.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle
          cx="14"
          cy="14"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeWidth=".8"
          strokeDasharray="1.2 1.6"
        />
        <path
          d="m9.6 14.3 3 3 5.8-6.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>
        مؤكَّد <span aria-hidden="true">·</span> {dayWords(date)}
      </span>
    </span>
  );
}

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
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {});
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
function ShotMock({ amount, method, large }: { amount: number; method: string; large?: boolean }) {
  return (
    <svg viewBox="0 0 90 160" className={large ? "rc-shot-l" : "rc-shot"} aria-hidden="true">
      <rect width="90" height="160" rx="10" fill="#F2F4F3" />
      <rect width="90" height="34" rx="10" fill="#1A5F2E" />
      <rect y="24" width="90" height="10" fill="#1A5F2E" />
      <text
        x="45"
        y="22"
        textAnchor="middle"
        fill="#fff"
        fontSize="9"
        fontWeight="700"
        fontFamily="system-ui"
      >
        {method}
      </text>
      <circle cx="45" cy="56" r="11" fill="#CFE7D4" />
      <path
        d="m40 56 3.5 3.5 6.5-7"
        stroke="#237A3B"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="45"
        y="86"
        textAnchor="middle"
        fill="#14201A"
        fontSize="12"
        fontWeight="700"
        fontFamily="system-ui"
      >
        {`${Math.round(amount / 10)} MRU`}
      </text>
      {[98, 108, 118, 128].map((y, i) => (
        <rect key={y} x="14" y={y} width={i % 2 ? 46 : 62} height="4" rx="2" fill="#CDD5D0" />
      ))}
    </svg>
  );
}

/** Committee only: the transfer screenshot (signed URL, 5 min), tap to enlarge. */
export function Proof({
  path,
  amount,
  method,
}: {
  path: string | null;
  amount: number;
  method: ReceiptView["method"];
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const { proofUrl } = useAct();
  useEffect(() => {
    if (!path) return;
    let live = true;
    proofUrl({ path })
      .then((r) => live && r.ok && setSrc(safeReceiptSrc(r.data)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [path, proofUrl]);
  if (!path) return <span className="rc-sub">لا توجد صورة</span>;
  const label = METHOD_LABELS[method];
  return (
    <>
      <button
        type="button"
        className="rc-proof bq-press"
        onClick={() => dlg.current?.showModal()}
        aria-haspopup="dialog"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={src} alt="" className="rc-shot" />
        ) : (
          <ShotMock amount={amount} method={label} />
        )}
        <span className="rc-proof-t">
          <span>صورة التحويل</span>
          <span className="rc-proof-s">{I.expand(16)} اضغط للتكبير</span>
        </span>
      </button>
      <dialog
        ref={dlg}
        className="rc-dlg"
        aria-label="صورة التحويل"
        onClick={(e) => e.target === e.currentTarget && dlg.current?.close()}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={src} alt="صورة التحويل" className="rc-shot-l" />
        ) : (
          <>
            <ShotMock amount={amount} method={label} large />
            <p className="rc-dlg-n">تعذّر تحميل الصورة الآن. حاول مرة أخرى بعد الاتصال.</p>
          </>
        )}
        <button
          type="button"
          className="bq-btn bq-btn-soft bq-press"
          onClick={() => dlg.current?.close()}
        >
          إغلاق
        </button>
      </dialog>
    </>
  );
}

const noop = () => () => {};
function Qr({ code }: { code: string }) {
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );
  if (!origin) return <span className="rc-qr" aria-hidden="true" />;
  const mx = qrMatrix(origin + verifyPath(code));
  const n = mx.length;
  let d = "";
  mx.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x} ${y}h1v1h-1z`)));
  return (
    <a href={verifyPath(code)} aria-label="افتح صفحة التحقق من الوصل">
      <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} className="rc-qr" aria-hidden="true">
        <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
        <path d={d} fill="currentColor" shapeRendering="crispEdges" />
      </svg>
    </a>
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
      <div className="rc-st-body">
        <span className="rc-st-ico is-void">{I.ban(22)}</span>
        <div>
          <p className="rc-st-h">أُلغي هذا الوصل</p>
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
      {(st.kind === "confirmed" || st.kind === "rejected") && (
        <Stamp
          variant={st.kind}
          date={st.at}
          press={press}
          seed={Number((r.no ?? "").slice(-2)) || 3}
          className="rc-st-stamp"
        />
      )}
    </section>
  );
}

export function Receipt({
  r,
  press = false,
  audience = "committee",
  children,
}: {
  r: ReceiptView;
  press?: boolean;
  audience?: "public" | "committee";
  children?: ReactNode;
}) {
  const pub = audience === "public";
  const void_ = r.status.kind === "rejected" || r.status.kind === "cancelled";
  const multi = r.covers.length > 1;
  const ref = pub ? r.txnLast4 : r.txn;
  return (
    <article className="rc" aria-label={`وصل استلام${r.no ? ` رقم ${r.no}` : ""}`}>
      <div className={`rc-shadow ${press ? "is-impact" : ""}`}>
        <div className={`rc-paper ${void_ ? "is-void" : ""}`}>
          <header className="rc-head">
            <span className="rc-logo">
              <Image src="/logo.jpg" alt="" width={44} height={44} />
            </span>
            <span className="rc-org">
              <strong>{ASSOC}</strong>
              <span>{FUND}</span>
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
                      {(multi || c.name !== r.payer) && (
                        <span className="rc-for">عن: {c.name}</span>
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
                  {!pub && r.txn && <CopyBtn value={r.txn} />}
                </dt>
                <dd>
                  {pub ? (
                    <bdi dir="ltr" className="rc-txn-v" aria-label={`ينتهي بـ ${ref}`}>
                      •••• {ref}
                    </bdi>
                  ) : (
                    <TxnRef value={ref} />
                  )}
                </dd>
              </div>
            )}
            <div className="rc-row">
              <dt>تاريخ الدفع</dt>
              <dd>{dayDate(r.paidOn)}</dd>
            </div>
            {!pub && (
              <>
                <div className="rc-row is-top">
                  <dt>الإثبات</dt>
                  <dd>
                    <Proof path={r.proofPath} amount={r.amount} method={r.method} />
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
            )}
          </dl>

          <StatusBlock r={r} press={press} />

          {r.code && (
            <footer className={`rc-foot ${pub ? "is-pub" : ""}`}>
              <div>
                <span className="rc-k">رمز التحقق</span>
                <p className="rc-code">
                  <Num>{r.code}</Num>
                </p>
                <p className="rc-foot-n">
                  {pub ? "أعطِ هذا الرمز للجنة إن سُئلت عن دفعتك" : "امسح الرمز للتحقق من الوصل"}
                </p>
              </div>
              {!pub && (
                <figure className="rc-qr-w">
                  <Qr code={r.code} />
                  <figcaption>امسح للتحقق</figcaption>
                </figure>
              )}
            </footer>
          )}
        </div>
      </div>
      {children}
    </article>
  );
}
