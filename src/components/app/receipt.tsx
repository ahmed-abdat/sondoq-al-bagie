"use client";
// The transfer picture (Proof), the association rubber stamp and the compact confirmed mark.
// No receipts (owner). Styles: `rc-` in globals.css.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useAct } from "./act";
import { safeReceiptSrc } from "@/lib/receipt";
import { ASSOC, dayDate, dotDate } from "./derive";
import { RIM_BOTTOM, RIM_TOP } from "./stamp-rim";
import { I } from "./icons";
import type { ReceiptView } from "./receipt-model";

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
