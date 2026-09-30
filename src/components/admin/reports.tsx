"use client";
// «التقارير» (owner pick B3): a catalog in two groups («للمجموعة» / «للجنة»), one period button
// with a small sheet (years + 12 months + «السنة كلها»), then the report's real pages (Lane B
// renderers) and «صور لواتساب» · «PDF» · «نص». «الإحصاءات» opens its own screen.
import Link from "next/link";
import { useState } from "react";
import { MONTHS_AR } from "@/lib/dates";
import type { ReportReq } from "@/components/app/source";
import { month, Num, Sheet, useP, X } from "./kit";
import { MemberPicker, readRecent } from "./member-picker";
import { LoadedReport } from "./report-doc";
import "./reports3.css";

type K =
  | "annual"
  | "summary"
  | "grid"
  | "late"
  | "expenses"
  | "campaign"
  | "member"
  | "handover"
  | "wallets"
  | "work";
type Scope = "yearOrMonth" | "year" | "none" | "term";
const CATALOG: {
  g: "group" | "committee";
  k: K;
  t: string;
  s: string;
  icon: keyof typeof X;
  scope: Scope;
}[] = [
  {
    g: "group",
    k: "annual",
    t: "التقرير السنوي الكامل",
    s: "من رصيد أول السنة إلى رصيد آخرها، شهرًا بشهر",
    icon: "book",
    scope: "year",
  },
  {
    g: "group",
    k: "summary",
    t: "الملخص",
    s: "المداخيل والمصاريف والرصيد، لسنة أو لشهر",
    icon: "chart",
    scope: "yearOrMonth",
  },
  {
    g: "group",
    k: "grid",
    t: "جدول الأشهر",
    s: "كل عضو وأشهره، مثل الورقة",
    icon: "grid",
    scope: "year",
  },
  {
    g: "group",
    k: "late",
    t: "المتأخرات",
    s: "الأسماء والأشهر فقط، بلا مبالغ",
    icon: "clock",
    scope: "year",
  },
  {
    g: "group",
    k: "expenses",
    t: "المصاريف",
    s: "حسب النوع وحسب الشهر",
    icon: "bag",
    scope: "yearOrMonth",
  },
  {
    g: "group",
    k: "campaign",
    t: "تقرير تبرع أو لوحة",
    s: "ما جُمع ومن ساهم، أو من دفع نصيبه",
    icon: "heart",
    scope: "none",
  },
  {
    g: "group",
    k: "member",
    t: "كشف عضو",
    s: "أشهر عضو واحد ودفعاته في سنة",
    icon: "user",
    scope: "year",
  },
  {
    g: "committee",
    k: "handover",
    t: "تقرير التسليم",
    s: "ما تتسلّمه اللجنة الجديدة",
    icon: "hand",
    scope: "term",
  },
  {
    g: "committee",
    k: "wallets",
    t: "المبالغ حسب المحفظة",
    s: "المداخيل والمصاريف في كل محفظة، لمطابقة رصيدها",
    icon: "wallet",
    scope: "yearOrMonth",
  },
  {
    g: "committee",
    k: "work",
    t: "عمل اللجنة",
    s: "ما سجّله كل عضو في اللجنة، وما ألغاه",
    icon: "people",
    scope: "yearOrMonth",
  },
];
type Period = { year: number; month: number | null };
const periodText = (p: Period) => (p.month ? `${month(p.month)} ${p.year}` : `سنة ${p.year}`);

export function ReportsScreen() {
  const { d, q } = useP();
  const [k, setK] = useState<K | null>((CATALOG.find((c) => c.k === q.r)?.k as K) ?? null);
  const [period, setPeriod] = useState<Period>({ year: d.year, month: null });
  const firstOpen =
    d.campaigns.find((c) => c.status === "open")?.id ??
    d.levies.find((l) => l.status === "open")?.id ??
    d.campaigns[0]?.id ??
    d.levies[0]?.id ??
    "";
  const [subject, setSubject] = useState<string>(firstOpen);
  const [ref, setRef] = useState<string | null>(null);
  const [term, setTerm] = useState<number | null>(d.terms[0]?.number ?? null);
  const item = CATALOG.find((c) => c.k === k);
  if (!item) return <Catalog onPick={setK} />;
  const p: Period = item.scope === "yearOrMonth" ? period : { year: period.year, month: null };
  return (
    <Detail
      key={item.k}
      item={item}
      period={p}
      setPeriod={setPeriod}
      subject={subject}
      setSubject={setSubject}
      memberRef={ref}
      setMemberRef={setRef}
      term={term}
      setTerm={setTerm}
      onBack={() => setK(null)}
    />
  );
}

/* ───────── catalog ───────── */
function Catalog({ onPick }: { onPick: (k: K) => void }) {
  const { href } = useP();
  const group = (g: "group" | "committee", title: string, hint: string) => (
    <section className="r3-group" aria-labelledby={`r3-${g}`}>
      <div className="r3-group-h">
        <h2 id={`r3-${g}`}>{title}</h2>
        <p>{hint}</p>
      </div>
      <ul className="r3-list">
        {g === "group" && (
          <li>
            <Link href={href("stats")} className="r3-item">
              <span className="r3-ic">{X.chart(22)}</span>
              <span className="r3-item-t">
                <b>الإحصاءات</b>
                <small>نسب من دفع، بلا أسماء</small>
              </span>
              {X.go(20)}
            </Link>
          </li>
        )}
        {CATALOG.filter((c) => c.g === g).map((c) => (
          <li key={c.k}>
            <button type="button" className="r3-item" onClick={() => onPick(c.k)}>
              <span className={`r3-ic ${g === "committee" ? "r3-ic-n" : ""}`}>{X[c.icon](22)}</span>
              <span className="r3-item-t">
                <b>{c.t}</b>
                <small>{c.s}</small>
              </span>
              {X.go(20)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <div className="pa-page r3">
      <header className="pa-title">
        <h1>التقارير</h1>
      </header>
      {group("group", "للمجموعة", "تُرسل في مجموعة الواتساب")}
      {group("committee", "للجنة", "للمراجعة والتسليم، لا تُرسل للمجموعة")}
    </div>
  );
}

/* ───────── one report ───────── */
function Detail({
  item,
  period,
  setPeriod,
  subject,
  setSubject,
  memberRef,
  setMemberRef,
  term,
  setTerm,
  onBack,
}: {
  item: (typeof CATALOG)[number];
  period: Period;
  setPeriod: (p: Period) => void;
  subject: string;
  setSubject: (s: string) => void;
  memberRef: string | null;
  setMemberRef: (s: string) => void;
  term: number | null;
  setTerm: (n: number) => void;
  onBack: () => void;
}) {
  const { d } = useP();
  const [sheet, setSheet] = useState<null | "period" | "subject" | "member" | "term">(
    item.k === "member" && !memberRef ? "member" : null,
  );
  const camp = d.campaigns.find((c) => c.id === subject);
  const levy = d.levies.find((l) => l.id === subject);
  const member = memberRef ? d.members.find((m) => m.ref === memberRef) : undefined;
  const t = d.terms.find((x) => x.number === term);
  const req: ReportReq | null =
    item.k === "campaign"
      ? subject
        ? { kind: "campaign", id: subject }
        : null
      : item.k === "member"
        ? member
          ? { kind: "member", memberId: member.id, year: period.year }
          : null
        : item.k === "handover"
          ? term !== null
            ? { kind: "handover", term }
            : null
          : item.k === "grid" || item.k === "late"
            ? { kind: item.k, year: period.year }
            : {
                kind: item.k,
                year: period.year,
                ...(period.month ? { month: period.month } : {}),
              };
  return (
    <div className="pa-page r3">
      <button type="button" className="pa-back" onClick={onBack}>
        {X.back(22)} التقارير
      </button>
      <header className="r3-head">
        <h1>{item.t}</h1>
        <p className="pa-sub">{item.s}</p>
      </header>
      <div className="r3-controls">
        {item.k === "campaign" && (
          <PickButton
            label="التبرع أو اللوحة"
            value={camp ? camp.title : levy ? `لوحة ${levy.title}` : "اختر"}
            onClick={() => setSheet("subject")}
          />
        )}
        {item.k === "member" && (
          <PickButton
            label="العضو"
            value={member ? member.name : "اختر العضو"}
            onClick={() => setSheet("member")}
          />
        )}
        {(item.scope === "year" || item.scope === "yearOrMonth") && (
          <PickButton
            label="الفترة"
            value={periodText(period)}
            onClick={() => setSheet("period")}
          />
        )}
        {item.scope === "term" &&
          (d.terms.length > 1 ? (
            <PickButton
              label="الدورة"
              value={t?.title ?? "اختر الدورة"}
              onClick={() => setSheet("term")}
            />
          ) : (
            <p className="r3-fixed">{t ? t.title : "لا دورة بعد"}</p>
          ))}
        {item.scope === "none" && <p className="r3-fixed">من أول التبرع إلى اليوم</p>}
      </div>

      {req ? (
        <LoadedReport key={JSON.stringify(req)} req={req} />
      ) : (
        <p className="pa-hint">{item.k === "member" ? "اختر العضو أولًا." : "لا شيء لعرضه بعد."}</p>
      )}

      <PeriodSheet
        open={sheet === "period"}
        onClose={() => setSheet(null)}
        yearOnly={item.scope === "year"}
        value={period}
        onChange={(p) => {
          setPeriod(p);
          setSheet(null);
        }}
      />
      <Sheet open={sheet === "subject"} onClose={() => setSheet(null)} title="أي تبرع أو لوحة؟">
        <ul className="r3-pick">
          {[
            ...d.campaigns.map((c) => ({
              id: c.id,
              t: c.title,
              s: c.status === "open" ? "تبرع مفتوح" : "تبرع انتهى",
            })),
            ...d.levies.map((l) => ({
              id: l.id,
              t: l.title,
              s: l.status === "open" ? "لوحة مفتوحة" : "لوحة انتهت",
            })),
          ].map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={`r3-pick-i ${subject === o.id ? "on" : ""}`}
                aria-pressed={subject === o.id}
                onClick={() => {
                  setSubject(o.id);
                  setSheet(null);
                }}
              >
                <span className="r3-item-t">
                  <b>{o.t}</b>
                  <small>{o.s}</small>
                </span>
                {subject === o.id && X.check(20)}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
      <Sheet open={sheet === "term"} onClose={() => setSheet(null)} title="أي دورة؟">
        <ul className="r3-pick">
          {d.terms.map((x) => (
            <li key={x.number}>
              <button
                type="button"
                className={`r3-pick-i ${term === x.number ? "on" : ""}`}
                aria-pressed={term === x.number}
                onClick={() => {
                  setTerm(x.number);
                  setSheet(null);
                }}
              >
                <span className="r3-item-t">
                  <b>{x.title}</b>
                  <small>{x.endedOn ? "انتهت" : "الدورة الحالية"}</small>
                </span>
                {term === x.number && X.check(20)}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
      <MemberSheet
        open={sheet === "member"}
        onClose={() => setSheet(null)}
        value={memberRef}
        onPick={(r) => {
          setMemberRef(r);
          setSheet(null);
        }}
      />
    </div>
  );
}

function PickButton({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="r3-pickbtn"
      onClick={onClick}
      aria-label={`${label}: ${value}. تغيير`}
    >
      <span>{value}</span>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

function PeriodSheet({
  open,
  onClose,
  yearOnly,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  yearOnly: boolean;
  value: Period;
  onChange: (p: Period) => void;
}) {
  const { d } = useP();
  const [year, setYear] = useState(value.year);
  const years = Array.from(
    { length: Math.max(1, d.year - firstYear(d.terms, d.year) + 1) },
    (_, i) => d.year - i,
  );
  const last = year === d.year ? d.due : 12;
  return (
    <Sheet open={open} onClose={onClose} title={yearOnly ? "أي سنة؟" : "أي فترة؟"}>
      <div className="r3-years" role="radiogroup" aria-label="السنة">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            role="radio"
            aria-checked={year === y}
            className={year === y ? "on" : ""}
            onClick={() => (yearOnly ? onChange({ year: y, month: null }) : setYear(y))}
          >
            <Num>{y}</Num>
          </button>
        ))}
      </div>
      {!yearOnly && (
        <>
          <button
            type="button"
            className={`r3-whole ${value.month === null && value.year === year ? "on" : ""}`}
            onClick={() => onChange({ year, month: null })}
          >
            السنة كلها <Num>{year}</Num>
          </button>
          <p className="pa-hint">أو شهر واحد:</p>
          <div className="r3-months">
            {MONTHS_AR.map((name, i) => {
              const m = i + 1;
              const on = value.year === year && value.month === m;
              return (
                <button
                  key={name}
                  type="button"
                  disabled={m > last}
                  aria-pressed={on}
                  className={on ? "on" : ""}
                  onClick={() => onChange({ year, month: m })}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </>
      )}
      {yearOnly && <p className="pa-hint">هذا التقرير يغطي السنة كلها، من يناير إلى ديسمبر.</p>}
    </Sheet>
  );
}

const firstYear = (terms: { startedOn: string }[], fallback: number) =>
  Math.min(fallback, ...terms.map((t) => Number(t.startedOn.slice(0, 4)) || fallback));

function MemberSheet({
  open,
  onClose,
  value,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  value: string | null;
  onPick: (r: string) => void;
}) {
  const { d } = useP();
  const [recent] = useState(readRecent);
  const cur = d.members.filter((m) => m.ref === value);
  const mine = recent.flatMap((id) => d.members.filter((m) => m.id === id && m.ref !== value));
  return (
    <Sheet open={open} onClose={onClose} title="كشف أي عضو؟">
      <MemberPicker
        autoFocus
        selected={value ? [value] : []}
        start={[...cur, ...mine]}
        startHint={mine.length ? "آخر من سجّلت لهم" : undefined}
        onPick={(m) => onPick(m.ref)}
      />
    </Sheet>
  );
}
