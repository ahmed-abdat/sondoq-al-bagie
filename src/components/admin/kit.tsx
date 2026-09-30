"use client";
// PROTOTYPE (throwaway): shared pieces for the three directions. Each direction owns its own
// home, record flow, campaigns and reports layout; only small parts and the plainer screens
// (members, one member, late, expenses, more) live here.
import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { searchMembers } from "@/components/app/derive";
import { I } from "@/components/app/icons";
import { radioKeys, radioTab } from "@/components/app/radio-keys";
import { Sheet as AppSheet } from "@/components/app/sheet";
import { formatNumber } from "@/lib/format";
import { MONTHS_AR } from "@/lib/dates";
import { METHOD_LABELS, methodLogo, type Method } from "@/lib/methods";
import { feesTotal, payablePast } from "./fees";
import type { PData, PLevy, PMember } from "./types";

/* ───────── context ───────── */
type Ctx = {
  d: PData;
  q: Record<string, string | undefined>;
  href: (path: string, extra?: Record<string, string>) => string;
  snack: (msg: string) => void;
};
const C = createContext<Ctx | null>(null);
export const useP = () => useContext(C)!;

/** Committee routes: "" → /committee, "members/A-9" → /committee/members/A-9. */
export const committeeHref = (path: string, extra: Record<string, string> = {}) => {
  const qs = new URLSearchParams(extra).toString();
  return `/committee${path ? `/${path}` : ""}${qs ? `?${qs}` : ""}`;
};

export function Provider({ d, q, children }: { d: PData; q: Ctx["q"]; children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  const ctx = useMemo<Ctx>(() => ({ d, q, href: committeeHref, snack: setMsg }), [d, q]);
  return (
    <C.Provider value={ctx}>
      {children}
      {msg && (
        <div className="pa-snack" role="status">
          {msg}
        </div>
      )}
    </C.Provider>
  );
}

export const fmt = formatNumber;
export const month = (m: number) => MONTHS_AR[m - 1];
export function Num({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={`pa-num ${className}`}>
      {children}
    </bdi>
  );
}
export function Money({ v, unit = true, sign }: { v: number; unit?: boolean; sign?: "+" | "−" }) {
  return (
    <span className="pa-money">
      <Num>
        {sign ?? ""}
        {fmt(v)}
      </Num>
      {unit && <span className="pa-unit"> أوقية</span>}
    </span>
  );
}
export const refLabel = (ref: string) => {
  const [g, n] = ref.split("-");
  return `${g === "A" ? "أ" : "ب"} ${n}`;
};
/** «من يوليو إلى سبتمبر» / «يوليو وسبتمبر» / «سبتمبر». */
export function monthsWords(ms: number[]): string {
  const s = [...ms].sort((a, b) => a - b);
  if (!s.length) return "";
  if (s.length === 1) return month(s[0]);
  const contiguous = s.every((m, i) => i === 0 || m === s[i - 1] + 1);
  if (contiguous) return `من ${month(s[0])} إلى ${month(s[s.length - 1])}`;
  if (s.length === 2) return `${month(s[0])} و${month(s[1])}`;
  return `${s.slice(0, -1).map(month).join("، ")} و${month(s[s.length - 1])}`;
}
/** One status phrase, like phone credit «صالح حتى» (UX-PATTERNS P1). */
export function payStatus(m: PMember): string {
  if (m.status === "exempt") return "معفى من الرسوم";
  if (m.status === "left") return "غادر الرابطة";
  if (m.paid.length === 12) return "دفع السنة كاملة";
  const start = m.notOwed.length ? Math.max(...m.notOwed) + 1 : 1;
  let last = 0;
  for (let k = start; k <= 12 && m.paid.includes(k); k++) last = k;
  if (!last && !m.paid.length) return "لم يدفع هذا العام";
  if (!last) return `دفع ${monthsWords(m.paid)}`;
  return `دفع حتى ${month(last)}`;
}
/** Name, or the paper number in any form: «ب 2», «ب2», «B-2», «2», «٢». */
export const findMembers = (list: PMember[], q: string): PMember[] =>
  searchMembers(
    list.map((m) => ({ fullName: m.name, number: m.no, memberRef: m.ref, m })),
    q,
  ).map((x) => x.m);
export const isLate = (m: PMember) =>
  m.status === "active" && (m.owed.length > 0 || m.pastLate.length > 0);
export const day = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${month(d.getUTCMonth() + 1)}`;
};
export const CATEGORY: Record<string, string> = {
  teaching: "التدريس",
  honoring: "التكريم",
  sports: "الرياضة",
  other: "أخرى",
};
/* ───────── icons not in the app set (same 24px / 1.5 stroke family) ───────── */
function Svg({ children, s = 24 }: { children: ReactNode; s?: number }) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
export const X = {
  ...I,
  share: (s?: number) => (
    <Svg s={s}>
      <path d="M12 15V4M8 7.5 12 4l4 3.5" />
      <path d="M6 12H5v8h14v-8h-1" />
    </Svg>
  ),
  pdf: (s?: number) => (
    <Svg s={s}>
      <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5z" />
      <path d="M14 3.5V8h4M9 13h6M9 16.5h4" />
    </Svg>
  ),
  chart: (s?: number) => (
    <Svg s={s}>
      <path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" />
    </Svg>
  ),
  grid: (s?: number) => (
    <Svg s={s}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9.5h16M4 14.5h16M9.5 4v16M14.5 4v16" />
    </Svg>
  ),
  gear: (s?: number) => (
    <Svg s={s}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6" />
    </Svg>
  ),
  hand: (s?: number) => (
    <Svg s={s}>
      <path d="M3.5 14.5 7 12h5a1.5 1.5 0 0 1 0 3H9.5M12 15h4l3.5-3a1.4 1.4 0 0 1 1.5 2.3L16 19H8l-4.5-2" />
      <path d="M15 4.5v5M12.5 7h5" />
    </Svg>
  ),
  user: (s?: number) => (
    <Svg s={s}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </Svg>
  ),
  list: (s?: number) => (
    <Svg s={s}>
      <path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />
    </Svg>
  ),
  edit: (s?: number) => (
    <Svg s={s}>
      <path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-3-3l-10 10z" />
    </Svg>
  ),
  wallet: (s?: number) => (
    <Svg s={s}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
      <rect x="4" y="8" width="16" height="11" rx="2" />
      <path d="M16 13.5h.01" />
    </Svg>
  ),
};

/* ───────── small parts ───────── */
export function Avatar({ refs, tone }: { refs: string; tone?: "g" | "gold" }) {
  return <span className={`pa-av ${tone ? `pa-av-${tone}` : ""}`}>{refLabel(refs)}</span>;
}
export function Wallet({ method, size = 28 }: { method: Method; size?: number }) {
  const logo = methodLogo(method);
  return (
    <span className="pa-wallet">
      <span className="pa-wallet-tile" style={{ width: size, height: size }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" width={size} height={size} />
        ) : (
          X.cash(Math.round(size * 0.7))
        )}
      </span>
      {METHOD_LABELS[method]}
    </span>
  );
}
export function Bar({ value, max, gold }: { value: number; max: number; gold?: boolean }) {
  const p = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <span className={`pa-bar ${gold ? "pa-bar-gold" : ""}`} aria-hidden="true">
      <span style={{ transform: `scaleX(${p})` }} />
    </span>
  );
}

/** Months of the year: a plain ✓ in paid months, otherwise an empty cell. Nothing else. */
export function MonthGrid({ m, cols = 6 }: { m: PMember; cols?: 4 | 6 | 12 }) {
  return (
    <div className={`pa-mgrid pa-mgrid-${cols}`} role="table" aria-label="أشهر السنة">
      {MONTHS_AR.map((name, i) => (
        <div key={name} className="pa-mcell" role="cell">
          <span className="pa-mname">{name}</span>
          <span className="pa-mtick" aria-label={m.paid.includes(i + 1) ? "مدفوع" : "فارغ"}>
            {m.paid.includes(i + 1) ? "✓" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
/**
 * A bottom sheet (dialog on desktop) with a visible title: the app's accessible sheet (focus
 * trap, Escape, focus back to the opener) with the committee app's inner layout.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  foot,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  foot?: ReactNode;
}) {
  if (!open) return null;
  return (
    <AppSheet label={title} onDone={onClose}>
      <div className="pa-sheet-in">
        <h2 className="pa-sheet-t">{title}</h2>
        <div className="pa-sheet-b">{children}</div>
        {foot && <div className="pa-sheet-f">{foot}</div>}
      </div>
    </AppSheet>
  );
}

export function Seg<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { k: T; l: string }[];
  label: string;
}) {
  return (
    <div className="pa-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.k}
          type="button"
          role="radio"
          aria-checked={value === o.k}
          className={value === o.k ? "on" : ""}
          onClick={() => onChange(o.k)}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { k: T; l: string }[];
  label: string;
}) {
  return (
    <div className="pa-chips" role="radiogroup" aria-label={label} onKeyDown={radioKeys}>
      {options.map((o, i) => (
        <button
          key={o.k}
          type="button"
          role="radio"
          aria-checked={value === o.k}
          tabIndex={radioTab(
            value === o.k,
            i,
            options.some((x) => x.k === value),
          )}
          className={`pa-chip ${value === o.k ? "on" : ""}`}
          onClick={() => onChange(o.k)}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function Back({ to, label = "رجوع" }: { to: string; label?: string }) {
  const { href } = useP();
  return (
    <Link href={href(to)} className="pa-back">
      {I.back(22)}
      {label}
    </Link>
  );
}

export const upcoming = (m: PMember) =>
  Array.from({ length: 12 }, (_, k) => k + 1).filter(
    (k) => !m.paid.includes(k) && !m.owed.includes(k) && !m.notOwed.includes(k),
  );

export const levyOwed = (m: PMember, d: PData): PLevy[] =>
  d.levies.filter(
    (l) => l.refs.includes(m.ref) && !l.paidRefs.includes(m.ref) && !l.exemptRefs?.includes(m.ref),
  );
/** One member's share of a levy (their own amount when the «مسؤول» changed it). */
export const levyShare = (l: PLevy, ref: string) => l.amounts?.[ref] ?? l.perMember;
export const owes = (m: PMember, d: PData) => isLate(m) || levyOwed(m, d).length > 0;
/** This year's late fees, earlier years' (each at its price) and open لوحة shares. */
export const feesOwed = (m: PMember, d: Pick<PData, "year">) =>
  feesTotal(m, d.year, m.owed, payablePast(m));
export const owedAmount = (m: PMember, d: PData) =>
  feesOwed(m, d) + levyOwed(m, d).reduce((s, l) => s + levyShare(l, m.ref), 0);
