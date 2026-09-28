import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ASSOC,
  dayDate,
  dayWords,
  fmt,
  groupLabel,
  isGone,
  MONTHS,
  statusLabel,
} from "@/components/app/derive";
import { Collapsible } from "@/components/app/collapsible";
import { ReportShare } from "@/components/app/report-share";
import * as src from "@/components/app/source";

export const metadata: Metadata = {
  title: "تقرير الصندوق · صندوق الشباب",
  description: "ما في الصندوق الآن، وما جُمع كل شهر، ومن دفع من الأعضاء، والمصاريف والحملات.",
  openGraph: {
    title: "تقرير صندوق الشباب",
    description: "ما في الصندوق الآن، ومن دفع رسوم هذا الشهر. افتح التقرير الكامل.",
    type: "article",
    locale: "ar_MR",
    siteName: "صندوق الشباب",
  },
};

const Num = ({ children }: { children: React.ReactNode }) => (
  <bdi dir="ltr" className="bq-num">
    {children}
  </bdi>
);

/**
 * The fund's full public report, ready to print on A4 (or save as PDF) and to share in the
 * WhatsApp group. TODO(lane-a): read everything from getReport() when it lands.
 */
export default async function ReportPage() {
  const r = await src.report();
  const { year, summary } = r;
  const today = new Date(r.generatedAt);
  // left / deceased are hidden, as on the public lists
  const shown = r.members.filter((m) => !isGone(m.status));
  const listOf = (m: { memberRef: string }) => m.memberRef.split("-")[0];
  const lists = [...new Set(shown.map(listOf))].sort();
  const month = today.getUTCMonth() + 1;
  const active = shown.filter((m) => m.status === "active");
  const paidNow = active.filter(
    (m) => m.months[month - 1] === "paid" || m.months[month - 1] === "prepaid",
  ).length;
  const payers = (k: number) =>
    shown.filter((m) => m.months[k - 1] === "paid" || m.months[k - 1] === "prepaid").length;
  const current = r.term;
  const termLabel = summary.termNumber ? `الدورة ${summary.termNumber}` : null;
  const monthly = r.monthly;
  const yearExpenses = r.expenses;
  const campaigns = r.campaigns;

  // the report shows paid / late / not yet only (owner): paid-ahead months are simply paid
  const dot = (st: string) =>
    st === "paid" || st === "prepaid" ? "is-paid" : st === "late" ? "is-late" : "";
  const cards: { k: string; v: number; sign?: string }[] = [
    { k: "رصيد سابق", v: summary.openingBalance },
    { k: "جُمع من الرسوم", v: summary.moneyIn, sign: "+" },
    ...(summary.transfersIn > 0 ? [{ k: "من الحملات", v: summary.transfersIn, sign: "+" }] : []),
    { k: "صُرف", v: summary.moneyOut, sign: "−" },
    ...(summary.adjustments !== 0
      ? [
          {
            k: "فرق عند التسليم",
            v: Math.abs(summary.adjustments),
            sign: summary.adjustments > 0 ? "+" : "−",
          },
        ]
      : []),
  ];

  return (
    <main className="rp">
      <Link href="/accounts" className="bq-link bq-link-s bq-press bq-back rp-back">
        رجوع إلى الحسابات
      </Link>

      <header className="rp-head">
        <span className="rp-logo">
          <Image src="/logo.jpg" alt="" width={64} height={64} priority />
        </span>
        <div>
          <h1>تقرير صندوق رابطة شباب البقيع</h1>
          <p>
            سنة <Num>{year}</Num>
            {termLabel ? ` · ${termLabel}` : ""}
            {current ? ` منذ ${dayWords(current.startedOn)} ${current.startedOn.slice(0, 4)}` : ""}
          </p>
          <p className="rp-sub">حتى {dayDate(today)}</p>
        </div>
      </header>

      <ReportShare data={r} />

      <section className="rp-sec" aria-label="الملخّص">
        <div className="rp-now">
          <span>في الصندوق الآن</span>
          <strong>
            <Num>{fmt(summary.balance)}</Num> <small>أوقية</small>
          </strong>
          <span>
            <Num>{paidNow}</Num> من <Num>{active.length}</Num> عضوًا دفعوا رسوم {MONTHS[month - 1]}
          </span>
        </div>
        <ul className="rp-cards">
          {cards.map((c) => (
            <li key={c.k}>
              <span>{c.k}</span>
              <strong>
                <Num>{`${c.sign ?? ""}${fmt(c.v)}`}</Num>
              </strong>
            </li>
          ))}
        </ul>
        <p className="rp-note">المبالغ بالأوقية القديمة. تبرعات الحملات في حسابها الخاص.</p>
      </section>

      <Collapsible title="ما جُمع كل شهر" open>
        <table className="rp-table">
          <thead>
            <tr>
              <th>الشهر</th>
              <th>المتوقَّع</th>
              <th>ما جُمع</th>
              <th>من دفع</th>
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((name, i) => {
              const m = monthly.find((x) => x.month === i + 1);
              return (
                <tr key={name}>
                  <td>{name}</td>
                  <td>
                    <Num>{fmt(m?.expected ?? 0)}</Num>
                  </td>
                  <td>
                    <Num>{fmt(m?.collected ?? 0)}</Num>
                  </td>
                  <td>
                    <Num>{payers(i + 1)}</Num>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Collapsible>

      <p className="rp-note rp-legend">
        <span className="rp-d is-paid" /> مدفوع <span className="rp-d is-late" /> متأخر{" "}
        <span className="rp-d" /> لم يحن بعد
      </p>
      {lists.map((l) => {
        const rows = shown.filter((m) => listOf(m) === l);
        return (
          <Collapsible key={l} title={`المجموعة ${groupLabel(l)}`} count={rows.length}>
            <ul className="rp-members">
              {rows.map((m) => (
                <li key={m.memberId}>
                  <span className="rp-ref">
                    <Num>{m.memberRef}</Num>
                  </span>
                  <span className="rp-mname">{m.fullName}</span>
                  <span className="rp-mst">
                    {statusLabel(
                      {
                        status: m.status,
                        monthsBehind: m.monthsBehind,
                        monthsPaidThisYear: m.monthsPaid,
                      },
                      12,
                    )}{" "}
                    · دفع <Num>{m.monthsPaid}</Num> من <Num>12</Num> شهرًا
                    {r.showAmountOwed && m.amountOwed ? (
                      <>
                        {" "}
                        · <Num>{fmt(m.amountOwed)}</Num>
                      </>
                    ) : null}
                  </span>
                  <span
                    className="rp-dots"
                    aria-label={m.months
                      .map(
                        (st, i) =>
                          `${MONTHS[i]}: ${st === "paid" || st === "prepaid" ? "مدفوع" : st === "late" ? "متأخر" : "لم يحن بعد"}`,
                      )
                      .join("، ")}
                  >
                    {m.months.map((st, i) => (
                      <span key={i} className={`rp-d ${dot(st)}`} title={MONTHS[i]} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Collapsible>
        );
      })}

      <Collapsible
        title={`المصاريف${!r.expensesComplete ? " (آخر 50)" : ""}`}
        count={yearExpenses.length}
      >
        {yearExpenses.length ? (
          <table className="rp-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th className="rp-name">البيان</th>
                <th>المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {yearExpenses.map((e, i) => (
                <tr key={`${e.spentOn}-${i}`}>
                  <td>{dayWords(e.spentOn)}</td>
                  <td className="rp-name">
                    {e.note ?? e.categoryLabel}
                    {e.note ? <span className="rp-cat"> · {e.categoryLabel}</span> : null}
                  </td>
                  <td>
                    <Num>{fmt(e.amount)}</Num>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="rp-note">لم يُصرف شيء هذا العام.</p>
        )}
      </Collapsible>

      {campaigns.length > 0 && (
        <Collapsible title="حملات التبرع" count={campaigns.length}>
          <ul className="rp-cards rp-camps">
            {campaigns.map((c) => (
              <li key={c.campaignId}>
                <span>
                  {c.title} · {c.status === "open" ? "مفتوحة" : "مغلقة"}
                </span>
                <strong>
                  <Num>{fmt(c.collected)}</Num>
                </strong>
                <span>
                  {c.targetAmount ? (
                    <>
                      من هدف <Num>{fmt(c.targetAmount)}</Num>.{" "}
                    </>
                  ) : null}
                  صُرف <Num>{fmt(c.spent)}</Num>
                </span>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      <footer className="rp-foot">
        صندوق الشباب · {ASSOC} · رابط التحقق: <ReportLink />
      </footer>
    </main>
  );
}

function ReportLink() {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");
  return (
    <bdi dir="ltr" className="bq-num">
      {site ? `${site.replace(/\/$/, "")}/report` : "/report"}
    </bdi>
  );
}
