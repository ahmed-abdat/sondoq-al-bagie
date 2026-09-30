"use client";
// PROTOTYPE direction B «الصندوق أولًا»: the balance is the first thing; two big buttons; the
// record flow is ONE long page with a sticky summary footer; reports are 7 cards + a period row.
import Link from "next/link";
import { useState } from "react";
import { Bar, fmt, Money, month, Num, useP, X } from "./kit";
import { ExpenseSheet } from "./expense-sheet";
import { ReportSheet } from "./report-doc";
import { LogRow } from "./more";
import "./dir-b.css";

/* ───────── home ───────── */
export function Home() {
  const { d, href } = useP();
  const [exp, setExp] = useState(false);
  const [share, setShare] = useState(false);
  const fees = d.stats.fees;
  const openC = d.campaigns.filter((c) => c.status === "open");
  const openL = d.levies.filter((l) => l.status === "open");
  return (
    <div className="pa-page pb-home">
      <section className="pb-hero" aria-label="الصندوق">
        <div className="pb-hero-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="" width={40} height={40} />
          <span>
            <b>صندوق الرابطة</b>
            <small>
              {d.me.name} · {d.me.role}
            </small>
          </span>
        </div>
        <p className="pb-hero-l">في الصندوق</p>
        <p className="pb-hero-n">
          <Num>{fmt(d.balance)}</Num>
          <span> أوقية</span>
        </p>
        <p className="pb-hero-m">
          هذا الشهر: دخل <Num>{fmt(d.monthIn)}</Num> · صرف <Num>{fmt(d.monthOut)}</Num>
        </p>
      </section>
      <div className="pb-big">
        <Link href={href("record")} className="pa-btn pa-btn-primary pb-big-btn">
          {X.plus(24)} سجّل دفعة
        </Link>
        <button
          type="button"
          className="pa-btn pa-btn-tonal pb-big-btn"
          onClick={() => setExp(true)}
        >
          {X.bag(24)} سجّل مصروفًا
        </button>
      </div>

      <section className="pa-sec">
        <h2>الرسوم</h2>
        {/* the numbers of the «الإحصاءات» report (report_fee_stats), one tap to the full page */}
        <Link href={href("stats")} className="pb-month">
          <span className="pb-month-t">
            دفع <Num>{fees.paid}</Num> من <Num>{fees.total}</Num> حتى {month(d.due)} ·{" "}
            <Num>{`${fees.pct}٪`}</Num>
          </span>
          <Bar value={fees.paid} max={fees.total} />
          <span className="pb-month-s">الإحصاءات {X.go(18)}</span>
        </Link>
        <Link href={href("late")} className="pa-row">
          <span className="pa-ic">{X.clock(22)}</span>
          <span className="pa-row-t">
            <b>
              <Num>{d.stats.owing}</Num> عضوًا عليهم متأخرات
            </b>
            <small>رسوم أو نصيب لوحة</small>
          </span>
          {X.go(20)}
        </Link>
        <button
          type="button"
          className="pa-btn pa-btn-soft pa-btn-block"
          onClick={() => setShare(true)}
        >
          {X.share(20)} شارك المتأخرات في المجموعة
        </button>
      </section>

      <section className="pa-sec">
        <div className="pa-sec-h">
          <h2>آخر العمليات</h2>
          <Link href={href("activity")} className="pa-link">
            عرض الكل {X.go(18)}
          </Link>
        </div>
        <ul className="pa-rows">
          {d.log.slice(0, 5).map((l, i) => (
            <li key={i}>
              <LogRow l={l} who={false} />
            </li>
          ))}
        </ul>
      </section>

      <section className="pa-sec">
        <div className="pa-sec-h">
          <h2>التبرعات المفتوحة</h2>
          <Link href={href("campaigns")} className="pa-link">
            الكل {X.go(18)}
          </Link>
        </div>
        <ul className="pa-rows">
          {openC.map((c) => (
            <li key={c.id}>
              <Link href={href(`campaigns/${c.id}`)} className="pa-row">
                <span className="pa-ic pa-ic-gold">{X.heart(22)}</span>
                <span className="pa-row-t">
                  <b>{c.title}</b>
                  <small>
                    جُمع <Money v={c.collected} /> من <Money v={c.target} />
                  </small>
                  <Bar value={c.collected} max={c.target} gold />
                </span>
                {X.go(20)}
              </Link>
            </li>
          ))}
          {openL.map((l) => (
            <li key={l.id}>
              <Link href={href(`campaigns/${l.id}`)} className="pa-row">
                <span className="pa-ic pa-ic-g">{X.list(22)}</span>
                <span className="pa-row-t">
                  <b>لوحة {l.title}</b>
                  <small>
                    دفع <Num>{d.stats.levies[l.id]?.paid ?? 0}</Num>، ولم يدفع{" "}
                    <Num>{d.stats.levies[l.id]?.notYet ?? 0}</Num>
                  </small>
                </span>
                {X.go(20)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <ExpenseSheet open={exp} onClose={() => setExp(false)} />
      <ReportSheet
        open={share}
        onClose={() => setShare(false)}
        title="شارك المتأخرات"
        req={{ kind: "late", year: d.year }}
      />
    </div>
  );
}
