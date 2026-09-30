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
import type { PCampaign, PData, PHist, PLevy, PMember } from "./types";

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
export const groupLetter = (g: string) => (g === "A" ? "أ" : "ب");
export const refLabel = (ref: string) => {
  const [g, n] = ref.split("-");
  return `${groupLetter(g)} ${n}`;
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
/** One line of 12 cells for list rows (headers are the month numbers above the list). */
export function MonthStrip({ m }: { m: PMember }) {
  return (
    <span className="pa-strip" aria-label={payStatus(m)}>
      {Array.from({ length: 12 }, (_, k) => (
        <span key={k}>{m.paid.includes(k + 1) ? "✓" : ""}</span>
      ))}
    </span>
  );
}
export function StripHead() {
  return (
    <span className="pa-strip pa-strip-head" aria-hidden="true">
      {Array.from({ length: 12 }, (_, k) => (
        <span key={k}>{k + 1}</span>
      ))}
    </span>
  );
}

/** A fictional wallet screenshot (drawn, not a real image). */
export function FakeShot({ small }: { small?: boolean }) {
  return (
    <div className={`pa-shot ${small ? "pa-shot-sm" : ""}`} aria-label="صورة التحويل (تجريبية)">
      <div className="pa-shot-top">
        <Wallet method="bankily" size={small ? 20 : 26} />
        <span>14:03</span>
      </div>
      <div className="pa-shot-ok">{I.check(small ? 20 : 30)}</div>
      <b className="pa-shot-t">تم التحويل بنجاح</b>
      <span className="pa-shot-amt">
        <Num>300 MRU</Num>
      </span>
      {!small && (
        <dl className="pa-shot-dl">
          <dt>إلى</dt>
          <dd>
            <Num>22200000011</Num>
          </dd>
          <dt>من</dt>
          <dd>{OCR.sender}</dd>
          <dt>رقم العملية</dt>
          <dd>
            <Num>{OCR.txn}</Num>
          </dd>
          <dt>التاريخ</dt>
          <dd>
            <Num>28/09/2026</Num>
          </dd>
        </dl>
      )}
    </div>
  );
}
/** What the OCR "reads" from the fictional screenshot. */
export const OCR = {
  amount: 3000,
  mru: 300,
  method: "bankily" as Method,
  txn: "26092814031952",
  date: "2026-09-28",
  sender: "الحسن ولد أحمد",
};

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

/* ───────── record state (shared logic; each direction draws its own flow) ───────── */
export type Rec = ReturnType<typeof useRecord>;
export function useRecord(init: { ref?: string; cash?: boolean; campaign?: string }) {
  const { d } = useP();
  const [shot, setShot] = useState<"none" | "reading" | "read">("none");
  const [cash, setCash] = useState(!!init.cash);
  const [method, setMethod] = useState<Method>(init.cash ? "cash" : "bankily");
  const [ref, setRef] = useState<string | null>(init.ref ?? null);
  const [months, setMonths] = useState<number[]>(() => {
    const m = d.members.find((x) => x.ref === init.ref);
    return m ? m.owed.slice(0, 1) : [];
  });
  const [campaign, setCampaign] = useState<string | null>(init.campaign ?? null);
  const [giftAmount, setGiftAmount] = useState(init.campaign ? "" : "");
  const [giftName, setGiftName] = useState("");
  const [saved, setSaved] = useState(false);
  const member = d.members.find((m) => m.ref === ref) ?? null;
  const pickMember = (r: string, n?: number) => {
    setRef(r);
    const m = d.members.find((x) => x.ref === r);
    // oldest owed months first; after a screenshot, as many as the amount covers
    const k = n ?? (shot === "read" && m ? Math.max(1, Math.round(OCR.amount / m.fee)) : 1);
    setMonths(m ? [...m.owed, ...upcoming(m)].slice(0, k) : []);
  };
  const readShot = () => {
    setShot("reading");
    setCash(false);
    setMethod(OCR.method);
    setTimeout(() => {
      setShot("read");
      if (member)
        setMonths(
          [...member.owed, ...upcoming(member)].slice(0, Math.round(OCR.amount / member.fee)),
        );
    }, 650);
  };
  const toggleMonth = (k: number) =>
    setMonths((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k].sort((a, b) => a - b)));
  const amount = campaign
    ? Number(giftAmount) || (shot === "read" ? OCR.amount : 0)
    : member
      ? months.length * member.fee
      : 0;
  const mismatch = !campaign && shot === "read" && member && amount !== OCR.amount;
  const suggestion =
    shot === "read" ? (d.members.find((m) => m.name === OCR.sender) ?? null) : null;
  return {
    shot,
    readShot,
    cash,
    setCash: (c: boolean) => {
      setCash(c);
      setMethod(c ? "cash" : "bankily");
      if (c) setShot("none");
    },
    method,
    setMethod,
    ref,
    member,
    pickMember,
    clearMember: () => {
      setRef(null);
      setMonths([]);
    },
    months,
    toggleMonth,
    campaign,
    setCampaign,
    giftAmount,
    setGiftAmount,
    giftName,
    setGiftName,
    amount,
    mismatch,
    suggestion,
    saved,
    setSaved,
    campaignObj: d.campaigns.find((c) => c.id === campaign) ?? null,
  };
}
export const upcoming = (m: PMember) =>
  Array.from({ length: 12 }, (_, k) => k + 1).filter(
    (k) => !m.paid.includes(k) && !m.owed.includes(k) && !m.notOwed.includes(k),
  );

/** Month picker for the record flow: ✓ on the chosen months, paid months locked, no tints. */
export function MonthPick({ r }: { r: Rec }) {
  const m = r.member;
  if (!m) return null;
  return (
    <div className="pa-mpick" role="group" aria-label="الأشهر">
      {MONTHS_AR.map((name, i) => {
        const k = i + 1;
        const paid = m.paid.includes(k);
        const na = m.notOwed.includes(k);
        const on = r.months.includes(k);
        return (
          <button
            key={name}
            type="button"
            disabled={paid || na}
            aria-pressed={on}
            className={on ? "on" : ""}
            onClick={() => r.toggleMonth(k)}
          >
            <span>{name}</span>
            <b>{paid ? "دُفع" : on ? "✓" : ""}</b>
          </button>
        );
      })}
    </div>
  );
}

/** Member search (name or paper number); recent names first when empty. */
export function MemberSearch({
  onPick,
  autoFocus,
  lateFirst,
}: {
  onPick: (ref: string) => void;
  autoFocus?: boolean;
  lateFirst?: boolean;
}) {
  const { d } = useP();
  const [q, setQ] = useState("");
  const active = d.members.filter((m) => m.status === "active");
  const list = q.trim()
    ? findMembers(active, q)
    : lateFirst
      ? active.filter(isLate).slice(0, 5)
      : ["A-9", "B-8", "A-1", "B-27"].flatMap((r) => active.filter((m) => m.ref === r));
  return (
    <div className="pa-msearch">
      <label className="pa-search">
        {I.search(22)}
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="اسم العضو أو رقمه، مثل ب 12"
          aria-label="ابحث عن العضو"
        />
      </label>
      {!q && <p className="pa-hint">{lateFirst ? "عليهم رسوم" : "آخر من سجّلت لهم"}</p>}
      <ul className="pa-rows">
        {list.slice(0, 8).map((m) => (
          <li key={m.ref}>
            <button type="button" className="pa-row" onClick={() => onPick(m.ref)}>
              <Avatar refs={m.ref} />
              <span className="pa-row-t">
                <b>{m.name}</b>
                <small>{payStatus(m)}</small>
              </span>
              {X.go(20)}
            </button>
          </li>
        ))}
        {!list.length && <li className="pa-empty">لا أحد بهذا الاسم. جرّب رقمه في الورقة.</li>}
      </ul>
    </div>
  );
}

/** The receipt after saving (image to share on WhatsApp; no link, no QR). */
export function ReceiptCard({ r, amount, about }: { r: Rec; amount?: number; about?: string }) {
  const { d } = useP();
  const gift = !!r.campaignObj;
  return (
    <div className="pa-receipt">
      <div className="pa-receipt-h">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="" width={40} height={40} />
        <span>
          <b>وصل استلام</b>
          <small>
            رقم <Num>2026-0232</Num>
          </small>
        </span>
      </div>
      <p className="pa-receipt-who">
        {gift ? r.giftName || r.member?.name || "فاعل خير" : r.member?.name}
      </p>
      <p className="pa-receipt-amt">
        <Money v={amount ?? r.amount} />
      </p>
      <dl className="pa-dl">
        <dt>عن</dt>
        <dd>
          {about
            ? about
            : gift
              ? `مساهمة في ${r.campaignObj!.title}`
              : `رسوم ${monthsWords(r.months)} ${d.year}`}
        </dd>
        <dt>كيف دفع</dt>
        <dd>
          <Wallet method={r.method} size={22} />
        </dd>
        <dt>التاريخ</dt>
        <dd>28 سبتمبر 2026</dd>
        <dt>استلمها</dt>
        <dd>{d.me.name}</dd>
      </dl>
    </div>
  );
}

/* ───────── report previews (paper look, shared by the three report hubs) ───────── */
export type ReportKind = "month" | "grid" | "late" | "expenses" | "campaign" | "year" | "member";
export const REPORTS: { k: ReportKind; t: string; s: string; icon: keyof typeof X }[] = [
  { k: "month", t: "ملخص", s: "ما دخل وما صُرف وما بقي، للسنة أو لشهر", icon: "chart" },
  { k: "grid", t: "جدول الأشهر", s: "كل عضو وأشهره، مثل الورقة", icon: "grid" },
  { k: "late", t: "المتأخرات", s: "الأسماء والأشهر فقط، بلا مبالغ", icon: "clock" },
  { k: "expenses", t: "المصاريف", s: "كل مصروف في الفترة ومجموعها", icon: "bag" },
  { k: "campaign", t: "تقرير حملة", s: "الهدف وما جُمع ومن ساهم", icon: "heart" },
  { k: "year", t: "ملخص السنة", s: "كل شهر، والرصيد في البداية والنهاية", icon: "book" },
  { k: "member", t: "كشف عضو", s: "أشهر عضو واحد ودفعاته", icon: "user" },
];
export const PERIODS = [
  { k: "this", l: "هذا الشهر" },
  { k: "last", l: "أغسطس" },
  { k: "year", l: "سنة 2026" },
  { k: "term", l: "الدورة 2" },
  { k: "range", l: "من… إلى…" },
] as const;
export type PeriodK = (typeof PERIODS)[number]["k"];
export const periodLabel = (p: PeriodK) =>
  p === "this"
    ? "سبتمبر 2026"
    : p === "last"
      ? "أغسطس 2026"
      : p === "year"
        ? "سنة 2026"
        : p === "term"
          ? "الدورة 2 (منذ يناير 2026)"
          : "من 1 يوليو إلى 28 سبتمبر 2026";

export function ReportPaper({
  kind,
  period,
  campaign,
  member,
  compact,
  span,
}: {
  kind: ReportKind;
  period: PeriodK;
  /** round 2 (owner): a year by default, or one month of a year */
  span?: { year: number; month: number | null };
  campaign?: PCampaign;
  member?: PMember;
  compact?: boolean;
}) {
  const { d } = useP();
  const title = REPORTS.find((r) => r.k === kind)!.t;
  const active = d.members.filter((m) => m.status === "active");
  const paidThisMonth = active.filter((m) => m.paid.includes(9)).length;
  return (
    <article className={`pa-paper ${compact ? "pa-paper-sm" : ""}`} aria-label={`معاينة: ${title}`}>
      <header className="pa-paper-h">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="" width={36} height={36} />
        <span>
          <b>تقرير صندوق رابطة شباب البقيع</b>
          <small>
            {title} ·{" "}
            {kind === "campaign" && campaign
              ? campaign.title
              : kind === "member" && member
                ? `${member.name} · ${span?.year ?? d.year}`
                : span
                  ? span.month
                    ? `${month(span.month)} ${span.year}`
                    : `سنة ${span.year}`
                  : periodLabel(period)}
          </small>
        </span>
      </header>
      {kind === "month" &&
        (() => {
          const yearly = span ? span.month === null : period === "year" || period === "term";
          const w = yearly ? "السنة" : "الشهر";
          return (
            <>
              <dl className="pa-sum">
                <dt>في الصندوق أول {w}</dt>
                <dd>
                  <Money v={yearly ? d.opening : d.balance - d.monthIn + d.monthOut} />
                </dd>
                <dt>دخل</dt>
                <dd>
                  <Money v={yearly ? d.collectedYear : d.monthIn} sign="+" />
                </dd>
                <dt>صُرف</dt>
                <dd>
                  <Money v={yearly ? d.spentYear : d.monthOut} sign="−" />
                </dd>
                <dt className="pa-sum-total">في الصندوق آخر {w}</dt>
                <dd className="pa-sum-total">
                  <Money v={d.balance} />
                </dd>
              </dl>
              {!yearly && (
                <p className="pa-paper-note">
                  دفع رسوم الشهر <Num>{paidThisMonth}</Num> عضوًا.
                </p>
              )}
            </>
          );
        })()}
      {(kind === "grid" || kind === "late") && (
        <table className="pa-ptable">
          <thead>
            <tr>
              <th>الاسم</th>
              {kind === "grid" ? (
                Array.from({ length: 12 }, (_, k) => <th key={k}>{k + 1}</th>)
              ) : (
                <th>الأشهر الباقية</th>
              )}
            </tr>
          </thead>
          <tbody>
            {(kind === "grid" ? active : active.filter(isLate))
              .slice(0, compact ? 6 : 14)
              .map((m) => (
                <tr key={m.ref}>
                  <td>
                    <Num>{refLabel(m.ref)}</Num> {m.name}
                  </td>
                  {kind === "grid" ? (
                    Array.from({ length: 12 }, (_, k) => (
                      <td key={k} className="pa-tick">
                        {m.paid.includes(k + 1) ? "✓" : ""}
                      </td>
                    ))
                  ) : (
                    <td>{monthsWords(m.owed)}</td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      )}
      {kind === "expenses" && (
        <>
          <ul className="pa-plist">
            {d.expenses.slice(0, compact ? 3 : 6).map((e) => (
              <li key={e.id}>
                <span>
                  {e.note}
                  <small>
                    {day(e.at)} ·{" "}
                    {e.campaign
                      ? d.campaigns.find((c) => c.id === e.campaign)?.title
                      : CATEGORY[e.category]}
                  </small>
                </span>
                <Money v={e.amount} unit={false} />
              </li>
            ))}
          </ul>
          <p className="pa-paper-total">
            المجموع <Money v={d.expenses.reduce((s, e) => s + e.amount, 0)} />
          </p>
        </>
      )}
      {kind === "campaign" && campaign && (
        <>
          <dl className="pa-sum">
            <dt>الهدف</dt>
            <dd>
              <Money v={campaign.target} />
            </dd>
            <dt>جُمع</dt>
            <dd>
              <Money v={campaign.collected} />
            </dd>
            <dt>صُرف</dt>
            <dd>
              <Money v={campaign.spent} />
            </dd>
            <dt className="pa-sum-total">بقي في الحملة</dt>
            <dd className="pa-sum-total">
              <Money v={campaign.collected - campaign.spent} />
            </dd>
          </dl>
          <ul className="pa-plist">
            {campaign.gifts.slice(0, compact ? 3 : 8).map((g, i) => (
              <li key={i}>
                <span>
                  {g.name}
                  <small>{day(g.at)}</small>
                </span>
                <Money v={g.amount} unit={false} />
              </li>
            ))}
          </ul>
        </>
      )}
      {kind === "year" && (
        <>
          <div className="pa-ybars" aria-hidden="true">
            {d.monthly.map((m) => (
              <span key={m.month}>
                <i style={{ transform: `scaleY(${m.collected / m.expected})` }} />
                <small>{m.month}</small>
              </span>
            ))}
          </div>
          <dl className="pa-sum">
            <dt>في الصندوق أول السنة</dt>
            <dd>
              <Money v={d.opening} />
            </dd>
            <dt>جُمع</dt>
            <dd>
              <Money v={d.collectedYear} sign="+" />
            </dd>
            <dt>صُرف</dt>
            <dd>
              <Money v={d.spentYear} sign="−" />
            </dd>
            <dt className="pa-sum-total">في الصندوق الآن</dt>
            <dd className="pa-sum-total">
              <Money v={d.balance} />
            </dd>
          </dl>
        </>
      )}
      {kind === "member" && member && (
        <>
          <p className="pa-paper-note">
            {member.name} · رقم <Num>{refLabel(member.ref)}</Num> · الرسوم الشهرية{" "}
            <Money v={member.fee} />
          </p>
          <MonthGrid m={member} cols={compact ? 6 : 6} />
          <p className="pa-paper-note">{payStatus(member)}.</p>
        </>
      )}
    </article>
  );
}

/* ───────── prototype switcher (not part of the design) ───────── */
const RECORDERS = ["يحيى", "المختار", "سيدي محمد"];
export function memberHistory(m: PMember, d: PData): PHist[] {
  const out: PHist[] = [];
  const paid = [...m.paid].sort((a, b) => a - b);
  let i = 0;
  let n = 0;
  while (i < paid.length) {
    const size = n === 0 && paid.length >= 6 ? 3 : Math.min(3, paid.length - i);
    const ms = paid.slice(i, i + size);
    const last = ms[ms.length - 1];
    const methods: Method[] = n === 0 ? ["paper"] : ["bankily", "cash", "masrvi", "sedad"];
    out.push({
      at: `2026-${String(Math.min(9, last)).padStart(2, "0")}-${String(4 + ((m.no * 3 + n) % 20)).padStart(2, "0")}T10:00:00Z`,
      months: ms,
      amount: ms.length * m.fee,
      method: methods[(m.no + n) % methods.length],
      receiptNo: `2026-${String(100 + ((m.no * 7 + n * 13) % 130)).padStart(4, "0")}`,
      by: n === 0 ? "سيدي محمد" : RECORDERS[(m.no + n) % 3],
      okBy: null,
      state: "confirmed",
    });
    i += size;
    n++;
  }
  if (m.no % 4 === 2 && m.paid.length)
    out.push({
      at: "2026-09-27T18:40:00Z",
      months: m.paid.slice(-1),
      amount: m.fee,
      method: "bankily",
      receiptNo: `2026-${String(200 + m.no).padStart(4, "0")}`,
      by: "يحيى",
      okBy: null,
      state: "cancelled",
      reason: "سُجّلت مرتين",
    });
  for (const l of d.levies)
    if (l.paidRefs.includes(m.ref))
      out.push({
        at: `${l.createdOn}T15:00:00Z`,
        months: [],
        amount: l.perMember,
        method: "cash",
        receiptNo: `2026-${String(140 + (m.no % 60)).padStart(4, "0")}`,
        by: "المختار",
        okBy: null,
        state: "confirmed",
        levy: l.title,
      });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
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
