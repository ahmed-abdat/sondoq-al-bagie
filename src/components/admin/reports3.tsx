"use client";
// PROTOTYPE round 3: the reports tab (owner's set and ?v=b3). A catalog in two groups, one
// period button with a small sheet, and a preview that looks like the shared PDF page.
import { useState, type ReactNode } from "react";
import { MONTHS_AR } from "@/lib/dates";
import {
  CATEGORY,
  day,
  fmt,
  isLate,
  levyOwed,
  memberHistory,
  month,
  monthsWords,
  Num,
  payStatus,
  refLabel,
  Sheet,
  useP,
  X,
} from "./kit";
import type { PCampaign, PData, PLevy, PMember } from "./types";
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
    s: "ما دخل وما صُرف وما بقي، لسنة أو لشهر",
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
    s: "ما دخل وما خرج من كل محفظة، لمطابقة رصيدها",
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
const YEARS = [2026, 2025, 2024];
const periodText = (p: Period) => (p.month ? `${month(p.month)} ${p.year}` : `سنة ${p.year}`);

export function Reports3() {
  const { d, q } = useP();
  const [k, setK] = useState<K | null>((CATALOG.find((c) => c.k === q.r)?.k as K) ?? null);
  const [period, setPeriod] = useState<Period>({ year: d.year, month: null });
  const [subject, setSubject] = useState<string>("c1");
  const [ref, setRef] = useState("A-9");
  const item = CATALOG.find((c) => c.k === k);

  if (!item) return <Catalog onPick={setK} />;
  const p: Period = item.scope === "yearOrMonth" ? period : { year: period.year, month: null };
  return (
    <Detail
      item={item}
      period={p}
      setPeriod={setPeriod}
      subject={subject}
      setSubject={setSubject}
      memberRef={ref}
      setMemberRef={setRef}
      onBack={() => setK(null)}
    />
  );
}

/* ───────── catalog ───────── */
function Catalog({ onPick }: { onPick: (k: K) => void }) {
  const group = (g: "group" | "committee", title: string, hint: string) => (
    <section className="r3-group" aria-labelledby={`r3-${g}`}>
      <div className="r3-group-h">
        <h2 id={`r3-${g}`}>{title}</h2>
        <p>{hint}</p>
      </div>
      <ul className="r3-list">
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
  onBack,
}: {
  item: (typeof CATALOG)[number];
  period: Period;
  setPeriod: (p: Period) => void;
  subject: string;
  setSubject: (s: string) => void;
  memberRef: string;
  setMemberRef: (s: string) => void;
  onBack: () => void;
}) {
  const { d, snack } = useP();
  const [sheet, setSheet] = useState<null | "period" | "subject" | "member">(null);
  const camp = d.campaigns.find((c) => c.id === subject);
  const levy = d.levies.find((l) => l.id === subject);
  const member = d.members.find((m) => m.ref === memberRef)!;
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
            value={camp ? camp.title : `لوحة ${levy?.title}`}
            onClick={() => setSheet("subject")}
          />
        )}
        {item.k === "member" && (
          <PickButton label="العضو" value={member.name} onClick={() => setSheet("member")} />
        )}
        {(item.scope === "year" || item.scope === "yearOrMonth") && (
          <PickButton
            label="الفترة"
            value={periodText(period)}
            onClick={() => setSheet("period")}
          />
        )}
        {item.scope === "term" && <p className="r3-fixed">الدورة 2، من يناير 2026 إلى اليوم</p>}
        {item.scope === "none" && <p className="r3-fixed">من أول الحملة إلى اليوم</p>}
      </div>

      <div className="r3-tray">
        <Paper item={item} period={period} camp={camp} levy={levy} member={member} />
      </div>

      <div className="r3-actions">
        <button
          type="button"
          className="pa-btn pa-btn-primary"
          onClick={() => snack("فُتحت مشاركة الصور. اختر مجموعة الواتساب.")}
        >
          {X.image(20)} صور لواتساب
        </button>
        <button
          type="button"
          className="pa-btn pa-btn-tonal"
          onClick={() => snack("حُفظ الملف في التنزيلات.")}
        >
          {X.pdf(20)} PDF
        </button>
        <button
          type="button"
          className="pa-btn pa-btn-tonal"
          onClick={() => snack("نُسخ النص. الصقه في واتساب.")}
        >
          {X.copy(20)} نص
        </button>
      </div>

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
  const last = year === d.year ? d.due : 12;
  return (
    <Sheet open={open} onClose={onClose} title={yearOnly ? "أي سنة؟" : "أي فترة؟"}>
      <div className="r3-years" role="radiogroup" aria-label="السنة">
        {YEARS.map((y) => (
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

function MemberSheet({
  open,
  onClose,
  value,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  onPick: (r: string) => void;
}) {
  const { d } = useP();
  const [q, setQ] = useState("");
  const list = d.members
    .filter((m) => m.status === "active")
    .filter((m) => !q.trim() || m.name.includes(q.trim()) || String(m.no) === q.replace(/\D/g, ""))
    .slice(0, 8);
  return (
    <Sheet open={open} onClose={onClose} title="كشف أي عضو؟">
      <label className="pa-search">
        {X.search(22)}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="اسم العضو أو رقمه"
          aria-label="ابحث عن العضو"
        />
      </label>
      <ul className="r3-pick">
        {list.map((m) => (
          <li key={m.ref}>
            <button
              type="button"
              className={`r3-pick-i ${value === m.ref ? "on" : ""}`}
              onClick={() => onPick(m.ref)}
            >
              <span className="pa-av">{refLabel(m.ref)}</span>
              <span className="r3-item-t">
                <b>{m.name}</b>
                <small>{payStatus(m)}</small>
              </span>
              {value === m.ref && X.check(20)}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/* ───────── the paper (what the PDF page looks like) ───────── */
const n = (v: number) => <Num>{fmt(v)}</Num>;
function Paper({
  item,
  period,
  camp,
  levy,
  member,
}: {
  item: (typeof CATALOG)[number];
  period: Period;
  camp?: PCampaign;
  levy?: PLevy;
  member: PMember;
}) {
  const { d } = useP();
  const sub =
    item.k === "campaign"
      ? camp
        ? `تبرع: ${camp.title}`
        : `لوحة: ${levy?.title}`
      : item.k === "member"
        ? `${member.name} · سنة ${period.year}`
        : item.k === "handover"
          ? "الدورة 2 · حتى 28 سبتمبر 2026"
          : periodText(period);
  return (
    <article className="r3-paper" aria-label={`معاينة: ${item.t}`}>
      <header className="r3-paper-h">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="" width={40} height={40} />
        <span>
          <b>صندوق رابطة شباب قرية البقيع</b>
          <strong>{item.t}</strong>
          <small>{sub}</small>
        </span>
      </header>
      {item.k === "annual" && <Annual d={d} />}
      {item.k === "summary" && <Summary d={d} period={period} />}
      {item.k === "grid" && <Grid d={d} />}
      {item.k === "late" && <Late d={d} />}
      {item.k === "expenses" && <Expenses d={d} period={period} />}
      {item.k === "campaign" &&
        (camp ? <Campaign c={camp} /> : levy ? <Levy l={levy} d={d} /> : null)}
      {item.k === "member" && <Statement m={member} d={d} />}
      {item.k === "handover" && <Handover d={d} />}
      {item.k === "wallets" && <Wallets d={d} period={period} />}
      {item.k === "work" && <Work d={d} />}
      <footer className="r3-paper-f">
        <span>أُعدّ في 28 سبتمبر 2026 · {d.me.name}</span>
        <span>المبالغ بالأوقية القديمة</span>
      </footer>
    </article>
  );
}

function Rows({
  rows,
  total,
}: {
  rows: [ReactNode, number, string?][];
  total?: [ReactNode, number];
}) {
  return (
    <dl className="r3-rows">
      {rows.map(([l, v, sign], i) => (
        <div key={i}>
          <dt>{l}</dt>
          <dd>
            <Num>{`${sign ?? ""}${fmt(v)}`}</Num>
          </dd>
        </div>
      ))}
      {total && (
        <div className="r3-total">
          <dt>{total[0]}</dt>
          <dd>{n(total[1])}</dd>
        </div>
      )}
    </dl>
  );
}
const Sec = ({ t, children }: { t: string; children: ReactNode }) => (
  <section className="r3-psec">
    <h3>{t}</h3>
    {children}
  </section>
);

function money(d: PData) {
  const fees = d.collectedYear;
  const levies = d.levies.reduce((s, l) => s + l.paidRefs.length * l.perMember, 0);
  const gifts = d.campaigns.reduce((s, c) => s + c.collected, 0);
  const byKind = new Map<string, number>();
  for (const e of d.expenses) {
    const k = e.campaign ? "التبرعات واللوحات" : CATEGORY[e.category];
    byKind.set(k, (byKind.get(k) ?? 0) + e.amount);
  }
  const spent = [...byKind.values()].reduce((s, v) => s + v, 0);
  const inTotal = fees + levies + gifts;
  return { fees, levies, gifts, byKind, spent, inTotal, closing: d.opening + inTotal - spent };
}

function Annual({ d }: { d: PData }) {
  const m = money(d);
  const monthsIn = d.monthly.map((x) => ({ ...x, all: x.collected }));
  const max = Math.max(...monthsIn.map((x) => x.all), 1);
  return (
    <>
      <Rows rows={[["رصيد أول السنة", d.opening]]} />
      <Sec t="ما دخل">
        <Rows
          rows={[
            ["الرسوم الشهرية", m.fees],
            ["اللوحات", m.levies],
            ["التبرعات", m.gifts],
          ]}
          total={["مجموع ما دخل", m.inTotal]}
        />
      </Sec>
      <Sec t="ما صُرف">
        <Rows
          rows={[...m.byKind.entries()].map(([k, v]) => [k, v] as [string, number])}
          total={["مجموع ما صُرف", m.spent]}
        />
      </Sec>
      <Rows rows={[]} total={["رصيد آخر السنة", m.closing]} />
      <Sec t="الرسوم التي دخلت كل شهر">
        <div className="r3-bars" aria-hidden="true">
          {monthsIn.map((x) => (
            <span key={x.month}>
              <i style={{ height: `${Math.round((x.all / max) * 100)}%` }} />
              <small>{x.month}</small>
            </span>
          ))}
        </div>
      </Sec>
      <Sec t="شهرًا بشهر">
        <table className="r3-table">
          <thead>
            <tr>
              <th>الشهر</th>
              <th>دخل</th>
              <th>صُرف</th>
            </tr>
          </thead>
          <tbody>
            {d.monthly.slice(0, d.due).map((x) => (
              <tr key={x.month}>
                <td>{month(x.month)}</td>
                <td>{n(x.collected)}</td>
                <td>{x.spent ? n(x.spent) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Sec>
    </>
  );
}

function Summary({ d, period }: { d: PData; period: Period }) {
  const yearly = period.month === null;
  const active = d.members.filter((m) => m.status === "active");
  const paid = active.filter((m) => m.paid.includes(period.month ?? d.due)).length;
  return (
    <>
      <Rows
        rows={[
          [
            yearly ? "في الصندوق أول السنة" : "في الصندوق أول الشهر",
            yearly ? d.opening : d.balance - d.monthIn + d.monthOut,
          ],
          ["دخل", yearly ? d.collectedYear : d.monthIn, "+"],
          ["صُرف", yearly ? d.spentYear : d.monthOut, "−"],
        ]}
        total={[yearly ? "في الصندوق آخر السنة" : "في الصندوق آخر الشهر", d.balance]}
      />
      <p className="r3-note">
        {yearly ? (
          <>
            دفع رسوم السنة كاملة <Num>{active.filter((m) => m.paid.length === 12).length}</Num>{" "}
            عضوًا.
          </>
        ) : (
          <>
            دفع رسوم {month(period.month!)} <Num>{paid}</Num> عضوًا.
          </>
        )}
      </p>
    </>
  );
}

function Grid({ d }: { d: PData }) {
  const act = d.members.filter((m) => m.status === "active");
  const show = act.filter((m) => m.group === "A").slice(0, 12);
  return (
    <>
      <p className="r3-note">المجموعة أ · الرسوم الشهرية {n(d.prices.A)}</p>
      <table className="r3-grid">
        <thead>
          <tr>
            <th>الاسم</th>
            {Array.from({ length: 12 }, (_, k) => (
              <th key={k}>{k + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {show.map((m) => (
            <tr key={m.ref}>
              <td>
                <Num>{m.no}</Num> {m.name}
              </td>
              {Array.from({ length: 12 }, (_, k) => (
                <td key={k}>{m.paid.includes(k + 1) ? "✓" : ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="r3-more">
        والباقون في الصفحات التالية: <Num>{act.length - show.length}</Num> عضوًا، في <Num>4</Num>{" "}
        صفحات.
      </p>
    </>
  );
}

function Late({ d }: { d: PData }) {
  const late = d.members.filter(
    (m) => m.status === "active" && (isLate(m) || levyOwed(m, d).length),
  );
  return (
    <>
      <table className="r3-table r3-late">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>الرسوم الباقية</th>
            <th>لوحة</th>
          </tr>
        </thead>
        <tbody>
          {late.slice(0, 14).map((m) => (
            <tr key={m.ref}>
              <td>
                <Num>{refLabel(m.ref)}</Num> {m.name}
              </td>
              <td>{monthsWords(m.owed)}</td>
              <td>{levyOwed(m, d).length ? "✓" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="r3-more">
        في الصفحات التالية <Num>{Math.max(0, late.length - 14)}</Num> اسمًا آخر. «لوحة» تعني أن عليه
        نصيب لوحة.
      </p>
    </>
  );
}

function Expenses({ d, period }: { d: PData; period: Period }) {
  const list = d.expenses.filter((e) => !period.month || Number(e.at.slice(5, 7)) === period.month);
  const byKind = new Map<string, number>();
  for (const e of list) {
    const k = e.campaign
      ? d.campaigns.find((c) => c.id === e.campaign)!.title
      : CATEGORY[e.category];
    byKind.set(k, (byKind.get(k) ?? 0) + e.amount);
  }
  const total = list.reduce((s, e) => s + e.amount, 0);
  const months = [...new Set(list.map((e) => Number(e.at.slice(5, 7))))].sort((a, b) => b - a);
  if (!list.length) return <p className="r3-note">لم يُصرف شيء في هذه الفترة.</p>;
  return (
    <>
      <Sec t="حسب النوع">
        <Rows
          rows={[...byKind.entries()].map(([k, v]) => [k, v] as [string, number])}
          total={["المجموع", total]}
        />
      </Sec>
      {months.map((mo) => (
        <Sec key={mo} t={month(mo)}>
          <Rows
            rows={list
              .filter((e) => Number(e.at.slice(5, 7)) === mo)
              .map((e) => [
                <>
                  {e.note} <small>{day(e.at)}</small>
                </>,
                e.amount,
              ])}
          />
        </Sec>
      ))}
    </>
  );
}

function Campaign({ c }: { c: PCampaign }) {
  return (
    <>
      <Rows
        rows={[
          ["الهدف", c.target],
          ["جُمع", c.collected],
          ["صُرف", c.spent, "−"],
        ]}
        total={["بقي في التبرع", c.collected - c.spent]}
      />
      <Sec t={`من ساهم (${c.gifts.length})`}>
        <Rows
          rows={c.gifts.map((g) => [
            <>
              {g.name} <small>{day(g.at)}</small>
            </>,
            g.amount,
          ])}
        />
      </Sec>
      {c.spends.length > 0 && (
        <Sec t="ما صُرف منه">
          <Rows
            rows={c.spends.map((s) => [
              <>
                {s.note} <small>{day(s.at)}</small>
              </>,
              s.amount,
            ])}
          />
        </Sec>
      )}
    </>
  );
}

function Levy({ l, d }: { l: PLevy; d: PData }) {
  const people = l.refs.map((r) => d.members.find((m) => m.ref === r)!).filter(Boolean);
  const paid = people.filter((m) => l.paidRefs.includes(m.ref));
  return (
    <>
      <Rows
        rows={[
          ["على كل عضو", l.perMember],
          ["جُمع", paid.length * l.perMember],
        ]}
        total={["بقي على الأعضاء", (people.length - paid.length) * l.perMember]}
      />
      <p className="r3-note">
        دفع <Num>{paid.length}</Num> عضوًا، ولم يدفع بعد <Num>{people.length - paid.length}</Num>.
      </p>
      <table className="r3-table">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>دفع</th>
          </tr>
        </thead>
        <tbody>
          {people.slice(0, 12).map((m) => (
            <tr key={m.ref}>
              <td>
                <Num>{refLabel(m.ref)}</Num> {m.name}
              </td>
              <td className="r3-c">{l.paidRefs.includes(m.ref) ? "✓" : "لم يدفع بعد"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="r3-more">والباقون في الصفحات التالية.</p>
    </>
  );
}

function Statement({ m, d }: { m: PMember; d: PData }) {
  const hist = memberHistory(m, d).filter((h) => h.state === "confirmed");
  const lv = levyOwed(m, d);
  return (
    <>
      <p className="r3-note">
        رقم <Num>{refLabel(m.ref)}</Num> · الرسوم الشهرية {n(m.fee)} · {payStatus(m)}
      </p>
      <table className="r3-grid r3-grid-1">
        <tbody>
          {[0, 6].map((start) => (
            <FragmentRows key={start} start={start} m={m} />
          ))}
        </tbody>
      </table>
      <Sec t="الدفعات">
        <Rows
          rows={hist.map((h) => [
            <>
              {h.levy ? `لوحة ${h.levy}` : `رسوم ${monthsWords(h.months)}`}{" "}
              <small>
                {day(h.at)} · سجّلها {h.by}
              </small>
            </>,
            h.amount,
          ])}
        />
      </Sec>
      {(m.owed.length > 0 || lv.length > 0) && (
        <Sec t="ما عليه">
          <Rows
            rows={[
              ...(m.owed.length
                ? [[`رسوم ${monthsWords(m.owed)}`, m.owed.length * m.fee] as [string, number]]
                : []),
              ...lv.map((l) => [`لوحة ${l.title}`, l.perMember] as [string, number]),
            ]}
          />
        </Sec>
      )}
    </>
  );
}

function FragmentRows({ start, m }: { start: number; m: PMember }) {
  const ks = Array.from({ length: 6 }, (_, i) => start + i + 1);
  return (
    <>
      <tr>
        {ks.map((k) => (
          <th key={k}>{month(k)}</th>
        ))}
      </tr>
      <tr>
        {ks.map((k) => (
          <td key={k}>{m.paid.includes(k) ? "✓" : ""}</td>
        ))}
      </tr>
    </>
  );
}

const WALLETS = [
  { k: "بنكيلي", share: 0.46, out: 0.55 },
  { k: "مصرفي", share: 0.22, out: 0.1 },
  { k: "السداد", share: 0.08, out: 0 },
  { k: "نقدًا", share: 0.24, out: 0.35 },
];
function walletRows(d: PData, month: boolean) {
  const inn = month ? d.monthIn : money(d).inTotal;
  const out = month ? d.monthOut : money(d).spent;
  const bal = money(d).closing;
  return WALLETS.map((w) => ({
    k: w.k,
    in: Math.round((inn * w.share) / 500) * 500,
    out: Math.round((out * w.out) / 500) * 500,
    bal: Math.round((bal * (w.share * 0.9 + (w.k === "نقدًا" ? 0.1 : 0))) / 500) * 500,
  }));
}
function Handover({ d }: { d: PData }) {
  const m = money(d);
  const late = d.members.filter((x) => x.status === "active" && x.owed.length);
  const lateAmt = late.reduce((s, x) => s + x.owed.length * x.fee, 0);
  const w = walletRows(d, false);
  return (
    <>
      <Rows
        rows={[
          ["رصيد أول الدورة", d.opening],
          ["دخل في الدورة", m.inTotal, "+"],
          ["صُرف في الدورة", m.spent, "−"],
        ]}
        total={["الرصيد الذي يُسلَّم", m.closing]}
      />
      <Sec t="أين المال؟">
        <Rows rows={w.map((x) => [x.k, x.bal] as [string, number])} />
      </Sec>
      <Sec t="ما بقي على الأعضاء">
        <Rows
          rows={[
            [
              <>
                رسوم متأخرة <small>{late.length} عضوًا</small>
              </>,
              lateAmt,
            ],
            ...d.levies
              .filter((l) => l.status === "open")
              .map(
                (l) =>
                  [
                    <>
                      لوحة {l.title} <small>{l.refs.length - l.paidRefs.length} عضوًا</small>
                    </>,
                    (l.refs.length - l.paidRefs.length) * l.perMember,
                  ] as [ReactNode, number],
              ),
          ]}
        />
      </Sec>
      <Sec t="تبرعات مفتوحة">
        <Rows
          rows={d.campaigns
            .filter((c) => c.status === "open")
            .map((c) => [
              <>
                {c.title} <small>بقي فيه</small>
              </>,
              c.collected - c.spent,
            ])}
        />
      </Sec>
      <p className="r3-sign">
        <span>سلّم: ………………</span>
        <span>استلم: ………………</span>
      </p>
    </>
  );
}
function Wallets({ d, period }: { d: PData; period: Period }) {
  const w = walletRows(d, period.month !== null);
  return (
    <>
      <table className="r3-table r3-num">
        <thead>
          <tr>
            <th>المحفظة</th>
            <th>دخل</th>
            <th>خرج</th>
            <th>الرصيد</th>
          </tr>
        </thead>
        <tbody>
          {w.map((x) => (
            <tr key={x.k}>
              <td>{x.k}</td>
              <td>{n(x.in)}</td>
              <td>{x.out ? n(x.out) : ""}</td>
              <td>{n(x.bal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>المجموع</td>
            <td>{n(w.reduce((s, x) => s + x.in, 0))}</td>
            <td>{n(w.reduce((s, x) => s + x.out, 0))}</td>
            <td>{n(w.reduce((s, x) => s + x.bal, 0))}</td>
          </tr>
        </tfoot>
      </table>
      <p className="r3-note">قارن «الرصيد» برصيد كل محفظة في هاتفك. النقد يعدّه من يحمله.</p>
    </>
  );
}
function Work({ d }: { d: PData }) {
  const rows = [
    { who: "سيدي محمد", pays: 31, amount: 58500, exp: 3, cancel: 1 },
    { who: "يحيى", pays: 22, amount: 34000, exp: 0, cancel: 0 },
    { who: "المختار", pays: 17, amount: 21500, exp: 1, cancel: 0 },
    { who: "مستخدم تجريبي", pays: 2, amount: 3000, exp: 0, cancel: 0 },
  ];
  void d;
  return (
    <>
      <table className="r3-table r3-num">
        <thead>
          <tr>
            <th>العضو</th>
            <th>دفعات</th>
            <th>مبلغها</th>
            <th>مصاريف</th>
            <th>ألغى</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.who}>
              <td>{r.who}</td>
              <td>{n(r.pays)}</td>
              <td>{n(r.amount)}</td>
              <td>{r.exp ? n(r.exp) : ""}</td>
              <td>{r.cancel ? n(r.cancel) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Sec t="ما أُلغي">
        <Rows
          rows={[
            [
              <>
                دفعة يحيى ولد باب <small>ألغاها سيدي محمد، 27 سبتمبر · سُجّلت مرتين</small>
              </>,
              500,
            ],
          ]}
        />
      </Sec>
    </>
  );
}
